/**
 * What has been typed into each kind of field, as rows that can be merged.
 *
 * The same rows live in two places: in memory in the running app, and in the
 * Suggestion table of each school's database - which is what makes them travel
 * on the pen drive to another PC. Two copies of the same list meet whenever a
 * school is opened, so merging has to give the same answer whichever copy is
 * merged into which, and however often: it takes the larger of each count and
 * the later of each date, and never adds counts together.
 *
 * Forgetting a suggestion is remembered too (`removed`), or the next merge would
 * bring it back from the other copy. A value used again after it was forgotten
 * is live again.
 *
 * Pure: the ranking and the merge are tested in Node.
 */
import { z } from "zod";

export interface SuggestionRow {
  /** The kind of field: "vendor.name", "bank.name", "school.taluka" ... */
  field: string;
  value: string;
  /** How many times it was entered or chosen. */
  count: number;
  /** When it was last used, ms since the epoch. */
  last: number;
  /** When it was forgotten, ms since the epoch. Present only on a forgotten one. */
  removed?: number;
}

/** Per kind of field: plenty for a school's vendors, bounded all the same. */
export const MAX_PER_FIELD = 150;
export const MAX_VALUE_LENGTH = 300;
export const MAX_FIELD_LENGTH = 100;
/** Forgotten values kept per field, and for how long, so they stay forgotten. */
const MAX_FORGOTTEN_PER_FIELD = 100;
const FORGOTTEN_KEPT_MS = 180 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The same text, however it was typed: NFC, trimmed, spaces collapsed. */
export function normalise(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Latin letters compare without case; Gujarati has none. */
export function fold(value: string): string {
  return normalise(value).toLocaleLowerCase("en");
}

/** Used often and lately ranks first; a week's age halves the weight. */
export function weight(row: Pick<SuggestionRow, "count" | "last">, now: number): number {
  return row.count / (1 + Math.max(0, now - row.last) / (7 * DAY_MS));
}

/** What is accepted from outside - the renderer, or a database row read back. */
export const suggestionRowSchema = z.object({
  field: z.string().min(1).max(MAX_FIELD_LENGTH),
  value: z.string().min(1).max(MAX_VALUE_LENGTH),
  count: z.number().int().min(0).max(1_000_000),
  last: z.number().int().min(0),
  removed: z.number().int().min(0).optional(),
});

/** The valid rows of whatever was given; the rest are dropped, never fatal. */
export function validRows(input: unknown): SuggestionRow[] {
  if (!Array.isArray(input)) return [];
  const rows: SuggestionRow[] = [];
  for (const item of input) {
    const parsed = suggestionRowSchema.safeParse(item);
    if (!parsed.success) continue;
    const value = normalise(parsed.data.value);
    if (value === "") continue;
    rows.push({ ...parsed.data, value });
  }
  return rows;
}

/**
 * Two lists of rows as one.
 *
 * Per field and value: the larger count, the later use, the later spelling; and
 * the value is forgotten when it was forgotten after it was last used. Past the
 * limits the least used and least recent go first.
 */
export function mergeRows(a: readonly SuggestionRow[], b: readonly SuggestionRow[], now: number): SuggestionRow[] {
  const merged = new Map<string, SuggestionRow>();
  for (const row of [...a, ...b]) {
    const key = `${row.field}\u0000${fold(row.value)}`;
    const held = merged.get(key);
    if (!held) {
      merged.set(key, { ...row, value: normalise(row.value) });
      continue;
    }
    const later = row.last > held.last ? row : held;
    const removed = Math.max(row.removed ?? -1, held.removed ?? -1);
    merged.set(key, {
      field: row.field,
      value: normalise(later.value),
      count: Math.max(row.count, held.count),
      last: Math.max(row.last, held.last),
      ...(removed >= 0 ? { removed } : {}),
    });
  }

  const byField = new Map<string, { live: SuggestionRow[]; forgotten: SuggestionRow[] }>();
  for (const row of merged.values()) {
    // Used after it was forgotten: live again.
    const forgotten = row.removed !== undefined && row.removed >= row.last;
    const kept: SuggestionRow = forgotten
      ? { field: row.field, value: row.value, count: row.count, last: row.last, removed: row.removed! }
      : { field: row.field, value: row.value, count: row.count, last: row.last };
    const group = byField.get(row.field) ?? { live: [], forgotten: [] };
    if (!forgotten) group.live.push(kept);
    else if (now - row.removed! <= FORGOTTEN_KEPT_MS) group.forgotten.push(kept);
    byField.set(row.field, group);
  }

  const result: SuggestionRow[] = [];
  for (const group of byField.values()) {
    group.live.sort((x, y) => weight(y, now) - weight(x, now) || x.value.localeCompare(y.value));
    group.forgotten.sort((x, y) => y.removed! - x.removed! || x.value.localeCompare(y.value));
    result.push(...group.live.slice(0, MAX_PER_FIELD), ...group.forgotten.slice(0, MAX_FORGOTTEN_PER_FIELD));
  }
  return result;
}

/** The same rows in a fixed order, to tell whether a merge changed anything. */
export function fingerprint(rows: readonly SuggestionRow[]): string {
  return JSON.stringify(
    [...rows]
      .map((row) => [row.field, fold(row.value), row.value, row.count, row.last, row.removed ?? null])
      .sort((x, y) => String(x[0] + "\u0000" + x[1]).localeCompare(String(y[0] + "\u0000" + y[1]))),
  );
}
