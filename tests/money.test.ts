import { describe, expect, it } from "vitest";
import {
  add,
  formatAmount,
  parseAmount,
  paise,
  rupeesToPaise,
  subtract,
  sum,
} from "../src/lib/money.js";

describe("money is exact", () => {
  it("holds amounts that a float would lose", () => {
    // 0.1 + 0.2 !== 0.3 in floating point. In paise it is just 10 + 20 === 30.
    expect(add(parseAmount("0.10"), parseAmount("0.20"))).toBe(paise(30));
    expect(formatAmount(add(parseAmount("0.10"), parseAmount("0.20")))).toBe("0.30");
  });

  it("survives summing a long voucher without drift", () => {
    // Voucher 1 in the sample: 21 bills, most of them 500.00.
    const bills = Array.from({ length: 21 }, () => parseAmount("500.00"));
    expect(formatAmount(sum(bills))).toBe("10500.00");
  });

  it("reproduces the sample year's identity", () => {
    const opening = rupeesToPaise(12998);
    const received = rupeesToPaise(29417);
    const spent = rupeesToPaise(39763);
    const returned = rupeesToPaise(2498);
    const closing = subtract(subtract(add(opening, received), spent), returned);
    expect(formatAmount(closing)).toBe("154.00");
  });
});

describe("parseAmount", () => {
  it("accepts the forms a user types", () => {
    expect(parseAmount("1500")).toBe(paise(150000));
    expect(parseAmount("1500.50")).toBe(paise(150050));
    expect(parseAmount("1,500.50")).toBe(paise(150050));
    expect(parseAmount("  1500  ")).toBe(paise(150000));
    expect(parseAmount("0.05")).toBe(paise(5));
    expect(parseAmount("0.5")).toBe(paise(50)); // one decimal means tenths of a rupee
  });

  it("refuses what is not an amount instead of rounding it", () => {
    expect(() => parseAmount("")).toThrow();
    expect(() => parseAmount("abc")).toThrow();
    expect(() => parseAmount("1.234")).toThrow(); // more precision than paise
    expect(() => parseAmount("1/2")).toThrow(); // a bill number, not an amount
  });
});

describe("formatAmount", () => {
  it("prints two decimals with no thousands separator, as every report does", () => {
    expect(formatAmount(rupeesToPaise(12998))).toBe("12998.00");
    expect(formatAmount(rupeesToPaise(0))).toBe("0.00");
    expect(formatAmount(paise(5))).toBe("0.05");
    expect(formatAmount(paise(150050))).toBe("1500.50");
  });

  it("prints a negative balance, so a broken cash book shows itself", () => {
    // The client's rojmel page 15 prints -1646.00 and hides it with a typed 0.
    expect(formatAmount(rupeesToPaise(-1646))).toBe("-1646.00");
  });
});

describe("rupeesToPaise", () => {
  it("rejects fractional rupees rather than silently truncating", () => {
    expect(() => rupeesToPaise(10.5)).toThrow(RangeError);
  });
});
