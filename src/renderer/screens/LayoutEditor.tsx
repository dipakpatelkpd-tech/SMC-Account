import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  JSX,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { api } from "../api.js";
import type { PrintableReportId } from "../../shared/api.js";
import {
  LAYOUT_FONTS,
  NO_FILL,
  REPORT_COLUMNS,
  REPORT_PARTS,
  REPORT_DEFAULTS,
  columnWidths,
  cssString,
  emptyLayout,
  moveColumnEdge,
  setColumnWidth,
  styleAt,
  tableWidthMm,
  targetKey,
  withRowGap,
  withStyle,
  type Alignment,
  type CellStyle,
  type LayoutFontId,
  type LayoutTarget,
  type ReportLayout,
} from "../../shared/report-layout.js";
import { useLanguage, useStrings } from "../i18n/index.js";
import { LAYOUT_ROOT_ID, PrintRoot, type LayoutCheck } from "../print/PrintRoot.js";
import { sheetZoom } from "../print/PagedSheets.js";

/**
 * The layout editor: the report's own print preview, which can be clicked and
 * dragged, beside a panel of settings.
 *
 * Everything changes a draft `ReportLayout` that the preview renders at once -
 * the preview is the same DOM the PDF is made from, so what the school sees
 * while editing is what will print. Nothing reaches the books until "Save".
 *
 *   - drag the line between two columns: one widens, its neighbour narrows,
 *     and the table still spans the sheet;
 *   - click a cell, then choose whether a change applies to that cell, its row
 *     or its column: highlight colour, bold, font, size, space after the row;
 *   - the whole report: font, size, space between columns and rows, row height.
 *
 * A sheet pushed past the paper's edge is named in the panel rather than left
 * for the PDF to crop.
 */

/** How close to a column's edge the pointer must be to drag it, in CSS px. */
const EDGE_PX = 6;

const SWATCHES = ["#fff59d", "#c8e6c9", "#bbdefb", "#f8bbd0", "#ffe0b2", "#e0e0e0"];

/** Text colours that still read on white paper. */
const TEXT_SWATCHES = ["#000000", "#1a237e", "#0d47a1", "#b71c1c", "#1b5e20", "#4a148c", "#e65100", "#616161"];

/** Colours for the ruled lines: dark enough to print, light enough to recede. */
const LINE_SWATCHES = ["#000000", "#616161", "#9e9e9e", "#0d47a1", "#1b5e20", "#b71c1c", "#4a148c", "#bf360c"];

/** How many steps "Undo" can go back. */
const HISTORY = 50;

type Scope = "cell" | "row" | "col";

type Selection =
  | {
      kind: "cell";
      col: string;
      /** Null for a row that has no key: a blank padding row of the rojmel. */
      row: string | null;
      /** Whether a blank band can be printed after this row. */
      gapAllowed: boolean;
      /** How tall the row is now, in mm: where "+" and "−" start from. */
      rowMm: number | null;
    }
  /** A heading above or below the table: a title, the Cash Book band, signatures. */
  | {
      kind: "part";
      part: string;
      /** Its size now, in mm: where "+" and "−" start from. */
      heightMm: number;
      widthMm: number;
      /** The heading it sits in, e.g. the whole band for the આવક box. */
      parent: string | null;
    };

