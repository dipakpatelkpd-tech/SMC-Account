import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  JSX,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { api } from "../api.js";
import type { PrintableReportId } from "../../shared/api.js";
import {
  BORDER_SIDES,
  BORDER_STYLES,
  DEFAULT_PAGE,
  LAYOUT_FONTS,
  MAX_SCALE_PCT,
  MIN_SCALE_PCT,
  NO_FILL,
  ORIENTATIONS,
  PAPER_SIZES,
  REPORT_COLUMNS,
  REPORT_DEFAULTS,
  REPORT_PARTS,
  columnWidths,
  cssString,
  emptyLayout,
  fitScalePct,
  moveColumnEdge,
  resolvePage,
  setColumnWidth,
  styleAt,
  tableWidthMm,
  targetKey,
  withRowGap,
  withStyle,
  type Alignment,
  type BorderEdge,
  type BorderSide,
  type BorderStyle,
  type CellStyle,
  type LayoutFontId,
  type LayoutTarget,
  type PageSetup,
  type PaperId,
  type ReportLayout,
  type VerticalAlignment,
} from "../../shared/report-layout.js";
import { useLanguage, useStrings } from "../i18n/index.js";
import { LAYOUT_ROOT_ID, PrintRoot, type LayoutCheck } from "../print/PrintRoot.js";
import { sheetZoom } from "../print/PagedSheets.js";
import { ColourButton } from "../components/ColourPalette.js";
import { cleanPage } from "./PrintDialog.js";

/**
 * The layout editor, shaped like Excel: a ribbon of tabs across the top, the
 * report below it as the sheet, a name box saying what is selected and a status
 * bar at the foot. It opens over the whole window.
 *
 * The sheet is the report's own print preview - the same DOM the PDF is made
 * from - so what is edited is what prints. Everything changes a draft
 * `ReportLayout`; nothing reaches the books until "Save".
 *
 *   - click a cell; Shift+click selects the range to it, Ctrl+click adds one;
 *     "Apply to" says whether a change is for those cells, their whole rows
 *     (that row in every block) or their columns;
 *   - click a heading to change it; nothing selected means the whole report;
 *   - drag the line between two columns to resize them;
 *   - Home: font, size, bold / italic / underline, borders (each side, line
 *     style and colour), fill and text colour from Excel's palette, alignment
 *     both ways, wrap text, inner spacing, sizes, format painter, clear;
 *   - Page Layout: paper, orientation, margins, zoom - the print settings;
 *   - Whole report: the report's own font, size, spacing, row height and colours;
 *   - View: how large the sheet is drawn on screen.
 *
 * Ctrl+Z / Ctrl+Y undo and redo, Ctrl+B / I / U, Ctrl+S saves, Esc clears the
 * selection (or the format painter).
 */

/** How close to a column's edge the pointer must be to drag it, in CSS px. */
const EDGE_PX = 6;

/** How many steps undo can go back. */
const HISTORY = 80;

/** The text sizes Excel's size box lists. */
const SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

/** How large the sheet can be drawn on screen. */
const VIEW_ZOOMS = [50, 75, 90, 100, 125, 150];

type Scope = "cell" | "row" | "col";
type Tab = "home" | "page" | "report" | "view";
type BorderCommand = "all" | "outside" | "thickOutside" | "none" | BorderSide;
type Pen = { style: Exclude<BorderStyle, "none">; colour: string | undefined };

/** One cell of the sheet: its row (null for a blank padding row), its row group, its column. */
interface CellRef {
  row: string | null;
  group: string | null;
  col: string;
}

/** Words of the form under the click, which the school may reword (print/layout-context, Text). */
interface TextRef {
  id: string;
  /** The form's own wording. */
  fallback: string;
  /** The {names} the text may use. */
  vars: string[];
}

type Selection = (
  | {
      kind: "cell";
      /** The cell clicked first: the one the name box and the sizes describe. */
      anchor: CellRef & {
        /** Whether a blank band can be printed after this row. */
        gapAllowed: boolean;
        /** How tall the row is now, in mm. */
        rowMm: number | null;
      };
      /** Every selected cell, the anchor included. */
      cells: CellRef[];
    }
  /** A heading above or below the table: a title, the Cash Book band, signatures. */
  | {
      kind: "part";
      part: string;
      heightMm: number;
      widthMm: number;
      /** The heading it sits in, e.g. the whole band for the આવક box. */
      parent: string | null;
    }
) & { text?: TextRef | null };

/** The editable words at a click: the Text span clicked, or the only one in the clicked box. */
function textAt(element: Element | null, box: Element | null): TextRef | null {
  const span =
    element?.closest<HTMLElement>("[data-text]") ??
    (box && box.querySelectorAll("[data-text]").length === 1 ? box.querySelector<HTMLElement>("[data-text]") : null);
  if (!span) return null;
  return {
    id: span.dataset["text"] ?? "",
    fallback: span.dataset["textDefault"] ?? "",
    vars: (span.dataset["textVars"] ?? "").split(",").filter((name) => name !== ""),
  };
}

/** A size measured on a zoomed sheet, in the sheet's own pixels. */
function unzoomed(element: Element, px: number): number {
  const sheet = element.closest<HTMLElement>(".sheet");
  return sheet ? px / sheetZoom(sheet) : px;
}

/** CSS pixels to millimetres, one decimal. */
const pxToMm = (px: number): number => Math.round(((px * 25.4) / 96) * 10) / 10;
const round1 = (value: number): number => Math.round(value * 10) / 10;

interface Drag {
  col: string;
  startX: number;
  x: number;
  tableWidthPx: number;
  top: number;
  height: number;
}

type StylePatch = { [K in keyof CellStyle]?: CellStyle[K] | undefined };

/** Every style property, cleared: what "Clear formatting" and the format painter start from. */
const CLEARED: StylePatch = {
  fill: undefined,
  bold: undefined,
  italic: undefined,
  underline: undefined,
  font: undefined,
  sizePt: undefined,
  align: undefined,
  vAlign: undefined,
  wrap: undefined,
  heightMm: undefined,
  widthMm: undefined,
  colour: undefined,
  lineColour: undefined,
  paddingXMm: undefined,
  paddingYMm: undefined,
  borders: undefined,
};

