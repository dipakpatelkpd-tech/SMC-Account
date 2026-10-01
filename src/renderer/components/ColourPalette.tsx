import { useEffect, useRef, useState } from "react";
import type { JSX, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  STANDARD_COLOURS,
  hexToRgb,
  hsvToRgb,
  normaliseHex,
  rgbToHex,
  rgbToHsv,
  themeGrid,
} from "../../shared/excel-palette.js";
import { useStrings } from "../i18n/index.js";

/**
 * Excel's colour button: the button paints the last colour chosen, the arrow
 * beside it opens the palette - theme colours with their five shades, the
 * standard colours, the ones used lately - and "More colours…" opens a picker
 * for any colour at all. One component, so every colour choice in the app
 * looks and works the same.
 */

/** The value `undefined` means "as the form has it" (Excel's "Automatic"). */
export type ColourValue = string | undefined;

/** Colours chosen lately, newest first - shared by every palette while the app runs. */
const recent: string[] = [];
function remember(hex: string): void {
  const at = recent.indexOf(hex);
  if (at >= 0) recent.splice(at, 1);
  recent.unshift(hex);
  recent.length = Math.min(recent.length, 10);
}

const GRID = themeGrid();

export function ColourButton({
  icon,
  title,
  value,
  onChange,
  noneValue,
  noneLabel,
  disabled = false,
}: {
  /** What the button shows above its colour bar: "A" for text, a bucket for fill. */
  icon: ReactNode;
  title: string;
  value: ColourValue;
  onChange: (colour: ColourValue) => void;
  /** A "no colour" choice (a blank cell), and the value it stands for. */
  noneValue?: string;
  noneLabel?: string;
  disabled?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  // The colour the button applies when pressed: the last one picked here.
  const [last, setLast] = useState<string | undefined>(value && value !== noneValue ? value : undefined);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (colour: ColourValue): void => {
    if (colour && colour !== noneValue) {
      remember(colour);
      setLast(colour);
    }
    onChange(colour);
    setOpen(false);
  };

  const bar = value === noneValue && noneValue !== undefined ? "transparent" : (value ?? last ?? "#000000");

  return (
    <div className="colour-button" ref={ref}>
      <button
        type="button"
        className="ribbon-button colour-button-main"
        title={title}
        disabled={disabled}
        onClick={() => (last ? pick(last) : setOpen(true))}
      >
        <span className="colour-button-icon">{icon}</span>
        <span className="colour-button-bar" style={{ background: bar }} />
      </button>
      <button
        type="button"
        className="ribbon-button colour-button-arrow"
        title={title}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        ▾
      </button>
      {open && <Palette value={value} onPick={pick} noneValue={noneValue} noneLabel={noneLabel} />}
    </div>
  );
}

function Palette({
  value,
  onPick,
  noneValue,
  noneLabel,
}: {
  value: ColourValue;
  onPick: (colour: ColourValue) => void;
  noneValue?: string;
  noneLabel?: string;
}): JSX.Element {
  const t = useStrings();
  const [custom, setCustom] = useState(false);
  const chosen = value?.toLowerCase();
  const swatch = (hex: string, label: string): JSX.Element => (
    <button
      key={hex + label}
      type="button"
      className={`palette-swatch${chosen === hex ? " chosen" : ""}`}
      style={{ background: hex }}
      title={label}
      aria-label={label}
      onClick={() => onPick(hex)}
    />
  );

  return (
    <div className="palette-popover" role="dialog">
      <button type="button" className="palette-automatic" onClick={() => onPick(undefined)}>
        <span className="palette-swatch automatic" /> {t.paletteAutomatic}
      </button>
      {noneValue !== undefined && (
        <button type="button" className="palette-automatic" onClick={() => onPick(noneValue)}>
          <span className="palette-swatch none" /> {noneLabel ?? t.layoutFillBlank}
        </button>
      )}
      <div className="palette-heading">{t.paletteTheme}</div>
      {/* Row by row: the theme colours, then each of the five shades. */}
      <div className="palette-grid theme-top">{GRID.map((column) => swatch(column[0]!.hex, column[0]!.label))}</div>
      <div className="palette-grid">
        {[1, 2, 3, 4, 5].flatMap((row) => GRID.map((column) => swatch(column[row]!.hex, column[row]!.label)))}
      </div>
      <div className="palette-heading">{t.paletteStandard}</div>
      <div className="palette-grid">{STANDARD_COLOURS.map((colour) => swatch(colour.hex, colour.name))}</div>
      {recent.length > 0 && (
        <>
          <div className="palette-heading">{t.paletteRecent}</div>
          <div className="palette-grid">{recent.map((hex) => swatch(hex, hex))}</div>
        </>
      )}
      <button type="button" className="palette-more" onClick={() => setCustom(true)}>
        🎨 {t.paletteMore}
      </button>
      {custom && (
        <CustomColour
          initial={value && value !== noneValue ? value : "#4472c4"}
          onCancel={() => setCustom(false)}
          onPick={(hex) => onPick(hex)}
        />
      )}
    </div>
  );
}

/** Excel's "More Colors…": a colour square, a hue strip, and the colour as numbers. */
function CustomColour({
  initial,
  onCancel,
  onPick,
}: {
  initial: string;
  onCancel: () => void;
  onPick: (hex: string) => void;
}): JSX.Element {
  const t = useStrings();
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(initial)));
  const hex = rgbToHex(hsvToRgb(hsv));
  const [typed, setTyped] = useState(hex);
  useEffect(() => setTyped(hex), [hex]);
  const rgb = hexToRgb(hex);

  const dragOn = (
    element: HTMLElement,
    event: ReactPointerEvent,
    apply: (x: number, y: number) => void,
  ): void => {
    const move = (clientX: number, clientY: number): void => {
      const rect = element.getBoundingClientRect();
      apply(
        Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
        Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
      );
    };
    move(event.clientX, event.clientY);
    const onMove = (next: PointerEvent): void => move(next.clientX, next.clientY);
    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const setRgb = (index: number, raw: string): void => {
    const next = [...rgb] as [number, number, number];
    next[index] = Math.min(255, Math.max(0, Number(raw) || 0));
    setHsv(rgbToHsv(next));
  };

  return (
    <div className="custom-colour-backdrop" onMouseDown={(event) => event.stopPropagation()}>
      <div className="custom-colour" role="dialog" aria-label={t.paletteMore}>
        <h3>{t.paletteMore}</h3>
        <div className="custom-colour-body">
          <div
            className="custom-colour-square"
            style={{ background: `hsl(${hsv[0]}, 100%, 50%)` }}
            onPointerDown={(event) =>
              dragOn(event.currentTarget, event, (x, y) => setHsv(([h]) => [h, x, 1 - y]))
            }
          >
            <div className="custom-colour-white" />
            <div className="custom-colour-black" />
            <div
              className="custom-colour-marker"
              style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }}
            />
          </div>
          <div
            className="custom-colour-hue"
            onPointerDown={(event) =>
              dragOn(event.currentTarget, event, (_x, y) => setHsv(([, s, v]) => [Math.min(359.9, y * 360), s, v]))
            }
          >
            <div className="custom-colour-hue-marker" style={{ top: `${(hsv[0] / 360) * 100}%` }} />
          </div>
          <div className="custom-colour-fields">
            <div className="custom-colour-compare">
              <span style={{ background: hex }} title={t.paletteNew} />
              <span style={{ background: initial }} title={t.paletteCurrent} />
            </div>
            <label>
              {t.paletteHex}
              <input
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value);
                  const parsed = normaliseHex(event.target.value);
                  if (parsed) setHsv(rgbToHsv(hexToRgb(parsed)));
                }}
              />
            </label>
            {(["R", "G", "B"] as const).map((name, index) => (
              <label key={name}>
                {name}
                <input
                  inputMode="numeric"
                  value={Math.round(rgb[index]!)}
                  onChange={(event) => setRgb(index, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="custom-colour-actions">
          <button type="button" className="primary" onClick={() => onPick(hex)}>
            {t.paletteOk}
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
