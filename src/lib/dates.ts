/**
 * Date-only values, stored as ISO "YYYY-MM-DD" strings.
 *
 * Deliberately string-based. ISO dates sort chronologically as text, compare with
 * plain <= and >=, and cannot shift by a day when a timezone changes underneath
 * them - which matters because a cash-book entry that moves from 31/03 to 01/04
 * lands in a different financial year.
 */

export type IsoDate = string & { readonly __brand: "IsoDate" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoDate(value: string): IsoDate {
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError(`"${value}" is not an ISO date (YYYY-MM-DD)`);
  const [, year = "", month = "", day = ""] = match;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new RangeError(`"${value}" is not a real calendar date`);
  }
  return value as IsoDate;
}

export function isIsoDate(value: string): boolean {
  try {
    isoDate(value);
    return true;
  } catch {
    return false;
  }
}

/** Print as DD/MM/YYYY, the only date format any report uses (SPEC section 6). */
export function formatDate(value: string): string {
  const [year = "", month = "", day = ""] = value.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * A date as a person types it - day first, always: "09/06/2025", "9/6/25",
 * "9-6-2025", "09.06.2025" or "09062025". Null until it is a real calendar date.
 * Two-digit years are this century's. Never reads month first: 05/06 is the
 * fifth of June, whatever the PC's locale says.
 */
export function parseTypedDate(text: string): IsoDate | null {
  const trimmed = text.trim();
  const parts = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(trimmed) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed);
  if (!parts) return null;
  const [, day = "", month = "", yearText = ""] = parts;
  const year = yearText.length === 2 ? `20${yearText}` : yearText;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isIsoDate(iso) ? (iso as IsoDate) : null;
}

/**
 * What a date box shows while digits are being typed: the slashes go in by
 * themselves, "0906" becomes "09/06" and "09062025" becomes "09/06/2025". Text
 * that already has its own separators is left as typed.
 */
export function maskTypedDate(text: string): string {
  // Digits only, or digits with the slashes this mask put in ("09/06" + "2"):
  // lay them out again. Separators typed by hand ("9/6/25") are left alone.
  const masked = /^\d*$/.test(text) || /^\d{2}\/\d+$/.test(text) || /^\d{2}\/\d{2}\/\d*$/.test(text);
  if (!masked) return text.slice(0, 10);
  const digits = text.replace(/\//g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Print as DD/MM/YY, used in the rojmel's bill-number column ("15/08/25"). */
export function formatDateShort(value: string): string {
  const [year = "", month = "", day = ""] = value.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isWithin(value: string, start: string, end: string): boolean {
  return value >= start && value <= end;
}

export function addDays(value: string, days: number): IsoDate {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date.toISOString().slice(0, 10));
}

/** Last day of the month `value` falls in - the rojmel's nil blocks end here. */
export function endOfMonth(value: string): IsoDate {
  const date = new Date(`${value}T00:00:00Z`);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return isoDate(end.toISOString().slice(0, 10));
}

/** First day of the month `value` falls in. */
export function startOfMonth(value: string): IsoDate {
  return isoDate(`${value.slice(0, 7)}-01`);
}

/**
 * The Indian financial year a date belongs to: April to March, labelled "2025-26".
 */
export function financialYearOf(value: string): string {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** The 1 April that opens the financial year with this label. */
export function financialYearStart(label: string): IsoDate {
  return isoDate(`${label.slice(0, 4)}-04-01`);
}

/** The 31 March that closes the financial year with this label. */
export function financialYearEnd(label: string): IsoDate {
  return isoDate(`${Number(label.slice(0, 4)) + 1}-03-31`);
}
