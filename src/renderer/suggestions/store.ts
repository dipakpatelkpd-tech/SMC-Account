/**
 * What has been typed into each kind of field before, for suggesting it again.
 *
 * Held in memory only. Nothing is written to this PC: the lists are saved in the
 * school's own database (the Suggestion table, see sync.ts), so they are as
 * private as the books - encrypted with them - and travel on the pen drive to
 * any other PC. The store is what the running app suggests from; a school being
 * opened merges its saved list in, and what is typed here is merged back out.
 *
 * A field's KIND is its key: "bill.vendor", "cheque.payee", "school.name" - by
 * meaning, so two screens asking for the same thing share one list.
 *
 * Pure, so the ranking is tested in Node.
 */
import {
  MAX_VALUE_LENGTH,
  STARTER_SUGGESTIONS,
  fingerprint,
  fold,
  mergeRows,
  normalise,
  weight,
  type SuggestionRow,
} from "../../shared/suggestions.js";

export { normalise };

export class SuggestionStore {
  private rows: SuggestionRow[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Called after something is typed or forgotten here - not after a merge. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  /** Forget everything held here - the next person to sign in starts afresh. */
  clear(): void {
    this.rows = [];
  }

  /** Everything held, forgotten values included, to be saved or merged elsewhere. */
  export(): SuggestionRow[] {
    return this.rows.map((row) => ({ ...row }));
  }

  /** Take in another copy of the lists. Returns whether anything changed. */
  merge(other: readonly SuggestionRow[]): boolean {
    const before = fingerprint(this.rows);
    this.rows = mergeRows(this.rows, other, this.now());
    return fingerprint(this.rows) !== before;
  }

  private find(field: string, value: string): SuggestionRow | undefined {
    const wanted = fold(value);
    return this.rows.find((row) => row.field === field && fold(row.value) === wanted);
  }

  /** Remember a value entered in a field of this kind. */
  record(field: string, value: string): void {
    const clean = normalise(value);
    if (clean === "" || clean.length > MAX_VALUE_LENGTH) return;
    const now = this.now();
    const existing = this.find(field, clean);
    if (existing) {
      existing.value = clean; // the latest spelling
      // Used again after being forgotten: a new start, not the old count.
      existing.count = existing.removed === undefined ? existing.count + 1 : 1;
      existing.last = now;
      delete existing.removed;
    } else {
      this.rows.push({ field, value: clean, count: 1, last: now });
    }
    // Past the limits the least used go first, as when merging.
    this.rows = mergeRows(this.rows, [], now);
    this.changed();
  }

  /** Forget one suggestion - a typo, or something that should not be offered. */
  remove(field: string, value: string): void {
    const existing = this.find(field, value);
    if (!existing && isStarter(field, value)) {
      // A built-in one never typed here: kept as forgotten all the same.
      const now = this.now();
      this.rows.push({ field, value: normalise(value), count: 0, last: now, removed: now });
      this.changed();
      return;
    }
    if (!existing || existing.removed !== undefined) return;
    // Kept as forgotten, so merging with another copy does not bring it back.
    existing.removed = Math.max(this.now(), existing.last);
    this.changed();
  }

  /**
   * What to offer for `typed` so far: values that start with it, then values
   * with a word that starts with it, then values containing it - each group by
   * use. Nothing identical to what is already typed.
   */
  suggest(field: string, typed: string, limit = 8): string[] {
    const query = fold(typed);
    const now = this.now();
    const rank = (value: string): number => {
      const folded = fold(value);
      if (query === "") return 0;
      if (folded === query) return -1;
      if (folded.startsWith(query)) return 0;
      if (folded.split(/[\s/,.\-()]+/).some((word) => word.startsWith(query))) return 1;
      return folded.includes(query) ? 2 : -1;
    };
    // The built-in ones this school has neither typed nor forgotten, after its own.
    const starters = (STARTER_SUGGESTIONS[field] ?? [])
      .filter((value) => !this.find(field, value))
      .map((value) => ({ row: { field, value, count: 0, last: 0 }, starter: true }));
    return [
      ...this.rows
        .filter((row) => row.field === field && row.removed === undefined)
        .map((row) => ({ row, starter: false })),
      ...starters,
    ]
      .map((item) => ({ ...item, rank: rank(item.row.value) }))
      .filter((item) => item.rank >= 0)
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          Number(a.starter) - Number(b.starter) ||
          weight(b.row, now) - weight(a.row, now),
      )
      .slice(0, limit)
      .map((item) => item.row.value);
  }
}

function isStarter(field: string, value: string): boolean {
  const wanted = fold(value);
  return (STARTER_SUGGESTIONS[field] ?? []).some((starter) => fold(starter) === wanted);
}
