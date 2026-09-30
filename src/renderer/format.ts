/**
 * Display helpers for the screens.
 *
 * The data-entry screens use Latin digits throughout - they are a working
 * surface, not a printed register, and a user typing amounts should see the same
 * digits as on their keyboard. The Gujarati-digit conversion (SPEC section 6)
 * belongs to the printed reports, and lives in src/lib/gujarati.ts.
 */
import { formatAmount, parseAmount } from "../lib/money.js";
import { formatDate } from "../lib/dates.js";

export { formatAmount, formatDate };

/** Parse a typed amount, returning null instead of throwing on nonsense. */
export function tryParseAmount(input: string): number | null {
  try {
    return parseAmount(input);
  } catch {
    return null;
  }
}

/** Paise to the plain editable string a text field should hold ("1500.00"). */
export function amountToInput(paise: number): string {
  return formatAmount(paise);
}

/** Cheque-type labels come from the dictionary; see useChequeTypeLabels. */
export function chequeTypeLabels(t: {
  typeReimbursement: string;
  typeDirect: string;
  typeGrantReturn: string;
}): Record<string, string> {
  return {
    REIMBURSEMENT: t.typeReimbursement,
    DIRECT: t.typeDirect,
    GRANT_RETURN: t.typeGrantReturn,
  };
}

/**
 * A moment - a backup, a lock - as DD/MM/YYYY HH:MM in this PC's time zone.
 * Dates of entries use formatDate; this is only for timestamps.
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return iso;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${pad(moment.getDate())}/${pad(moment.getMonth() + 1)}/${moment.getFullYear()} ` +
    `${pad(moment.getHours())}:${pad(moment.getMinutes())}`
  );
}

/** A file size a person can read: 143 KB, 2.4 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
