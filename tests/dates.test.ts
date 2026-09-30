import { describe, expect, it } from "vitest";
import {
  compareDates,
  endOfMonth,
  financialYearEnd,
  financialYearOf,
  financialYearStart,
  formatDate,
  formatDateShort,
  isoDate,
  isWithin,
} from "../src/lib/dates.js";

describe("ISO date storage", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(isoDate("2025-04-01")).toBe("2025-04-01");
    expect(() => isoDate("2025-02-30")).toThrow(RangeError);
    expect(() => isoDate("01/04/2025")).toThrow(RangeError);
    expect(() => isoDate("1/2")).toThrow(RangeError); // a bill number is not a date
  });

  it("sorts chronologically as plain text, which is why dates are strings", () => {
    const dates = ["2026-03-23", "2025-04-01", "2026-01-30", "2025-12-20"];
    expect([...dates].sort(compareDates)).toEqual([
      "2025-04-01",
      "2025-12-20",
      "2026-01-30",
      "2026-03-23",
    ]);
  });
});

describe("printing dates", () => {
  it("prints DD/MM/YYYY, the only format the reports use", () => {
    expect(formatDate("2025-04-01")).toBe("01/04/2025");
    expect(formatDate("2026-03-31")).toBe("31/03/2026");
  });

  it("prints DD/MM/YY for the rojmel's bill column", () => {
    expect(formatDateShort("2025-08-15")).toBe("15/08/25");
  });
});

describe("the Indian financial year", () => {
  it("runs April to March", () => {
    expect(financialYearOf("2025-04-01")).toBe("2025-26");
    expect(financialYearOf("2026-03-31")).toBe("2025-26");
    expect(financialYearOf("2026-04-01")).toBe("2026-27");
    // One day either side of the boundary lands in a different year - the reason
    // dates are stored as strings and never as a timezone-bearing DateTime.
    expect(financialYearOf("2025-03-31")).toBe("2024-25");
  });

  it("derives its start and end from the label", () => {
    expect(financialYearStart("2025-26")).toBe("2025-04-01");
    expect(financialYearEnd("2025-26")).toBe("2026-03-31");
  });

  it("knows which dates fall inside the year", () => {
    const start = financialYearStart("2025-26");
    const end = financialYearEnd("2025-26");
    expect(isWithin("2025-06-09", start, end)).toBe(true);
    // Voucher 1 pays bills from the previous year; they are outside, and the
    // bill register still has to print them.
    expect(isWithin("2024-06-25", start, end)).toBe(false);
  });
});

describe("endOfMonth", () => {
  it("closes the rojmel's nil blocks correctly, including February", () => {
    expect(endOfMonth("2025-05-05")).toBe("2025-05-31");
    expect(endOfMonth("2025-04-02")).toBe("2025-04-30");
    expect(endOfMonth("2026-02-06")).toBe("2026-02-28");
    expect(endOfMonth("2024-02-01")).toBe("2024-02-29"); // leap year
  });
});
