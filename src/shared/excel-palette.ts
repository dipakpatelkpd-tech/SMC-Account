/**
 * Excel's colour palette, for every colour choice in the app.
 *
 * Excel's "Theme Colors" grid: ten theme colours across the top, and under each
 * five shades of it, lightest to darkest - so a column runs from very light to
 * very dark. Then a row of ten "Standard Colors". The shades are worked out as
 * Excel does: a tint moves a colour's lightness towards white, a shade towards
 * black, in HSL. White and black, which cannot be made lighter or darker, get
 * Excel's own steps (white: 5-50% darker; black: 50-5% lighter).
 *
 * Pure, so the grid is tested without a browser (tests/excel-palette.test.ts).
 */

/** The Office theme's ten colours, in Excel's order. */
export const THEME_COLOURS = [
  { hex: "#ffffff", name: "સફેદ (White)" },
  { hex: "#000000", name: "કાળો (Black)" },
  { hex: "#e7e6e6", name: "આછો ભૂખરો (Light grey)" },
  { hex: "#44546a", name: "ઘેરો વાદળી-ભૂખરો (Blue-grey)" },
  { hex: "#4472c4", name: "વાદળી (Blue)" },
  { hex: "#ed7d31", name: "નારંગી (Orange)" },
  { hex: "#a5a5a5", name: "ભૂખરો (Grey)" },
  { hex: "#ffc000", name: "સોનેરી (Gold)" },
  { hex: "#5b9bd5", name: "આકાશી (Sky blue)" },
  { hex: "#70ad47", name: "લીલો (Green)" },
] as const;

/** Excel's Standard Colors row. */
export const STANDARD_COLOURS = [
  { hex: "#c00000", name: "ઘેરો લાલ (Dark red)" },
  { hex: "#ff0000", name: "લાલ (Red)" },
  { hex: "#ffc000", name: "નારંગી (Orange)" },
  { hex: "#ffff00", name: "પીળો (Yellow)" },
  { hex: "#92d050", name: "આછો લીલો (Light green)" },
  { hex: "#00b050", name: "લીલો (Green)" },
  { hex: "#00b0f0", name: "આછો વાદળી (Light blue)" },
  { hex: "#0070c0", name: "વાદળી (Blue)" },
  { hex: "#002060", name: "ઘેરો વાદળી (Dark blue)" },
  { hex: "#7030a0", name: "જાંબલી (Purple)" },
] as const;

/**
 * How each shade row changes its theme colour: positive lightens by that share
 * of the way to white, negative darkens by that share of the way to black.
 */
const STEPS = [0.8, 0.6, 0.4, -0.25, -0.5];
const WHITE_STEPS = [-0.05, -0.15, -0.25, -0.35, -0.5];
const BLACK_STEPS = [0.5, 0.35, 0.25, 0.15, 0.05];

export interface PaletteColour {
  hex: string;
  /** "Blue, Lighter 40%" - what a tooltip says. */
  label: string;
}

/** The theme grid: ten columns, each the theme colour then its five shades. */
export function themeGrid(): PaletteColour[][] {
  return THEME_COLOURS.map((theme) => {
    const steps = theme.hex === "#ffffff" ? WHITE_STEPS : theme.hex === "#000000" ? BLACK_STEPS : STEPS;
    return [
      { hex: theme.hex, label: theme.name },
      ...steps.map((step) => ({
        hex: tint(theme.hex, step),
        label: `${theme.name}, ${step > 0 ? "આછો" : "ઘેરો"} ${Math.round(Math.abs(step) * 100)}%`,
      })),
    ];
  });
}

/** Lighten (step > 0) or darken (step < 0) a colour in HSL, as Excel's tints do. */
export function tint(hex: string, step: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const lightness = step >= 0 ? l * (1 - step) + step : l * (1 + step);
  return rgbToHex(hslToRgb([h, s, Math.min(1, Math.max(0, lightness))]));
}

// --------------------------------------------------------------- conversions

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as Rgb;
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((part) => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Hue 0-360, saturation and lightness 0-1. */
export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rr ? ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60 : max === gg ? ((bb - rr) / d + 2) * 60 : ((rr - gg) / d + 4) * 60;
  return [h, s, l];
}

export function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    const k = ((t % 1) + 1) % 1;
    if (k < 1 / 6) return p + (q - p) * 6 * k;
    if (k < 1 / 2) return q;
    if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6;
    return p;
  };
  const hue = h / 360;
  return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255];
}

/** Hue 0-360, saturation and value 0-1 - what the custom colour square edits. */
export function hsvToRgb([h, s, v]: [number, number, number]): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function rgbToHsv([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  const h =
    d === 0 ? 0 : max === rr ? 60 * (((gg - bb) / d + 6) % 6) : max === gg ? 60 * ((bb - rr) / d + 2) : 60 * ((rr - gg) / d + 4);
  return [h, max === 0 ? 0 : d / max, max];
}

/** "#AbC123", "abc123" or "#abc" - to "#abc123"; null when it is not a colour. */
export function normaliseHex(input: string): string | null {
  const value = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
  if (/^[0-9a-f]{3}$/.test(value)) return `#${[...value].map((char) => char + char).join("")}`;
  return null;
}