/** The targets a selection stands for, for a scope. */
function targetsFor(selection: Selection | null, scope: Scope): LayoutTarget[] {
  if (!selection) return [];
  if (selection.kind === "part") return [{ kind: "part", part: selection.part }];
  const effective: Scope = selection.anchor.row === null ? "col" : scope;
  const unique = (keys: (string | null)[]): string[] => [
    ...new Set(keys.filter((key): key is string => key !== null)),
  ];
  if (effective === "col") return unique(selection.cells.map((cell) => cell.col)).map((col) => ({ kind: "col", col }));
  if (effective === "row") {
    // The whole row is that row in every block, where the report has blocks.
    return unique(selection.cells.map((cell) => cell.group ?? cell.row)).map((row) => ({ kind: "row", row }));
  }
  const seen = new Set<string>();
  return selection.cells.flatMap((cell): LayoutTarget[] => {
    if (cell.row === null) return [];
    const target: LayoutTarget = { kind: "cell", row: cell.row, col: cell.col };
    const key = targetKey(target);
    if (seen.has(key)) return [];
    seen.add(key);
    return [target];
  });
}

export function LayoutEditor({
  report,
  reportLabel,
  onClose,
  onDirtyChange,
}: {
  report: PrintableReportId;
  reportLabel: string;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}): JSX.Element {
  const t = useStrings();
  const { language } = useLanguage();
  const [saved, setSaved] = useState<ReportLayout | null>(null);
  const [draft, setDraft] = useState<ReportLayout | null>(null);
  const [past, setPast] = useState<ReportLayout[]>([]);
  const [future, setFuture] = useState<ReportLayout[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [scope, setScope] = useState<Scope>("cell");
  const [tab, setTab] = useState<Tab>("home");
  const [check, setCheck] = useState<LayoutCheck>({ sheets: [], cells: 0 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overEdge, setOverEdge] = useState(false);
  const [viewZoom, setViewZoom] = useState(100);
  // The format painter: a style picked up, waiting to be put on the next click.
  const [painter, setPainter] = useState<CellStyle | null>(null);
  // The pen the border buttons draw with.
  const [pen, setPen] = useState<Pen>({ style: "thin", colour: undefined });
  const justDragged = useRef(false);

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
      setPast((history) => [...history.slice(-(HISTORY - 1)), draft]);
      setFuture([]);
      setDraft(next);
      setMessage(null);
    },
    [draft],
  );

  const undo = useCallback(() => {
    if (!draft || past.length === 0) return;
    setFuture((ahead) => [draft, ...ahead]);
    setDraft(past.at(-1)!);
    setPast(past.slice(0, -1));
  }, [draft, past]);

  const redo = useCallback(() => {
    if (!draft || future.length === 0) return;
    setPast((history) => [...history, draft]);
    setDraft(future[0]!);
    setFuture(future.slice(1));
  }, [draft, future]);

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

  function close(): void {
    if (dirty && !window.confirm(t.layoutDiscardConfirm)) return;
    onClose();
  }

  // ------------------------------------------------------------- targets

  const columns = REPORT_COLUMNS[report];
  const columnIndex = (id: string): number => columns.findIndex((column) => column.id === id);
  const cellSelection = selection?.kind === "cell" ? selection : null;
  const anchorHasRow = cellSelection !== null && cellSelection.anchor.row !== null;
  const effectiveScope: Scope = cellSelection && !anchorHasRow ? "col" : scope;
  const targets = useMemo(() => targetsFor(selection, scope), [selection, scope]);

  const first = targets[0];
  const own: CellStyle = draft && first ? (draft.styles[targetKey(first)] ?? {}) : {};
  const shown: CellStyle =
    draft && cellSelection
      ? styleAt(draft, cellSelection.anchor.row, cellSelection.anchor.col, cellSelection.anchor.group)
      : own;
  const reportMode = selection === null;

  /** Apply one change to every target - or, with nothing selected, to the whole report. */
  function apply(patch: StylePatch | ((target: LayoutTarget, current: CellStyle) => StylePatch)): void {
    if (!draft) return;
    if (reportMode) {
      const whole = typeof patch === "function" ? patch({ kind: "col", col: "" }, {}) : patch;
      // What the whole report can carry; the rest needs a selection.
      const allowed: Partial<ReportLayout> = {};
      if ("font" in whole) allowed.font = whole.font;
      if ("sizePt" in whole) allowed.sizePt = whole.sizePt;
      if ("colour" in whole) allowed.colour = whole.colour;
      if ("lineColour" in whole) allowed.lineColour = whole.lineColour;
      if ("align" in whole) allowed.align = whole.align;
      if ("paddingXMm" in whole) allowed.paddingXMm = whole.paddingXMm;
      if ("paddingYMm" in whole) allowed.paddingYMm = whole.paddingYMm;
      change(withReport(draft, allowed));
      return;
    }
    let next = draft;
    for (const target of targets) {
      const current = next.styles[targetKey(target)] ?? {};
      next = withStyle(next, target, typeof patch === "function" ? patch(target, current) : patch);
    }
    change(next);
  }

  /** The report's own settings, shown when nothing is selected. */
  const reportStyle: CellStyle = draft
    ? {
        ...(draft.font ? { font: draft.font } : {}),
        ...(draft.sizePt !== undefined ? { sizePt: draft.sizePt } : {}),
        ...(draft.colour ? { colour: draft.colour } : {}),
        ...(draft.lineColour ? { lineColour: draft.lineColour } : {}),
        ...(draft.align ? { align: draft.align } : {}),
      }
    : {};
  const current: CellStyle = reportMode ? reportStyle : own;

  // ------------------------------------------------------------- borders

  /** Draw (or clear) edges of every target; "outside" draws only the edges at the range's rim. */
  function border(command: BorderCommand): void {
    if (reportMode || !draft) return;
    const edge: BorderEdge =
      command === "thickOutside"
        ? { style: "thick", ...(pen.colour ? { colour: pen.colour } : {}) }
        : command === "none"
          ? { style: "none" }
          : { style: pen.style, ...(pen.colour ? { colour: pen.colour } : {}) };
    const rim = rangeRim();
    apply((target, style) => {
      const borders: Partial<Record<BorderSide, BorderEdge>> = { ...(style.borders ?? {}) };
      const sides: BorderSide[] =
        command === "all" || command === "none"
          ? [...BORDER_SIDES]
          : command === "outside" || command === "thickOutside"
            ? rim(target)
            : [command];
      for (const side of sides) borders[side] = edge;
      return { borders };
    });
  }

  /** For "outside": which edges of a target lie on the rim of the selection. */
  function rangeRim(): (target: LayoutTarget) => BorderSide[] {
    if (!cellSelection || effectiveScope !== "cell") {
      return (target) =>
        target.kind === "row" ? ["top", "bottom"] : target.kind === "col" ? ["left", "right"] : [...BORDER_SIDES];
    }
    const rows = [...new Set(cellSelection.cells.map((cell) => cell.row))];
    const cols = cellSelection.cells.map((cell) => columnIndex(cell.col));
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    return (target) => {
      if (target.kind !== "cell") return [...BORDER_SIDES];
      const sides: BorderSide[] = [];
      if (target.row === rows[0]) sides.push("top");
      if (target.row === rows.at(-1)) sides.push("bottom");
      if (columnIndex(target.col) === minCol) sides.push("left");
      if (columnIndex(target.col) === maxCol) sides.push("right");
      return sides;
    };
  }

  // ------------------------------------------------- keyboard shortcuts

  function toggle(property: "bold" | "italic" | "underline"): void {
    if (reportMode) return;
    const on = (own[property] ?? shown[property]) === true;
    apply({ [property]: on ? undefined : true });
  }

  const keys = useRef({ undo, redo, toggle, save: (): void => undefined });
  keys.current = { undo, redo, toggle, save: () => void save() };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const typing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement;
      const actions = keys.current;
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        setPainter(null);
        setSelection(null);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || typing) return;
      if (key === "z" && !event.shiftKey) actions.undo();
      else if (key === "y" || (key === "z" && event.shiftKey)) actions.redo();
      else if (key === "b") actions.toggle("bold");
      else if (key === "i") actions.toggle("italic");
      else if (key === "u") actions.toggle("underline");
      else if (key === "s") actions.save();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // -------------------------------------------------- pointer: select, resize

  function edgeAt(event: ReactPointerEvent): { col: string; cell: HTMLElement } | null {
    const cell = (event.target as Element | null)?.closest?.<HTMLTableCellElement>(
      "table[data-layout] td[data-col], table[data-layout] th[data-col]",
    );
    if (!cell || cell.colSpan !== 1) return null;
    const col = cell.dataset["col"] ?? "";
    const index = columnIndex(col);
    const rect = cell.getBoundingClientRect();
    if (rect.right - event.clientX <= EDGE_PX && index >= 0 && index < columns.length - 1) return { col, cell };
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

  const dragging = drag !== null;
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent): void => {
      const now = dragRef.current;
      if (now) setDrag({ ...now, x: event.clientX });
    };
    const up = (event: PointerEvent): void => {
      const now = dragRef.current;
      const layout = draftRef.current;
      setDrag(null);
      if (!now || !layout || Math.abs(event.clientX - now.startX) < 2) return;
      const deltaPct = ((event.clientX - now.startX) / now.tableWidthPx) * 100;
      change(moveColumnEdge(report, layout, now.col, deltaPct));
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

  const refOf = (cell: HTMLElement): CellRef => {
    const tr = cell.closest("tr");
    return { row: tr?.dataset["row"] ?? null, group: tr?.dataset["rowGroup"] ?? null, col: cell.dataset["col"] ?? "" };
  };

  /** The cells of one table between two of its cells, inclusive - Excel's Shift+click. */
  function rangeBetween(from: HTMLElement, to: HTMLElement): CellRef[] {
    const table = to.closest("table");
    if (!table || from.closest("table") !== table) return [refOf(to)];
    const rows = [...table.querySelectorAll<HTMLTableRowElement>("tr")].filter(
      (row) => !row.classList.contains("layout-gap") && !row.classList.contains("block-gap"),
    );
    const rowFrom = rows.indexOf(from.closest("tr")!);
    const rowTo = rows.indexOf(to.closest("tr")!);
    const colFrom = columnIndex(from.dataset["col"] ?? "");
    const colTo = columnIndex(to.dataset["col"] ?? "");
    if (rowFrom < 0 || rowTo < 0 || colFrom < 0 || colTo < 0) return [refOf(to)];
    const [r1, r2] = [Math.min(rowFrom, rowTo), Math.max(rowFrom, rowTo)];
    const [c1, c2] = [Math.min(colFrom, colTo), Math.max(colFrom, colTo)];
    const cells: CellRef[] = [];
    for (let index = r1; index <= r2; index += 1) {
      const tr = rows[index]!;
      for (let col = c1; col <= c2; col += 1) {
        cells.push({ row: tr.dataset["row"] ?? null, group: tr.dataset["rowGroup"] ?? null, col: columns[col]!.id });
      }
    }
    return cells;
  }

  /** The anchor cell on the page, for Shift+click. */
  function anchorElement(anchor: CellRef): HTMLElement | null {
    const root = document.getElementById(LAYOUT_ROOT_ID);
    if (!root || anchor.row === null) return null;
    return root.querySelector<HTMLElement>(
      `.sheet:not([aria-hidden]) tr[data-row=${cssString(anchor.row)}] > [data-col=${cssString(anchor.col)}]`,
    );
  }

  function onClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    const element = event.target as Element | null;
    const cell = element?.closest?.<HTMLElement>("table[data-layout] td[data-col], table[data-layout] th[data-col]");
    let next: Selection | null = null;
    if (!cell) {
      const block = element?.closest?.<HTMLElement>(`#${LAYOUT_ROOT_ID} [data-part]`);
      const part = block?.dataset["part"];
      if (block && part) {
        // A heading table's height is per row, so its first row is what counts.
        const measured = block.tagName === "TABLE" ? block.querySelector("tr") : block;
        next = partSelection(block, part, measured);
      }
    } else {
      const tr = cell.closest("tr");
      const ref = refOf(cell);
      if ((event.shiftKey || event.ctrlKey || event.metaKey) && cellSelection) {
        const from = event.shiftKey ? anchorElement(cellSelection.anchor) : null;
        next = {
          kind: "cell",
          anchor: cellSelection.anchor,
          cells: event.shiftKey ? (from ? rangeBetween(from, cell) : [ref]) : [...cellSelection.cells, ref],
        };
      } else {
        const gapAllowed =
          ref.row !== null &&
          tr !== null &&
          (tr.hasAttribute("data-paged-row") ||
            report === "khatavahi" ||
            ((report === "rojmel" || report === "annexure9") && tr.parentElement?.tagName === "TBODY"));
        next = {
          kind: "cell",
          anchor: { ...ref, gapAllowed, rowMm: tr ? pxToMm(unzoomed(tr, tr.getBoundingClientRect().height)) : null },
          cells: [ref],
        };
        if (ref.row === null) setScope("col");
      }
    }
    if (!next) return;
    next = { ...next, text: textAt(element, cell ?? element?.closest?.("[data-part]") ?? null) };
    setSelection(next);
    // The format painter puts what it picked up on what is clicked, then stops.
    if (painter && draft) {
      const picked = painter;
      setPainter(null);
      let layout = draft;
      for (const target of targetsFor(next, scope)) layout = withStyle(layout, target, { ...CLEARED, ...picked });
      change(layout);
    }
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

  function selectParent(): void {
    if (selection?.kind !== "part" || !selection.parent) return;
    const element = document.querySelector<HTMLElement>(
      `#${LAYOUT_ROOT_ID} .sheet:not([aria-hidden]) [data-part=${cssString(selection.parent)}]`,
    );
    if (element) setSelection(partSelection(element, selection.parent, element));
  }

  // ------------------------------------------------------------ the sheet

  const widths = useMemo(() => (draft ? columnWidths(report, draft) : {}), [report, draft]);
  const tableMm = tableWidthMm(report, draft ?? undefined);

  const dragWidthMm = useMemo(() => {
    if (!drag || !draft) return null;
    const moved = moveColumnEdge(report, draft, drag.col, ((drag.x - drag.startX) / drag.tableWidthPx) * 100);
    return (columnWidths(report, moved)[drag.col]! / 100) * tableMm;
  }, [drag, draft, report, tableMm]);

  // The selection drawn on the sheet: Excel's green outline and a light tint.
  const editorCss = useMemo(() => {
    const root = `#${LAYOUT_ROOT_ID} table[data-layout]`;
    const rules = [
      `${root} :is(td, th)[data-col] { cursor: ${painter ? "copy" : "cell"}; }`,
      `#${LAYOUT_ROOT_ID} [data-part] { cursor: ${painter ? "copy" : "pointer"}; }`,
    ];
    const tint = "box-shadow: inset 0 0 0 100vmax rgba(33, 115, 70, 0.14);";
    const outline = "outline: 2px solid #217346; outline-offset: -2px;";
    if (selection?.kind === "part") {
      rules.push(
        `#${LAYOUT_ROOT_ID} [data-part=${cssString(selection.part)}] { outline: 2px solid #217346; outline-offset: 1px; }`,
      );
    } else if (selection) {
      for (const target of targets) {
        if (target.kind === "col") rules.push(`${root} :is(td, th)[data-col=${cssString(target.col)}] { ${tint} }`);
        else if (target.kind === "row") {
          const attribute = target.row.startsWith("group:") ? "data-row-group" : "data-row";
          rules.push(`${root} tr[${attribute}=${cssString(target.row)}] > :is(td, th) { ${tint} }`);
        } else if (target.kind === "cell") {
          rules.push(
            `${root} tr[data-row=${cssString(target.row)}] > :is(td, th)[data-col=${cssString(target.col)}] { ${tint} }`,
          );
        }
      }
      const { anchor } = selection;
      if (anchor.row !== null) {
        rules.push(
          `${root} tr[data-row=${cssString(anchor.row)}] > :is(td, th)[data-col=${cssString(anchor.col)}] { ${outline} }`,
        );
      }
    }
    return rules.join("\n");
  }, [selection, targets, painter]);

  if (failure !== null) {
    return (
      <div className="excel-editor">
        <div className="state error">
          <p>{t.couldNotLoad}</p>
          <p className="num">{failure}</p>
          <button className="ghost" onClick={onClose}>
            {t.layoutDone}
          </button>
        </div>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="excel-editor">
        <div className="state">{t.loading}</div>
      </div>
    );
  }

  // ------------------------------------------------------------ the ribbon

  const defaults = REPORT_DEFAULTS[report];
  const column = cellSelection ? columns.find((each) => each.id === cellSelection.anchor.col) : undefined;
  const part = selection?.kind === "part" ? REPORT_PARTS[report].find((each) => each.id === selection.part) : undefined;
  // A row's height, as Excel has it: whatever is selected in a row - one cell
  // or a range - sets the height of its whole row, and that row in every block.
  const heightTargets: LayoutTarget[] =
    selection?.kind === "part"
      ? [{ kind: "part", part: selection.part }]
      : cellSelection
        ? [
            ...new Set(
              cellSelection.cells
                .map((cell) => cell.group ?? cell.row)
                .filter((row): row is string => row !== null && row !== "head"),
            ),
          ].map((row): LayoutTarget => ({ kind: "row", row }))
        : [];
  const heightNow = heightTargets[0] ? draft.styles[targetKey(heightTargets[0])]?.heightMm : undefined;
  const setHeight = (heightMm: number | undefined): void => {
    let next = draft;
    for (const target of heightTargets) next = withStyle(next, target, { heightMm });
    change(next);
  };
  const gapKey = cellSelection ? (cellSelection.anchor.group ?? cellSelection.anchor.row) : null;
  const needsSelection = reportMode ? t.excelNeedsSelection : undefined;

  const nameBox = part
    ? t.layoutPart(part.labelGu)
    : cellSelection && column
      ? `${t.layoutColumn(column.labelGu)}${cellSelection.anchor.row === "head" ? ` · ${t.layoutHeadRow}` : ""}${
          cellSelection.cells.length > 1 ? ` · ${t.excelCellsSelected(cellSelection.cells.length)}` : ""
        }`
      : t.excelWholeReport;

  const page = resolvePage(report, draft.page);
  const setPage = (patch: PageSetup): void => {
    const next = cleanPage(report, { ...(draft.page ?? {}), ...patch });
    const layout: ReportLayout = { ...draft };
    if (Object.keys(next).length === 0) delete layout.page;
    else layout.page = next;
    change(layout);
  };

  const homeTab = (
    <>
      <Group label={t.excelGroupClipboard}>
        <RibbonButton
          big
          icon="💾"
          label={saving ? t.layoutSaving : t.layoutSave}
          disabled={!dirty || saving}
          onClick={() => void save()}
        />
        <div className="ribbon-rows">
          <RibbonButton icon="↶" label={t.layoutUndo} disabled={past.length === 0} onClick={undo} />
          <RibbonButton icon="↷" label={t.excelRedo} disabled={future.length === 0} onClick={redo} />
          <RibbonButton
            icon="🖌"
            label={t.excelPainter}
            active={painter !== null}
            disabled={reportMode}
            title={needsSelection ?? t.excelPainterHelp}
            onClick={() => setPainter(painter ? null : { ...own })}
          />
        </div>
        <RibbonButton
          big
          icon="⌫"
          label={t.layoutClearFormat}
          disabled={reportMode || targets.every((target) => !draft.styles[targetKey(target)])}
          onClick={() => apply(CLEARED)}
        />
      </Group>

      <Group label={t.excelGroupFont}>
        <div className="ribbon-rows">
          <div className="ribbon-row">
            <FontPicker value={current.font} defaultLabel={t.layoutFontDefault} onChange={(font) => apply({ font })} />
            <SizeBox
              value={current.sizePt}
              placeholder={shown.sizePt ?? draft.sizePt ?? defaults.sizePt}
              onChange={(sizePt) => apply({ sizePt })}
            />
          </div>
          <div className="ribbon-row">
            <RibbonButton
              icon={<b>B</b>}
              title={needsSelection ?? `${t.layoutBold} (Ctrl+B)`}
              active={(own.bold ?? shown.bold) === true}
              disabled={reportMode}
              onClick={() => toggle("bold")}
            />
            <RibbonButton
              icon={<i>I</i>}
              title={needsSelection ?? `${t.excelItalic} (Ctrl+I)`}
              active={(own.italic ?? shown.italic) === true}
              disabled={reportMode}
              onClick={() => toggle("italic")}
            />
            <RibbonButton
              icon={<u>U</u>}
              title={needsSelection ?? `${t.excelUnderline} (Ctrl+U)`}
              active={(own.underline ?? shown.underline) === true}
              disabled={reportMode}
              onClick={() => toggle("underline")}
            />
            <BorderMenu
              disabled={reportMode}
              pen={pen}
              onPen={setPen}
              onBorder={border}
              lineColour={current.lineColour}
              onLineColour={(lineColour) => apply({ lineColour })}
            />
            <ColourButton
              icon="🪣"
              title={needsSelection ?? t.layoutHighlight}
              value={reportMode ? undefined : own.fill}
              noneValue={NO_FILL}
              noneLabel={t.layoutFillBlank}
              disabled={reportMode}
              onChange={(fill) => apply({ fill })}
            />
            <ColourButton
              icon={<span className="font-colour-a">A</span>}
              title={t.layoutTextColour}
              value={current.colour}
              onChange={(colour) => apply({ colour })}
            />
          </div>
        </div>
      </Group>

      <Group label={t.excelGroupAlignment}>
        <div className="ribbon-rows">
          <div className="ribbon-row">
            {(["top", "middle", "bottom"] as VerticalAlignment[]).map((value) => (
              <RibbonButton
                key={value}
                icon={<span className={`valign-icon ${value}`} />}
                title={needsSelection ?? t.excelVAlign[value]}
                active={own.vAlign === value}
                disabled={reportMode}
                onClick={() => apply({ vAlign: own.vAlign === value ? undefined : value })}
              />
            ))}
            <RibbonButton
              icon="↵"
              label={t.excelWrap}
              title={needsSelection}
              active={own.wrap === true}
              disabled={reportMode}
              onClick={() => apply({ wrap: own.wrap === true ? undefined : true })}
            />
          </div>
          <div className="ribbon-row">
            {(["left", "center", "right"] as Alignment[]).map((value) => (
              <RibbonButton
                key={value}
                icon={<span className={`halign-icon ${value}`} />}
                title={value === "left" ? t.layoutAlignLeft : value === "center" ? t.layoutAlignCenter : t.layoutAlignRight}
                active={current.align === value}
                onClick={() => apply({ align: current.align === value ? undefined : value })}
              />
            ))}
            <RibbonButton
              icon="⇥"
              label={t.excelOneLine}
              title={needsSelection}
              active={own.wrap === false}
              disabled={reportMode}
              onClick={() => apply({ wrap: own.wrap === false ? undefined : false })}
            />
          </div>
        </div>
        <div className="ribbon-rows">
          <MiniStepper
            label={t.excelPaddingX}
            value={reportMode ? draft.paddingXMm : own.paddingXMm}
            placeholder={defaults.paddingXMm}
            step={0.2}
            max={15}
            onChange={(paddingXMm) => apply({ paddingXMm })}
          />
          <MiniStepper
            label={t.excelPaddingY}
            value={reportMode ? draft.paddingYMm : own.paddingYMm}
            placeholder={defaults.paddingYMm}
            step={0.2}
            max={15}
            onChange={(paddingYMm) => apply({ paddingYMm })}
          />
        </div>
      </Group>

      <Group label={t.excelGroupCells}>
        <div className="ribbon-rows">
          {cellSelection && column && (
            <MiniStepper
              label={`${t.layoutWidth} (${t.mm})`}
              value={round1((widths[cellSelection.anchor.col]! / 100) * tableMm)}
              step={1}
              min={1}
              max={round1(tableMm)}
              onChange={(mm) => {
                if (mm !== undefined) {
                  change(setColumnWidth(report, draft, cellSelection.anchor.col, (mm / tableMm) * 100));
                }
              }}
            />
          )}
          {part?.sizable && selection?.kind === "part" && (
            <MiniStepper
              label={`${t.layoutPartWidth} (${t.mm})`}
              value={own.widthMm}
              placeholder={selection.widthMm}
              step={1}
              min={5}
              max={400}
              onChange={(widthMm) => apply({ widthMm })}
            />
          )}
          {heightTargets.length > 0 && (
            <MiniStepper
              label={`${t.layoutThisRowHeight} (${t.mm})`}
              value={heightNow}
              placeholder={
                selection?.kind === "part" ? selection.heightMm : (cellSelection?.anchor.rowMm ?? undefined)
              }
              step={0.5}
              min={2}
              max={80}
              onChange={setHeight}
            />
          )}
          {cellSelection?.anchor.gapAllowed && gapKey !== null && (
            <MiniStepper
              label={`${t.layoutGapAfter} (${t.mm})`}
              value={draft.rowGapsMm[gapKey]}
              placeholder={0}
              step={1}
              max={80}
              onChange={(mm) => change(withRowGap(draft, gapKey, mm ?? null))}
            />
          )}
          {!cellSelection && !part && <span className="ribbon-hint">{t.excelCellsHint}</span>}
          {heightTargets.length > 0 && cellSelection?.anchor.group && (
            <span className="ribbon-hint">{t.excelRowHeightHint}</span>
          )}
        </div>
      </Group>

      {selection?.text && (
        <Group label={t.excelGroupText}>
          <TextEditor
            key={selection.text.id}
            text={selection.text}
            value={draft.texts?.[selection.text.id]}
            onChange={(value) => change(withText(draft, selection.text!.id, value))}
          />
        </Group>
      )}

      <Group label={t.layoutApplyTo}>
        <div className="ribbon-rows">
          {(
            [
              ["cell", t.layoutScopeCell],
              ["row", t.excelScopeRow],
              ["col", t.layoutScopeColumn],
            ] as const
          ).map(([id, label]) => {
            const off = !cellSelection || (id !== "col" && !anchorHasRow);
            return (
              <label key={id} className={`ribbon-radio${off ? " disabled" : ""}`}>
                <input
                  type="radio"
                  name="excel-scope"
                  checked={cellSelection !== null && effectiveScope === id}
                  disabled={off}
                  onChange={() => setScope(id)}
                />
                {label}
              </label>
            );
          })}
        </div>
      </Group>
    </>
  );

  const resetPage = (): void => {
    const layout: ReportLayout = { ...draft };
    delete layout.page;
    change(layout);
  };

  const pageTab = (
    <>
      <Group label={t.printPaper}>
        <select
          className="ribbon-select"
          value={page.paper}
          onChange={(event) => setPage({ paper: event.target.value as PaperId })}
        >
          {PAPER_SIZES.map((paper) => (
            <option key={paper.id} value={paper.id}>
              {paper.labelGu} ({t.printPaperSizeMm(paper.shortMm, paper.longMm)})
            </option>
          ))}
        </select>
      </Group>
      <Group label={t.printOrientation}>
        {ORIENTATIONS.map((orientation) => (
          <RibbonButton
            key={orientation}
            big
            icon={<span className={`orientation-icon ${orientation}`} />}
            label={orientation === "landscape" ? t.printLandscape : t.printPortrait}
            active={(page.landscape ? "landscape" : "portrait") === orientation}
            onClick={() => setPage({ orientation })}
          />
        ))}
      </Group>
      <Group label={t.printMargin}>
        <MiniStepper
          label={t.mm}
          value={page.marginMm}
          step={1}
          max={30}
          onChange={(marginMm) => setPage({ marginMm: marginMm ?? DEFAULT_PAGE[report].marginMm })}
        />
      </Group>
      <Group label={t.printScale}>
        <MiniStepper
          label="%"
          value={Math.round(page.scale * 100)}
          step={5}
          min={MIN_SCALE_PCT}
          max={MAX_SCALE_PCT}
          onChange={(scalePct) => setPage({ scalePct: Math.round(scalePct ?? 100) })}
        />
        <RibbonButton icon="⤢" label={t.printFit} onClick={() => setPage({ scalePct: fitScalePct(report, draft.page) })} />
      </Group>
      <Group label={t.printReset}>
        <RibbonButton big icon="↺" label={t.printReset} disabled={!draft.page} onClick={resetPage} />
      </Group>
    </>
  );

  const reportTab = (
    <>
      <Group label={t.excelGroupFont}>
        <div className="ribbon-row">
          <FontPicker
            value={draft.font}
            defaultLabel={`${t.layoutFontDefault} (Noto Sans Gujarati)`}
            onChange={(font) => change(withReport(draft, { font }))}
          />
          <SizeBox
            value={draft.sizePt}
            placeholder={defaults.sizePt}
            onChange={(sizePt) => change(withReport(draft, { sizePt }))}
          />
        </div>
      </Group>
      <Group label={t.excelGroupColours}>
        <ColourButton
          icon={<span className="font-colour-a">A</span>}
          title={t.layoutTextColour}
          value={draft.colour}
          onChange={(colour) => change(withReport(draft, { colour }))}
        />
        <ColourButton
          icon="▦"
          title={t.layoutLineColour}
          value={draft.lineColour}
          onChange={(lineColour) => change(withReport(draft, { lineColour }))}
        />
        <label className="ribbon-check">
          <input
            type="checkbox"
            checked={draft.plain === true}
            onChange={(event) => change(withReport(draft, { plain: event.target.checked ? true : undefined }))}
          />
          {t.layoutPlain}
        </label>
      </Group>
      <Group label={t.excelGroupSpacing}>
        <div className="ribbon-rows">
          <MiniStepper
            label={t.layoutPaddingX}
            value={draft.paddingXMm}
            placeholder={defaults.paddingXMm}
            step={0.2}
            max={15}
            onChange={(paddingXMm) => change(withReport(draft, { paddingXMm }))}
          />
          <MiniStepper
            label={t.layoutPaddingY}
            value={draft.paddingYMm}
            placeholder={defaults.paddingYMm}
            step={0.2}
            max={15}
            onChange={(paddingYMm) => change(withReport(draft, { paddingYMm }))}
          />
          <MiniStepper
            label={t.layoutRowHeight}
            value={draft.rowHeightMm}
            placeholder={defaults.rowHeightMm ?? undefined}
            step={0.5}
            min={2}
            max={60}
            onChange={(rowHeightMm) => change(withReport(draft, { rowHeightMm }))}
          />
        </div>
      </Group>
      <Group label={t.excelGroupReset}>
        <RibbonButton
          icon="↔"
          label={t.layoutResetWidths}
          disabled={Object.keys(draft.widths).length === 0}
          onClick={() => change({ ...draft, widths: {} })}
        />
        {/* The paper and zoom stay: they are the Page Layout tab's. */}
        <RibbonButton
          icon="↺"
          label={t.layoutResetAll}
          onClick={() => change(draft.page ? { ...emptyLayout(), page: draft.page } : emptyLayout())}
        />
      </Group>
    </>
  );

  const viewTab = (
    <Group label={t.excelGroupZoom}>
      {VIEW_ZOOMS.map((zoom) => (
        <RibbonButton key={zoom} label={`${zoom}%`} active={viewZoom === zoom} onClick={() => setViewZoom(zoom)} />
      ))}
    </Group>
  );

  return (
    <div className="excel-editor">
      <div className="excel-titlebar">
        <span className="excel-title">
          {t.layoutEdit} — {reportLabel}
          {dirty ? " •" : ""}
        </span>
        <div className="excel-titlebar-actions">
          <button className="primary small" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? t.layoutSaving : t.layoutSave}
          </button>
          <button className="ghost small" onClick={close}>
            {dirty ? t.layoutDiscard : t.layoutDone}
          </button>
        </div>
      </div>

      <div className="excel-tabs" role="tablist">
        {(
          [
            ["home", t.excelTabHome],
            ["page", t.excelTabPage],
            ["report", t.layoutWholeReport],
            ["view", t.excelTabView],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "chosen" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="excel-ribbon">
        {tab === "home" ? homeTab : tab === "page" ? pageTab : tab === "report" ? reportTab : viewTab}
      </div>

      <div className="excel-namebar">
        <span className="excel-namebox">{nameBox}</span>
        {selection?.kind === "part" && selection.parent && (
          <button className="link" onClick={selectParent}>
            {t.layoutSelectParent(
              REPORT_PARTS[report].find((each) => each.id === selection.parent)?.labelGu ?? selection.parent,
            )}
          </button>
        )}
        {cellSelection && effectiveScope === "row" && cellSelection.anchor.group !== null && (
          <span className="excel-namebar-note">{t.layoutGroupNote}</span>
        )}
        {painter && <span className="excel-namebar-note">{t.excelPainterActive}</span>}
        {reportMode && <span className="excel-namebar-note">{t.excelReportModeNote}</span>}
      </div>

      <div
        className={`excel-sheet layout-canvas${overEdge || drag ? " resizing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onClick={onClick}
      >
        <div style={{ zoom: viewZoom / 100 } as CSSProperties}>
          <PrintRoot report={report} layout={draft} editorCss={editorCss} onChecked={updateCheck} />
        </div>
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

      <div className="excel-statusbar">
        {message && <span className={message.kind === "ok" ? "ok" : "error"}>{message.text}</span>}
        {check.sheets.length > 0 && <span className="error">{t.layoutOverflow(check.sheets.join(", "))}</span>}
        {check.cells > 0 && <span className="warn">{t.layoutCellsOverflow(check.cells)}</span>}
        <span className="excel-statusbar-hint">{report === "rojmel" ? t.layoutRojmelNote : t.layoutExcelNote}</span>
        <span className="excel-statusbar-zoom">{viewZoom}%</span>
      </div>
    </div>
  );
}

/** A text reworded; empty or `undefined` puts the form's own wording back. */
function withText(layout: ReportLayout, id: string, value: string | undefined): ReportLayout {
  const texts = { ...(layout.texts ?? {}) };
  if (value === undefined || value.trim() === "") delete texts[id];
  else texts[id] = value;
  return { ...layout, texts };
}

/** The words of a heading or label, editable; {names} in them are filled with the figures. */
function TextEditor({
  text,
  value,
  onChange,
}: {
  text: TextRef;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}): JSX.Element {
  const t = useStrings();
  const [draft, setDraft] = useState(value ?? text.fallback);
  useEffect(() => setDraft(value ?? text.fallback), [value, text.fallback]);
  const commit = (): void => {
    if (draft === (value ?? text.fallback)) return;
    onChange(draft === text.fallback ? undefined : draft);
  };
  return (
    <div className="ribbon-rows text-editor">
      <textarea
        value={draft}
        rows={text.fallback.length > 40 ? 3 : 1}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            commit();
          }
        }}
      />
      <div className="ribbon-row">
        <button type="button" className="ribbon-button" disabled={value === undefined} onClick={() => onChange(undefined)}>
          ↺ {t.excelTextReset}
        </button>
        {text.vars.length > 0 && (
          <span className="ribbon-hint">{t.excelTextVars(text.vars.map((name) => `{${name}}`).join(" "))}</span>
        )}
      </div>
    </div>
  );
}

/** Report-wide settings changed; `undefined` takes one back to the form's default. */
function withReport(layout: ReportLayout, patch: Partial<ReportLayout>): ReportLayout {
  const next: ReportLayout = { ...layout, ...patch };
  for (const key of Object.keys(patch) as (keyof ReportLayout)[]) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}

// ----------------------------------------------------------- ribbon pieces

function Group({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="ribbon-group">
      <div className="ribbon-group-body">{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </div>
  );
}

function RibbonButton({
  icon,
  label,
  title,
  big = false,
  active = false,
  disabled = false,
  onClick,
}: {
  icon?: ReactNode;
  label?: string;
  title?: string | undefined;
  big?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`ribbon-button${big ? " big" : ""}${active ? " active" : ""}`}
      title={title ?? label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon !== undefined && <span className="ribbon-button-icon">{icon}</span>}
      {label && <span className="ribbon-button-label">{label}</span>}
    </button>
  );
}

/** A small number box with − and +; empty means "the default", shown as the placeholder. */
function MiniStepper({
  label,
  value,
  placeholder,
  step,
  min = 0,
  max = 1000,
  onChange,
}: {
  label: string;
  value: number | undefined;
  placeholder?: number | undefined;
  step: number;
  min?: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}): JSX.Element {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  const clamp = (next: number): number => Math.round(Math.min(max, Math.max(min, next)) * 100) / 100;
  const base = value ?? placeholder ?? min;
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
    <div className="mini-stepper">
      <span className="mini-stepper-label">{label}</span>
      <button type="button" className="ribbon-button" onClick={() => onChange(clamp(base - step))} aria-label="−">
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
      <button type="button" className="ribbon-button" onClick={() => onChange(clamp(base + step))} aria-label="+">
        +
      </button>
    </div>
  );
}

/** Excel's font-size box: type a size or pick one; A▲ / A▼ step through the list. */
function SizeBox({
  value,
  placeholder,
  onChange,
}: {
  value: number | undefined;
  placeholder: number;
  onChange: (value: number | undefined) => void;
}): JSX.Element {
  const t = useStrings();
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  const now = value ?? placeholder;
  const commit = (raw: string): void => {
    if (raw.trim() === "") {
      onChange(undefined);
      return;
    }
    const parsed = Number(raw.replace(",", "."));
    if (Number.isFinite(parsed)) onChange(Math.min(40, Math.max(5, Math.round(parsed * 2) / 2)));
  };
  return (
    <div className="size-box" title={t.layoutSize}>
      <input
        className="num-input"
        list="excel-sizes"
        value={text}
        placeholder={String(placeholder)}
        onChange={(event) => {
          setText(event.target.value);
          if (SIZE_PRESETS.includes(Number(event.target.value))) commit(event.target.value);
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
        }}
      />
      <datalist id="excel-sizes">
        {SIZE_PRESETS.map((size) => (
          <option key={size} value={size} />
        ))}
      </datalist>
      <button
        type="button"
        className="ribbon-button"
        title={t.excelGrow}
        onClick={() => onChange(SIZE_PRESETS.find((size) => size > now) ?? 40)}
      >
        A<sup>▲</sup>
      </button>
      <button
        type="button"
        className="ribbon-button"
        title={t.excelShrink}
        onClick={() => onChange([...SIZE_PRESETS].reverse().find((size) => size < now) ?? 5)}
      >
        A<sub>▼</sub>
      </button>
    </div>
  );
}

/** Close a drop-down when the pointer goes down anywhere outside it. */
function useOutsideClose(open: boolean, close: () => void): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return ref;
}

/** The font box: the face's name in its own face; a gallery of tiles drops down. */
function FontPicker({
  value,
  defaultLabel,
  onChange,
}: {
  value: LayoutFontId | undefined;
  defaultLabel: string;
  onChange: (font: LayoutFontId | undefined) => void;
}): JSX.Element {
  const t = useStrings();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const chosen = LAYOUT_FONTS.find((font) => font.id === value);
  const pick = (font: LayoutFontId | undefined): void => {
    onChange(font);
    setOpen(false);
  };
  const tile = (font: (typeof LAYOUT_FONTS)[number]): JSX.Element => (
    <button
      key={font.id}
      type="button"
      className={`font-tile${value === font.id ? " chosen" : ""}`}
      style={{ fontFamily: `"${font.family}"` }}
      title={font.label}
      onClick={() => pick(font.id)}
    >
      <span className="font-tile-sample">શાળા ૧૨૩૪.૦૦</span>
      <span className="font-tile-name">{font.label}</span>
    </button>
  );
  return (
    <div className="font-picker" ref={ref}>
      <button
        type="button"
        className="font-picker-box"
        style={chosen ? { fontFamily: `"${chosen.family}"` } : undefined}
        title={t.layoutFont}
        onClick={() => setOpen(!open)}
      >
        <span className="font-picker-name">{chosen ? chosen.label : defaultLabel}</span>
        <span className="font-picker-arrow">▾</span>
      </button>
      {open && (
        <div className="font-picker-popover">
          <button
            type="button"
            className={`font-tile wide${value === undefined ? " chosen" : ""}`}
            onClick={() => pick(undefined)}
          >
            <span className="font-tile-sample">↺</span>
            <span className="font-tile-name">{defaultLabel}</span>
          </button>
          <div className="palette-heading">{t.fontRecommended}</div>
          <div className="font-tiles">{LAYOUT_FONTS.filter((font) => "recommended" in font).map(tile)}</div>
          <div className="palette-heading">{t.fontGalleryOthers}</div>
          <div className="font-tiles">{LAYOUT_FONTS.filter((font) => !("recommended" in font)).map(tile)}</div>
          <span className="layout-hint">{t.fontGalleryNote}</span>
        </div>
      )}
    </div>
  );
}

/** Excel's Borders button: which edges, then the line's style and colour. */
function BorderMenu({
  disabled,
  pen,
  onPen,
  onBorder,
  lineColour,
  onLineColour,
}: {
  disabled: boolean;
  pen: Pen;
  onPen: (pen: Pen) => void;
  onBorder: (command: BorderCommand) => void;
  lineColour: string | undefined;
  onLineColour: (colour: string | undefined) => void;
}): JSX.Element {
  const t = useStrings();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const commands: [BorderCommand, string, string][] = [
    ["bottom", "▁", t.excelBorder.bottom],
    ["top", "▔", t.excelBorder.top],
    ["left", "▏", t.excelBorder.left],
    ["right", "▕", t.excelBorder.right],
    ["none", "⬚", t.excelBorder.none],
    ["all", "▦", t.excelBorder.all],
    ["outside", "□", t.excelBorder.outside],
    ["thickOutside", "■", t.excelBorder.thickOutside],
  ];
  const run = (command: BorderCommand): void => {
    onBorder(command);
    setOpen(false);
  };
  const styles = BORDER_STYLES.filter((style): style is Exclude<BorderStyle, "none"> => style !== "none");
  return (
    <div className="colour-button" ref={ref}>
      <button
        type="button"
        className="ribbon-button colour-button-main"
        disabled={disabled}
        title={t.excelBorder.all}
        onClick={() => onBorder("all")}
      >
        <span className="colour-button-icon">▦</span>
        <span className="colour-button-bar" style={{ background: pen.colour ?? lineColour ?? "#000" }} />
      </button>
      <button
        type="button"
        className="ribbon-button colour-button-arrow"
        disabled={disabled}
        title={t.excelBorders}
        onClick={() => setOpen(!open)}
      >
        ▾
      </button>
      {open && (
        <div className="palette-popover border-menu">
          <div className="palette-heading">{t.excelBorders}</div>
          {commands.map(([command, icon, label]) => (
            <button key={command} type="button" className="border-menu-item" onClick={() => run(command)}>
              <span className="border-menu-icon">{icon}</span> {label}
            </button>
          ))}
          <div className="palette-heading">{t.excelLineStyle}</div>
          <div className="border-styles">
            {styles.map((style) => (
              <button
                key={style}
                type="button"
                className={`border-style${pen.style === style ? " chosen" : ""}`}
                title={t.excelLineStyles[style]}
                onClick={() => onPen({ ...pen, style })}
              >
                <span className={`border-sample ${style}`} />
              </button>
            ))}
          </div>
          <div className="palette-heading">{t.excelLineColour}</div>
          <div className="ribbon-row">
            <ColourButton
              icon="✎"
              title={t.excelLineColour}
              value={pen.colour}
              onChange={(colour) => onPen({ ...pen, colour })}
            />
            <span className="layout-hint">{t.excelPenNote}</span>
          </div>
          <div className="palette-heading">{t.layoutLineColour}</div>
          <div className="ribbon-row">
            <ColourButton icon="▦" title={t.layoutLineColour} value={lineColour} onChange={onLineColour} />
          </div>
        </div>
      )}
    </div>
  );
}
