/**
 * Money is an integer number of paise, everywhere, with no exceptions.
 *
 * Rupees only ever appear at the two edges: parsing what the user typed, and
 * formatting what a report prints. Nothing in between is allowed to see a
 * fractional number, because that is how a cash book stops balancing.
 */

/** Paise in one rupee. */
const PAISE_PER_RUPEE = 100;

/** An amount of money, in paise. A branded number, so rupees cannot be passed by mistake. */
export type Paise = number & { readonly __brand: "Paise" };

export function paise(value: number): Paise {
  if (!Number.isInteger(value)) {
    throw new RangeError(`paise must be a whole number, got ${value}`);
  }
  return value as Paise;
}

export const ZERO = paise(0);

/**
 * Convert whole rupees to paise. Used by the seed, where every sample amount is a
 * whole rupee, and by any import that carries rupee integers.
 */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isInteger(rupees)) {
    throw new RangeError(
      `rupeesToPaise expects whole rupees, got ${rupees}. Use parseAmount for user input.`,
    );
  }
  return paise(rupees * PAISE_PER_RUPEE);
}

/**
 * Parse what a user typed into paise: "1500", "1500.50", "1,500.50", " 1500 ".
 * Rejects anything that is not money rather than silently rounding it.
 */
export function parseAmount(input: string): Paise {
  const cleaned = input.trim().replace(/,/g, "");
  if (cleaned === "") throw new RangeError("amount is empty");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new RangeError(`"${input}" is not an amount with at most two decimals`);
  }
  const negative = cleaned.startsWith("-");
  const [whole = "0", fraction = ""] = cleaned.replace(/^-/, "").split(".");
  const magnitude = Number(whole) * PAISE_PER_RUPEE + Number(fraction.padEnd(2, "0"));
  return paise(negative ? -magnitude : magnitude);
}

export function add(...amounts: Paise[]): Paise {
  return paise(amounts.reduce<number>((total, amount) => total + amount, 0));
}

export function subtract(from: Paise, amount: Paise): Paise {
  return paise(from - amount);
}

export function sum(amounts: readonly Paise[]): Paise {
  return paise(amounts.reduce<number>((total, amount) => total + amount, 0));
}

/** Sum a field across a list, the shape most report totals take. */
export function sumBy<T>(items: readonly T[], select: (item: T) => number): Paise {
  return paise(items.reduce((total, item) => total + select(item), 0));
}

export function isZero(amount: number): boolean {
  return amount === 0;
}

export function isNegative(amount: number): boolean {
  return amount < 0;
}

/**
 * Format for printing: two decimals, no thousands separators, exactly as every
 * reference report does ("12998.00"). Latin digits - call the Gujarati digit
 * converter afterwards for the reports that need it (SPEC section 6).
 */
export function formatAmount(amount: number): string {
  const negative = amount < 0;
  const magnitude = Math.abs(amount);
  const rupees = Math.trunc(magnitude / PAISE_PER_RUPEE);
  const remainder = magnitude % PAISE_PER_RUPEE;
  return `${negative ? "-" : ""}${rupees}.${String(remainder).padStart(2, "0")}`;
}

/** Whole rupees, for places that show a rounded figure. Never used in a register. */
export function toRupeesNumber(amount: number): number {
  return amount / PAISE_PER_RUPEE;
}