/** "rgb(253, 238, 228)" -> "#fdeee4"; null for transparent. */
function cssColourToHex(colour: string): string | null {
  const parts = colour.match(/[\d.]+/g)?.map(Number);
  if (!parts || parts.length < 3) return null;
  if (parts.length >= 4 && parts[3] === 0) return null;
  return `#${parts
    .slice(0, 3)
    .map((part) => Math.round(part).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The colour picker Chromium offers for any pixel on screen, where available. */
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>;
}
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperApi;
  }
}

/** A size measured on a zoomed sheet (the page setup's zoom), in the sheet's own pixels. */
function unzoomed(element: Element, px: number): number {
  const sheet = element.closest<HTMLElement>(".sheet");
  return sheet ? px / sheetZoom(sheet) : px;
}

/** CSS pixels to millimetres, one decimal. */
const pxToMm = (px: number): number => Math.round(((px * 25.4) / 96) * 10) / 10;

interface Drag {
  col: string;
  startX: number;
  x: number;
  tableWidthPx: number;
  top: number;
  height: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function LayoutEditor({
  report,
  onClose,
  onDirtyChange,
}: {
  report: PrintableReportId;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}): JSX.Element {
  const t = useStrings();
  const { language } = useLanguage();
  const [saved, setSaved] = useState<ReportLayout | null>(null);
  const [draft, setDraft] = useState<ReportLayout | null>(null);
  const [history, setHistory] = useState<ReportLayout[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [scope, setScope] = useState<Scope>("cell");
  const [check, setCheck] = useState<LayoutCheck>({ sheets: [], cells: 0 });
  // What the preview actually paints: the selected cell's colour, and every
  // colour on the form - its own (footer rows, bands) and the school's.
  const [paintedFill, setPaintedFill] = useState<string | null>(null);
  const [formColours, setFormColours] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overEdge, setOverEdge] = useState(false);
  const justDragged = useRef(false);

  // Only a different answer re-renders: the preview re-checks after every pass.
  const updateCheck = useCallback((next: LayoutCheck) => {
    setCheck((current) =>
      current.cells === next.cells && current.sheets.join() === next.sheets.join() ? current : next,
    );
  }, []);

  useEffect(() => {
    void api
      .getReportLayout(report)
      .then((layout) => {
        setSaved(layout);
        setDraft(layout);
      })
      .catch((cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause)));
  }, [report]);

  const dirty = saved !== null && draft !== null && JSON.stringify(saved) !== JSON.stringify(draft);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const change = useCallback(
    (next: ReportLayout) => {
      if (!draft) return;
      setHistory((past) => [...past.slice(-(HISTORY - 1)), draft]);
      setDraft(next);
      setMessage(null);
    },
    [draft],
  );

  const undo = useCallback(() => {
    setHistory((past) => {
      const previous = past.at(-1);
      if (previous) setDraft(previous);
      return past.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault();
        undo();
      }
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  async function save(): Promise<void> {
    if (!draft) return;
    setSaving(true);
    const result = await api.saveReportLayout(report, draft);
    setSaving(false);
    if (result.ok) {
      setSaved(result.data);
      setDraft(result.data);
      setMessage({ kind: "ok", text: t.layoutSaved });
    } else {
      const text = result.issues.map((issue) => (language === "en" ? issue.messageEn : issue.messageGu));
      setMessage({ kind: "error", text: text.join(" ") });
    }
  }

  function discard(): void {
    if (dirty && !window.confirm(t.layoutDiscardConfirm)) return;
    onClose();
  }

  // -------------------------------------------------- pointer: select, resize

  const columns = REPORT_COLUMNS[report];
  const columnIndex = (id: string): number => columns.findIndex((column) => column.id === id);

  /** The column whose right edge is under the pointer, if any. */
  function edgeAt(event: ReactPointerEvent): { col: string; cell: HTMLElement } | null {
    const cell = (event.target as Element | null)?.closest?.<HTMLTableCellElement>(
      "table[data-layout] td[data-col], table[data-layout] th[data-col]",
    );
    if (!cell || cell.colSpan !== 1) return null;
    const col = cell.dataset["col"] ?? "";
    const index = columnIndex(col);
    const rect = cell.getBoundingClientRect();
    if (rect.right - event.clientX <= EDGE_PX && index >= 0 && index < columns.length - 1) {
      return { col, cell };
    }
    if (event.clientX - rect.left <= EDGE_PX && index > 0) return { col: columns[index - 1]!.id, cell };
    return null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !draft) return;
    const edge = edgeAt(event);
    if (!edge) return;
    const table = edge.cell.closest("table");
    if (!table) return;
    event.preventDefault();
    const rect = table.getBoundingClientRect();
    setDrag({
      col: edge.col,
      startX: event.clientX,
      x: event.clientX,
      tableWidthPx: rect.width,
      top: Math.max(0, rect.top),
      height: Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top),
    });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (drag) return;
    const near = edgeAt(event) !== null;
    if (near !== overEdge) setOverEdge(near);
  }

  // While dragging, the pointer is followed across the whole window: it may
  // leave the preview, and the button may be let go over the panel.
  const dragging = drag !== null;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent): void => {
      const current = dragRef.current;
      if (current) setDrag({ ...current, x: event.clientX });
    };
    const up = (event: PointerEvent): void => {
      const current = dragRef.current;
      const layout = draftRef.current;
      setDrag(null);
      if (!current || !layout || Math.abs(event.clientX - current.startX) < 2) return;
      const deltaPct = ((event.clientX - current.startX) / current.tableWidthPx) * 100;
      change(moveColumnEdge(report, layout, current.col, deltaPct));
      // Swallow the click that ends this drag, and only that one.
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
    };
    const cancel = (): void => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging, change, report]);

  function onClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    const target = event.target as Element | null;
    const cell = target?.closest?.<HTMLElement>(
      "table[data-layout] td[data-col], table[data-layout] th[data-col]",
    );
    if (!cell) {
      const element = target?.closest?.<HTMLElement>(`#${LAYOUT_ROOT_ID} [data-part]`);
      const part = element?.dataset["part"];
      if (element && part) {
        // A heading table's height is per row, so its first row is what counts.
        const measured = element.tagName === "TABLE" ? element.querySelector("tr") : element;
        setSelection(partSelection(element, part, measured));
      }
      return;
    }
    const tr = cell.closest("tr");
    const row = tr?.dataset["row"] ?? null;
    const gapAllowed =
      row !== null &&
      tr !== null &&
      (tr.hasAttribute("data-paged-row") ||
        ((report === "rojmel" || report === "annexure9") && tr.parentElement?.tagName === "TBODY"));
    setSelection({
      kind: "cell",
      col: cell.dataset["col"] ?? "",
      row,
      gapAllowed,
      rowMm: tr ? pxToMm(unzoomed(tr, tr.getBoundingClientRect().height)) : null,
    });
    if (row === null) setScope("col");
  }

  function partSelection(element: HTMLElement, part: string, measured: Element | null): Selection {
    return {
      kind: "part",
      part,
      heightMm: pxToMm(unzoomed(element, measured?.getBoundingClientRect().height ?? 0)),
      widthMm: pxToMm(unzoomed(element, element.getBoundingClientRect().width)),
      parent: element.parentElement?.closest<HTMLElement>("[data-part]")?.dataset["part"] ?? null,
    };
  }

  /** Select the heading a piece sits in - the whole band, from its આવક box. */
  function selectParent(): void {
    if (selection?.kind !== "part" || !selection.parent) return;
    const element = document.querySelector<HTMLElement>(
      `#${LAYOUT_ROOT_ID} .sheet:not([aria-hidden]) [data-part=${cssString(selection.parent)}]`,
    );
    if (element) setSelection(partSelection(element, selection.parent, element));
  }

  // Read the colours off the preview after each change. Cheap: a few sheets'
  // cells, read without writing anything.
  useEffect(() => {
    const timer = setTimeout(() => {
      const root = document.getElementById(LAYOUT_ROOT_ID);
      if (!root) return;
      const sheets = [...root.querySelectorAll(":scope > .sheet:not([aria-hidden])")].slice(0, 3);
      const found = new Set<string>();
      for (const sheet of sheets) {
        for (const element of sheet.querySelectorAll("td, th, [data-part], [data-part] *")) {
          const hex = cssColourToHex(getComputedStyle(element).backgroundColor);
          if (hex && hex !== "#ffffff") found.add(hex);
        }
      }
      for (const style of Object.values(draft?.styles ?? {})) {
        if (style.fill && style.fill !== NO_FILL) found.add(style.fill.toLowerCase());
      }
      setFormColours([...found].filter((colour) => !SWATCHES.includes(colour)));

      const selected =
        selection?.kind === "part"
          ? root.querySelector(`.sheet:not([aria-hidden]) [data-part=${cssString(selection.part)}]`)
          : selection?.kind === "cell"
            ? root.querySelector(
                selection.row !== null
                  ? `.sheet:not([aria-hidden]) tr[data-row=${cssString(selection.row)}] > [data-col=${cssString(selection.col)}]`
                  : `.sheet:not([aria-hidden]) table[data-layout] tbody [data-col=${cssString(selection.col)}]`,
              )
            : null;
      setPaintedFill(selected ? cssColourToHex(getComputedStyle(selected).backgroundColor) : null);
    }, 0);
    return () => clearTimeout(timer);
  }, [draft, selection, check]);

  async function pickFromScreen(): Promise<void> {
    if (!window.EyeDropper) return;
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const hex = cssColourToHex(sRGBHex) ?? sRGBHex.toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(hex)) setStyle({ fill: hex });
    } catch {
      // Escape pressed: nothing chosen.
    }
  }

  // ------------------------------------------------------------ the preview

  const widths = useMemo(() => (draft ? columnWidths(report, draft) : {}), [report, draft]);
  const tableMm = tableWidthMm(report, draft ?? undefined);

  // While dragging: where the edge would land, in the column's new width.
  const dragWidthMm = useMemo(() => {
    if (!drag || !draft) return null;
    const moved = moveColumnEdge(report, draft, drag.col, ((drag.x - drag.startX) / drag.tableWidthPx) * 100);
    return (columnWidths(report, moved)[drag.col]! / 100) * tableMm;
  }, [drag, draft, report, tableMm]);

  const editorCss = useMemo(() => {
    const root = `#${LAYOUT_ROOT_ID} table[data-layout]`;
    const rules = [
      `${root} :is(td, th)[data-col] { cursor: cell; }`,
      `#${LAYOUT_ROOT_ID} [data-part] { cursor: pointer; }`,
    ];
    if (selection?.kind === "part") {
      rules.push(
        `#${LAYOUT_ROOT_ID} [data-part=${cssString(selection.part)}] { outline: 2px solid #1f6feb; outline-offset: 1px; }`,
      );
    } else if (selection) {
      const col = `[data-col=${cssString(selection.col)}]`;
      const row = selection.row !== null ? `tr[data-row=${cssString(selection.row)}]` : null;
      const tint = "box-shadow: inset 0 0 0 100vmax rgba(31, 111, 235, 0.10);";
      if (scope === "col" || row === null) rules.push(`${root} :is(td, th)${col} { ${tint} }`);
      else if (scope === "row") rules.push(`${root} ${row} > :is(td, th) { ${tint} }`);
      if (row !== null) {
        rules.push(`${root} ${row} > :is(td, th)${col} { outline: 2px solid #1f6feb; outline-offset: -2px; }`);
      }
    }
    return rules.join("\n");
  }, [selection, scope]);

  if (failure !== null) {
    return (
      <div className="state error">
        <p>{t.couldNotLoad}</p>
        <p className="num">{failure}</p>
      </div>
    );
  }
  if (!draft) return <div className="state">{t.loading}</div>;

  // -------------------------------------------------------------- the panel

  const defaults = REPORT_DEFAULTS[report];
  const cellSelection = selection?.kind === "cell" ? selection : null;
  const column = cellSelection ? columns.find((each) => each.id === cellSelection.col) : undefined;
  const part = selection?.kind === "part" ? REPORT_PARTS[report].find((each) => each.id === selection.part) : undefined;
  const effectiveScope: Scope = !cellSelection || cellSelection.row === null ? "col" : scope;
  const target: LayoutTarget | null =
    selection?.kind === "part"
      ? { kind: "part", part: selection.part }
      : !cellSelection
        ? null
        : effectiveScope === "col" || cellSelection.row === null
          ? { kind: "col", col: cellSelection.col }
          : effectiveScope === "row"
            ? { kind: "row", row: cellSelection.row }
            : { kind: "cell", row: cellSelection.row, col: cellSelection.col };
  const own: CellStyle = target ? (draft.styles[targetKey(target)] ?? {}) : {};
  const shown: CellStyle = cellSelection
    ? styleAt(draft, cellSelection.row, cellSelection.col)
    : own;
  // Height belongs to a whole row or a heading, never one cell or a column.
  const heightAllowed = target?.kind === "row" || target?.kind === "part";
  const setStyle = (patch: Partial<Record<keyof CellStyle, unknown>>): void => {
    if (target) change(withStyle(draft, target, patch as CellStyle));
  };

  /** Colour, weight, font, size, alignment and - for a row or heading - height. */
  const styleControls = (
    <>
      <Field label={t.layoutHighlight}>
        <div className="swatches">
          <button
            className={`swatch default${own.fill ? "" : " chosen"}`}
            title={t.layoutFillDefault}
            onClick={() => setStyle({ fill: undefined })}
          >
            ↺
          </button>
          <button
            className={`swatch none${own.fill === NO_FILL ? " chosen" : ""}`}
            title={t.layoutFillBlank}
            onClick={() => setStyle({ fill: NO_FILL })}
          />
          {SWATCHES.map((colour) => (
            <button
              key={colour}
              className={`swatch${own.fill === colour ? " chosen" : ""}`}
              style={{ background: colour }}
              title={colour}
              onClick={() => setStyle({ fill: colour })}
            />
          ))}
        </div>
        {formColours.length > 0 && (
          <>
            <span className="layout-hint">{t.layoutFormColours}</span>
            <div className="swatches">
              {formColours.map((colour) => (
                <button
                  key={colour}
                  className={`swatch${own.fill?.toLowerCase() === colour ? " chosen" : ""}`}
                  style={{ background: colour }}
                  title={colour}
                  onClick={() => setStyle({ fill: colour })}
                />
              ))}
            </div>
          </>
        )}
        <div className="colour-now">
          {/* Shows the colour this cell prints in now - its own, its row's or
              the form's - so the same one can be given to another cell. */}
          <input
            type="color"
            title={t.layoutOtherColour}
            value={own.fill && own.fill !== NO_FILL ? own.fill : (paintedFill ?? "#ffffff")}
            onChange={(event) => setStyle({ fill: event.target.value })}
          />
          <span className="num-inline">{paintedFill ?? t.layoutNoColour}</span>
          {window.EyeDropper && (
            <button className="ghost small" onClick={() => void pickFromScreen()}>
              {t.layoutPickFromScreen}
            </button>
          )}
        </div>
        <span className="layout-hint">{t.layoutFillHelp}</span>
      </Field>

      <Field label={t.layoutTextColour}>
        <ColourChoice value={own.colour} swatches={TEXT_SWATCHES} onChange={(colour) => setStyle({ colour })} />
      </Field>

      <Field label={t.layoutLineColour}>
        <ColourChoice
          value={own.lineColour}
          swatches={LINE_SWATCHES}
          onChange={(lineColour) => setStyle({ lineColour })}
        />
      </Field>

      <Field label={t.layoutWeight}>
        <div className="segmented">
          {(
            [
              [undefined, t.layoutWeightDefault],
              [true, t.layoutBold],
              [false, t.layoutRegular],
            ] as const
          ).map(([value, label]) => (
            <button
              key={String(value)}
              className={own.bold === value ? "primary small" : "ghost small"}
              onClick={() => setStyle({ bold: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t.layoutAlign}>
        <AlignButtons value={own.align} onChange={(align) => setStyle({ align })} />
      </Field>

      <Field label={t.layoutFont}>
        <FontSelect value={own.font} defaultLabel={t.layoutFontDefault} onChange={(font) => setStyle({ font })} />
      </Field>

      <Field label={`${t.layoutSize} (${t.pt})`}>
        <Stepper
          value={own.sizePt}
          placeholder={shown.sizePt ?? draft.sizePt ?? defaults.sizePt}
          step={0.5}
          min={5}
          max={40}
          onChange={(sizePt) => setStyle({ sizePt })}
        />
      </Field>

      {heightAllowed && (
        <Field label={`${target?.kind === "part" ? t.layoutPartHeight : t.layoutThisRowHeight} (${t.mm})`}>
          <Stepper
            value={own.heightMm}
            placeholder={
              selection?.kind === "part" ? selection.heightMm : (cellSelection?.rowMm ?? t.layoutAuto)
            }
            step={1}
            min={2}
            max={80}
            onChange={(heightMm) => setStyle({ heightMm })}
          />
        </Field>
      )}
    </>
  );

  return (
    <div className="layout-editor">
      <div
        className={`layout-canvas${overEdge || drag ? " resizing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClick={onClick}
      >
        <PrintRoot report={report} layout={draft} editorCss={editorCss} onChecked={updateCheck} />
      </div>

      {drag && (
        <>
          <div className="layout-guide" style={{ left: drag.x, top: drag.top, height: drag.height }} />
          {dragWidthMm !== null && (
            <div className="layout-guide-label" style={{ left: drag.x + 8, top: drag.top + 8 }}>
              {round1(dragWidthMm)} {t.mm}
            </div>
          )}
        </>
      )}

      <aside className="layout-panel">
        <div className="layout-actions">
          <button className="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? t.layoutSaving : t.layoutSave}
          </button>
          <button className="ghost" disabled={history.length === 0} onClick={undo}>
            {t.layoutUndo}
          </button>
          <button className="ghost" onClick={discard}>
            {dirty ? t.layoutDiscard : t.layoutDone}
          </button>
        </div>
        {message && <div className={`issue ${message.kind === "ok" ? "warning" : "error"}`}>{message.text}</div>}
        {check.sheets.length > 0 && (
          <div className="issue error">{t.layoutOverflow(check.sheets.join(", "))}</div>
        )}
        {check.cells > 0 && <div className="issue warning">{t.layoutCellsOverflow(check.cells)}</div>}
        <p className="layout-hint">{t.layoutHint}</p>

        <section>
          <h3>{t.layoutSelection}</h3>
          {part ? (
            <>
              <p className="layout-selected">{t.layoutPart(part.labelGu)}</p>
              {selection?.kind === "part" && selection.parent && (
                <button className="link layout-parent" onClick={selectParent}>
                  {t.layoutSelectParent(
                    REPORT_PARTS[report].find((each) => each.id === selection.parent)?.labelGu ?? selection.parent,
                  )}
                </button>
              )}
              {part.sizable && selection?.kind === "part" && (
                <Field label={`${t.layoutPartWidth} (${t.mm})`}>
                  <Stepper
                    value={own.widthMm}
                    placeholder={selection.widthMm}
                    step={1}
                    min={5}
                    max={400}
                    onChange={(widthMm) => setStyle({ widthMm })}
                  />
                </Field>
              )}
              {styleControls}
            </>
          ) : !cellSelection || !column ? (
            <p className="muted">{t.layoutNothingSelected}</p>
          ) : (
            <>
              <p className="layout-selected">
                {t.layoutColumn(column.labelGu)}
                {cellSelection.row === "head" ? ` · ${t.layoutHeadRow}` : ""}
              </p>

              <Field label={`${t.layoutWidth} (${t.mm})`}>
                <Stepper
                  value={round1((widths[cellSelection.col]! / 100) * tableMm)}
                  step={1}
                  min={1}
                  max={round1(tableMm)}
                  onChange={(mm) => {
                    if (mm !== undefined) {
                      change(setColumnWidth(report, draft, cellSelection.col, (mm / tableMm) * 100));
                    }
                  }}
                />
              </Field>

              <Field label={t.layoutApplyTo}>
                <div className="segmented">
                  {(
                    [
                      ["cell", t.layoutScopeCell],
                      ["row", t.layoutScopeRow],
                      ["col", t.layoutScopeColumn],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      className={effectiveScope === id ? "primary small" : "ghost small"}
                      disabled={id !== "col" && cellSelection.row === null}
                      onClick={() => setScope(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              {styleControls}

              {cellSelection.gapAllowed && cellSelection.row !== null && (
                <Field label={`${t.layoutGapAfter} (${t.mm})`}>
                  <Stepper
                    value={draft.rowGapsMm[cellSelection.row]}
                    placeholder={0}
                    step={1}
                    min={0}
                    max={80}
                    onChange={(mm) => change(withRowGap(draft, cellSelection.row!, mm ?? null))}
                  />
                </Field>
              )}
            </>
          )}
          {target && (
            <button
              className="ghost small"
              disabled={Object.keys(own).length === 0}
              onClick={() =>
                setStyle({
                  fill: undefined,
                  bold: undefined,
                  font: undefined,
                  sizePt: undefined,
                  align: undefined,
                  heightMm: undefined,
                  widthMm: undefined,
                  colour: undefined,
                  lineColour: undefined,
                })
              }
            >
              {t.layoutClearFormat}
            </button>
          )}
        </section>

        <section>
          <h3>{t.layoutWholeReport}</h3>
          <Field label={t.layoutFont}>
            <FontSelect
              value={draft.font}
              defaultLabel={`${t.layoutFontDefault} (Noto Sans Gujarati)`}
              onChange={(font) => change({ ...draft, font })}
            />
          </Field>
          <Field label={`${t.layoutSize} (${t.pt})`}>
            <Stepper
              value={draft.sizePt}
              placeholder={defaults.sizePt}
              step={0.5}
              min={5}
              max={40}
              onChange={(sizePt) => change({ ...draft, sizePt })}
            />
          </Field>
          <Field label={`${t.layoutPaddingX} (${t.mm})`}>
            <Stepper
              value={draft.paddingXMm}
              placeholder={defaults.paddingXMm}
              step={0.2}
              min={0}
              max={15}
              onChange={(paddingXMm) => change({ ...draft, paddingXMm })}
            />
          </Field>
          <Field label={`${t.layoutPaddingY} (${t.mm})`}>
            <Stepper
              value={draft.paddingYMm}
              placeholder={defaults.paddingYMm}
              step={0.2}
              min={0}
              max={15}
              onChange={(paddingYMm) => change({ ...draft, paddingYMm })}
            />
          </Field>
          <Field label={`${t.layoutRowHeight} (${t.mm})`}>
            <Stepper
              value={draft.rowHeightMm}
              placeholder={defaults.rowHeightMm ?? t.layoutAuto}
              step={0.5}
              min={2}
              max={60}
              onChange={(rowHeightMm) => change({ ...draft, rowHeightMm })}
            />
          </Field>
          <Field label={t.layoutAlign}>
            <AlignButtons value={draft.align} onChange={(align) => change({ ...draft, align })} />
          </Field>
          <Field label={t.layoutTextColour}>
            <ColourChoice
              value={draft.colour}
              swatches={TEXT_SWATCHES}
              onChange={(colour) => change({ ...draft, colour })}
            />
          </Field>
          <Field label={t.layoutLineColour}>
            <ColourChoice
              value={draft.lineColour}
              swatches={LINE_SWATCHES}
              onChange={(lineColour) => change({ ...draft, lineColour })}
            />
          </Field>
          <span className="layout-hint">{t.layoutColourHelp}</span>
          <label className="layout-check">
            <input
              type="checkbox"
              checked={draft.plain === true}
              onChange={(event) => change({ ...draft, plain: event.target.checked ? true : undefined })}
            />
            {t.layoutPlain}
          </label>
          <div className="layout-actions">
            <button
              className="ghost small"
              disabled={Object.keys(draft.widths).length === 0}
              onClick={() => change({ ...draft, widths: {} })}
            >
              {t.layoutResetWidths}
            </button>
            {/* The paper and zoom are the print window's, and stay. */}
            <button
              className="ghost small"
              onClick={() => change(draft.page ? { ...emptyLayout(), page: draft.page } : emptyLayout())}
            >
              {t.layoutResetAll}
            </button>
          </div>
        </section>

        {report === "rojmel" && <p className="layout-hint">{t.layoutRojmelNote}</p>}
        <p className="layout-hint">{t.layoutExcelNote}</p>
      </aside>
    </div>
  );
}

/** A colour, or the form's default (↺): a few swatches and a picker for any other. */
function ColourChoice({
  value,
  swatches,
  onChange,
}: {
  value: string | undefined;
  swatches: string[];
  onChange: (colour: string | undefined) => void;
}): JSX.Element {
  const t = useStrings();
  return (
    <div className="swatches">
      <button
        className={`swatch default${value ? "" : " chosen"}`}
        title={t.layoutColourDefault}
        onClick={() => onChange(undefined)}
      >
        ↺
      </button>
      {swatches.map((colour) => (
        <button
          key={colour}
          className={`swatch${value?.toLowerCase() === colour ? " chosen" : ""}`}
          style={{ background: colour }}
          title={colour}
          onClick={() => onChange(colour)}
        />
      ))}
      <input
        type="color"
        title={t.layoutOtherColour}
        value={value ?? "#000000"}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Default, left, centre, right. "Default" is centred: the forms centre all text. */
function AlignButtons({
  value,
  onChange,
}: {
  value: Alignment | undefined;
  onChange: (align: Alignment | undefined) => void;
}): JSX.Element {
  const t = useStrings();
  const options: [Alignment | undefined, string][] = [
    [undefined, t.layoutWeightDefault],
    ["left", t.layoutAlignLeft],
    ["center", t.layoutAlignCenter],
    ["right", t.layoutAlignRight],
  ];
  return (
    <div className="segmented">
      {options.map(([option, label]) => (
        <button
          key={String(option)}
          className={value === option ? "primary small" : "ghost small"}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function FontSelect({
  value,
  defaultLabel,
  onChange,
}: {
  value: LayoutFontId | undefined;
  defaultLabel: string;
  onChange: (font: LayoutFontId | undefined) => void;
}): JSX.Element {
  return (
    <select
      value={value ?? ""}
      onChange={(event) => onChange((event.target.value || undefined) as LayoutFontId | undefined)}
    >
      <option value="">{defaultLabel}</option>
      {LAYOUT_FONTS.map((font) => (
        // Each name is shown in its own face, so the choice can be seen.
        <option key={font.id} value={font.id} style={{ fontFamily: `"${font.family}"` }}>
          {font.label} – ગુજરાતી
        </option>
      ))}
    </select>
  );
}

/**
 * A number with − and + either side. Empty means "the default", shown as the
 * placeholder; the value is kept to the stated range.
 */
function Stepper({
  value,
  placeholder,
  step,
  min = 0,
  max = 1000,
  onChange,
}: {
  value: number | undefined;
  placeholder?: number | string;
  step: number;
  min?: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}): JSX.Element {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);

  const clamp = (next: number): number => Math.round(Math.min(max, Math.max(min, next)) * 100) / 100;
  const base = value ?? (typeof placeholder === "number" ? placeholder : min);

  const commit = (raw: string): void => {
    if (raw.trim() === "") {
      onChange(undefined);
      return;
    }
    const parsed = Number(raw.replace(",", "."));
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    else setText(value === undefined ? "" : String(value));
  };

  return (
    <div className="stepper">
      <button className="ghost small" onClick={() => onChange(clamp(base - step))} aria-label="−">
        −
      </button>
      <input
        className="num-input"
        inputMode="decimal"
        value={text}
        placeholder={placeholder === undefined ? "" : String(placeholder)}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
        }}
      />
      <button className="ghost small" onClick={() => onChange(clamp(base + step))} aria-label="+">
        +
      </button>
    </div>
  );
}
