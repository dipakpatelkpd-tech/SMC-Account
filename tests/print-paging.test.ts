/**
 * How a long form is split into sheets at 14pt (src/renderer/print/PagedSheets.tsx).
 *
 * The browser does the measuring; these are the rules applied to the measurements:
 * rows are never split, every sheet repeats its heading, and the totals and
 * signatures end up under the last rows without running off the sheet.
 */
import { describe, expect, it } from "vitest";
import { packRows, type Measured } from "../src/renderer/print/PagedSheets.js";

const SHEET = 740;

function measured(rows: number, overrides: Partial<Measured> = {}): Measured {
  return {
    headPx: 100,
    theadPx: 40,
    rowPx: Array.from({ length: rows }, () => 50),
    lastRowsPx: 0,
    footPx: 0,
    everyFootPx: 0,
    ...overrides,
  };
}

/** The height each sheet would really be, to check none overflows. */
function heights(input: Measured, sheets: number[][]): number[] {
  return sheets.map(
    (sheet, index) =>
      input.headPx +
      input.theadPx +
      input.everyFootPx +
      sheet.reduce((sum, row) => sum + input.rowPx[row]!, 0) +
      (index === sheets.length - 1 ? input.lastRowsPx + input.footPx : 0),
  );
}

describe("packing rows onto sheets", () => {
  it("keeps a short form on one sheet", () => {
    expect(packRows(measured(5), SHEET)).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("starts a new sheet when the next row would not fit, and keeps every row once", () => {
    const input = measured(30);
    const sheets = packRows(input, SHEET);
    expect(sheets.flat()).toEqual(Array.from({ length: 30 }, (_, index) => index));
    expect(sheets.length).toBeGreaterThan(1);
    for (const height of heights(input, sheets)) expect(height).toBeLessThanOrEqual(SHEET);
  });

  it("uses the real height of tall, wrapped rows", () => {
    const input = measured(6, { rowPx: [50, 300, 50, 300, 50, 50] });
    const sheets = packRows(input, SHEET);
    for (const height of heights(input, sheets)) expect(height).toBeLessThanOrEqual(SHEET);
    expect(sheets.flat()).toHaveLength(6);
  });

  it("puts totals and signatures under the last rows when they fit", () => {
    const sheets = packRows(measured(4, { lastRowsPx: 40, footPx: 120 }), SHEET);
    expect(sheets).toEqual([[0, 1, 2, 3]]);
  });

  it("moves the last row with the totals when they do not fit, never overflowing", () => {
    // 11 rows fill the first sheet exactly; totals and a certificate do not fit under them.
    const input = measured(11, { lastRowsPx: 40, footPx: 250 });
    const sheets = packRows(input, SHEET);
    expect(sheets).toHaveLength(2);
    expect(sheets[1]).toEqual([10]);
    for (const height of heights(input, sheets)) expect(height).toBeLessThanOrEqual(SHEET);
  });

  it("gives an empty form one sheet with its heading", () => {
    expect(packRows(measured(0, { lastRowsPx: 40 }), SHEET)).toEqual([[]]);
  });
});
