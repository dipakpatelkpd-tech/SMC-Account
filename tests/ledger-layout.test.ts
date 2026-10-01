/**
 * The ledger's four-to-a-sheet arrangement: every account placed exactly once,
 * four to a sheet, long and short accounts mixed, columns balanced.
 */
import { describe, expect, it } from "vitest";
import { arrangeLedgers } from "../src/shared/ledger-layout.js";

const all = (sheets: ReturnType<typeof arrangeLedgers>): number[] =>
  sheets.flatMap(([left, right]) => [...left, ...right]).sort((a, b) => a - b);

describe("four accounts to a sheet", () => {
  it("places every account once, four to every sheet but the last", () => {
    const sizes = [12, 3, 8, 5, 4, 9, 2, 7, 6];
    const sheets = arrangeLedgers(sizes);
    expect(all(sheets)).toEqual(sizes.map((_, index) => index));
    expect(sheets.map(([left, right]) => left.length + right.length)).toEqual([4, 4, 1]);
  });

  it("puts the largest with the smallest, and the larger of a column on top", () => {
    // Sizes 10, 8, 3, 1: columns [10, 1] and [8, 3] - 11 against 11.
    const [sheet] = arrangeLedgers([3, 10, 1, 8]);
    expect(sheet).toEqual([
      [1, 2],
      [3, 0],
    ]);
  });

  it("mixes long and short accounts across sheets", () => {
    const sizes = [20, 19, 18, 17, 4, 3, 2, 1];
    const sheets = arrangeLedgers(sizes);
    const tallest = sheets.map(([left, right]) =>
      Math.max(
        left.reduce((sum, index) => sum + sizes[index]!, 0),
        right.reduce((sum, index) => sum + sizes[index]!, 0),
      ),
    );
    // Not 20+19 and 18+17 on one sheet: each sheet's taller column holds a long and a short one.
    expect(Math.max(...tallest)).toBeLessThanOrEqual(24);
  });

  it("copes with fewer than four", () => {
    expect(arrangeLedgers([])).toEqual([]);
    expect(arrangeLedgers([5])).toEqual([[[0], []]]);
    expect(arrangeLedgers([2, 5, 3])).toEqual([[[1], [2, 0]]]);
  });
});
