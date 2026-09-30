/**
 * Gujarati digits and number words for the printed reports.
 *
 * SPEC section 6: the rojmel prints Latin digits while every other report prints
 * Gujarati digits - including inside dates and amounts. Making that a per-report
 * setting rather than a global one is the whole point of this module.
 */

const GUJARATI_DIGITS = ["૦", "૧", "૨", "૩", "૪", "૫", "૬", "૭", "૮", "૯"] as const;

/** Which digits a given report prints in. */
export type DigitStyle = "latin" | "gujarati";

/** Convert every Latin digit in a string to Gujarati, leaving the rest alone. */
export function toGujaratiDigits(text: string): string {
  return text.replace(/[0-9]/g, (digit) => GUJARATI_DIGITS[Number(digit)]!);
}

/** Convert Gujarati digits back to Latin, for parsing what a user typed. */
export function toLatinDigits(text: string): string {
  return text.replace(/[૦-૯]/g, (digit) => String(GUJARATI_DIGITS.indexOf(digit as never)));
}

/** Apply a report's digit style to any already-formatted string. */
export function inDigits(text: string, style: DigitStyle): string {
  return style === "gujarati" ? toGujaratiDigits(text) : text;
}
