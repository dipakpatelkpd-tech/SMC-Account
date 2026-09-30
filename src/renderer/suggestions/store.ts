/**
 * What has been typed into each kind of field before, for suggesting it again.
 *
 * Kept on the PC (localStorage), not in a school's books: the suggestions are a
 * convenience for whoever types, shared by every school and every account on
 * this PC - a vendor typed for one school is offered for the next. They never
 * travel on the pen drive or to the cloud, and losing them loses nothing.
 *
 * A field's KIND is its key: "bill.vendor", "cheque.payee", "school.name" - by
 * meaning, so two screens asking for the same thing share one list.
 *
 * Pure apart from the Storage it is given, so the ranking is tested in Node.
 */

export interface Entry {
  value: string;
  /** How many times it was entered or chosen. */
  count: number;
  /** When it was last used, ms since the epoch. */
  last: number;
}

type Data = Record<string, Entry[]>;

export const STORAGE_KEY = "smc.suggestions.v1";

/** Per kind of field: plenty for a school's vendors, bounded all the same. */
export const MAX_PER_FIELD = 150;
const MAX_VALUE_LENGTH = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The same text, however it was typed: NFC, trimmed, spaces collapsed. */
export function normalise(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Latin letters compare without case; Gujarati has none. */
function fold(value: string): string {
  return normalise(value).toLocaleLowerCase("en");
}

/** Used often and lately ranks first; a week's age halves the weight. */
function weight(entry: Entry, now: number): number {
  return entry.count / (1 + Math.max(0, now - entry.last) / (7 * DAY_MS));
}

export class SuggestionStore {
  constructor(
    private readonly storage: Pick<Storage, "getItem" | "setItem"> | null,
    private readonly now: () => number = Date.now,
  ) {}

  private read(): Data {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed !== null && typeof parsed === "object" ? (parsed as Data) : {};
    } catch {
      // Unreadable (or no storage at all): start again rather than fail a form.
      return {};
    }
  }

  private write(data: Data): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: suggestions are a convenience, not a record.
    }
  }

  /** Remember a value entered in a field of this kind. */
  record(field: string, value: string): void {
    const clean = normalise(value);
    if (clean === "" || clean.length > MAX_VALUE_LENGTH) return;
    const data = this.read();
    const list = Array.isArray(data[field]) ? data[field]! : [];
    const now = this.now();
    const existing = list.find((entry) => fold(entry.value) === fold(clean));
    if (existing) {
      existing.value = clean; // the latest spelling
      existing.count += 1;
      existing.last = now;
    } else {
      list.push({ value: clean, count: 1, last: now });
    }
    // Over the limit: the least used and least recent go first.
    list.sort((a, b) => weight(b, now) - weight(a, now));
    data[field] = list.slice(0, MAX_PER_FIELD);
    this.write(data);
  }

  /** Forget one suggestion - a typo, or something that should not be offered. */
  remove(field: string, value: string): void {
    const data = this.read();
    const list = data[field];
    if (!Array.isArray(list)) return;
    data[field] = list.filter((entry) => fold(entry.value) !== fold(value));
    this.write(data);
  }

  /**
   * What to offer for `typed` so far: values that start with it, then values
   * with a word that starts with it, then values containing it - each group by
   * use. Nothing identical to what is already typed.
   */
  suggest(field: string, typed: string, limit = 8): string[] {
    const list = this.read()[field];
    if (!Array.isArray(list)) return [];
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
    return list
      .map((entry) => ({ entry, rank: rank(entry.value) }))
      .filter((item) => item.rank >= 0)
      .sort((a, b) => a.rank - b.rank || weight(b.entry, now) - weight(a.entry, now))
      .slice(0, limit)
      .map((item) => item.entry.value);
  }
}
