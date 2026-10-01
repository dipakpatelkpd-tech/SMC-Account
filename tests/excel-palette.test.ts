/**
 * Excel's colour grid: every column runs light to dark under its theme colour,
 * and the shades are Excel's own.
 */
import { describe, expect, it } from "vitest";
import {
  STANDARD_COLOURS,
  hexToRgb,
  hsvToRgb,
  normaliseHex,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  themeGrid,
  tint,
} from "../src/shared/excel-palette.js";

const lightness = (hex: string): number => rgbToHsl(hexToRgb(hex))[2];

describe("the theme grid", () => {
  const grid = themeGrid();

  it("has ten colours, each with five shades under it", () => {
    expect(grid).toHaveLength(10);
    for (const column of grid) expect(column).toHaveLength(6);
    expect(STANDARD_COLOURS).toHaveLength(10);
  });

  it("runs each coloured column from very light to very dark", () => {
    for (const column of grid.slice(2)) {
      const shades = column.slice(1).map((colour) => lightness(colour.hex));
      for (let index = 1; index < shades.length; index += 1) {
        expect(shades[index]!).toBeLessThan(shades[index - 1]!);
      }
    }
  });

  it("matches Excel's own shades", () => {
    // Blue (#4472C4): Lighter 80% is #DAE3F3, Darker 50% is #203864 in Excel.
    const blue = grid[4]!;
    expect(blue[1]!.hex).toBe("#dae3f3");
    expect(blue[5]!.hex).toBe("#203864");
    // White darkens by 5%: #F2F2F2; black lightens by 50%: #808080 (Excel #7F7F7F).
    expect(grid[0]![1]!.hex).toBe("#f2f2f2");
    expect(["#7f7f7f", "#808080"]).toContain(grid[1]![1]!.hex);
  });
});

describe("conversions", () => {
  it("go there and back", () => {
    for (const hex of ["#4472c4", "#ed7d31", "#000000", "#ffffff", "#7030a0"]) {
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex);
    }
    expect(tint("#4472c4", 0)).toBe("#4472c4");
  });

  it("reads a typed colour, or says it is not one", () => {
    expect(normaliseHex("ABC")).toBe("#aabbcc");
    expect(normaliseHex(" #1A2B3C ")).toBe("#1a2b3c");
    expect(normaliseHex("blue")).toBeNull();
  });
});
