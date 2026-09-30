import { Fragment, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GapRow, LayoutColGroup, layoutFontsReady, useReportLayout } from "./layout-context.js";
import type { JSX, ReactNode } from "react";

/**
 * A table that runs over as many sheets as it needs, split where it really
 * fills the page.
 *
 * The forms print at 14pt (docs/DECISIONS.md, "Report font size"). At that size a
 * Gujarati description wraps onto two or three lines, so "22 rows to a page"
 * stops being true: how many rows a sheet holds depends on what is in them.
 * Guessing would either waste paper or - worse - run a table off the bottom of
 * the sheet, where the PDF quietly crops it.
 *
 * So the table is first laid out once, invisibly, on a sheet of exactly the
 * printed width; every row is measured; and the rows are then packed onto real
 * sheets, each repeating the heading and the column titles. A row is never
 * split. Totals and signatures go on the last sheet, which takes rows with it
 * onto a sheet of its own if they do not fit under the last rows.
 *
 * Nothing is signalled ready for the PDF until the packing is done (see
 * PrintLayoutGate), so printToPDF never captures the invisible first pass.
 */

/** Rounding and hairline borders: a sheet is never packed to the last pixel. */
const SAFETY_PX = 4;

export interface PagedRow {
  /** The row's layout key (ROW_KEYS): what a highlight or a gap is attached to. */
  key: string;
  className?: string;
  /** The row's <td> cells. */
  cells: ReactNode;
}

export interface PagedSheetsProps {
  landscape: boolean;
  /** Above the table on every sheet: the form's title, the school's details. */
  head: (sheet: number, sheets: number) => ReactNode;
  tableClassName: string;
  /** The column titles, repeated on every sheet - a <tr data-row="head"> of <th>. */
  thead: ReactNode;
  rows: PagedRow[];
  /** Table rows after the last entry only - the કુલ line. */
  lastRows?: ReactNode;
  /** Below the table on the last sheet only - signatures, a certificate. */
  foot?: ReactNode;
  /** Below the table on every sheet. */
  everyFoot?: ReactNode;
}

// ---------------------------------------------------------- readiness gate

export interface Gate {
  /** Register a layout still being worked out; call the result when it is done. */
  begin: () => () => void;
}

export const PrintLayoutGate = createContext<Gate | null>(null);

/**
 * For PrintRoot: the gate, and how many layouts are still pending. The report
 * is ready for the PDF only once that is zero. `settled` changes each time one
 * finishes, so an effect can wait on it.
 */
export function usePrintLayoutGate(): { gate: Gate; pending: () => number; settled: number } {
  const pending = useRef(0);
  const [settled, setSettled] = useState(0);
  const gate = useRef<Gate>({
    begin: () => {
      pending.current += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        pending.current -= 1;
        setSettled((count) => count + 1);
      };
    },
  });
  // One function for the component's life: PrintRoot's readiness effect lists
  // it as a dependency, and a new one each render would re-run that effect -
  // and the shrink-to-fit pass with it - after every render.
  const read = useRef(() => pending.current);
  return { gate: gate.current, pending: read.current, settled };
}

// ---------------------------------------------------------------- packing

export interface Measured {
  /** From the top of the sheet to the top of the table. */
  headPx: number;
  theadPx: number;
  rowPx: number[];
  lastRowsPx: number;
  footPx: number;
  everyFootPx: number;
}

/**
 * Which rows go on which sheet. Pure, so the packing rules are tested without a
 * browser (tests/print-paging.test.ts).
 */
export function packRows(measured: Measured, sheetPx: number): number[][] {
  const room = sheetPx - SAFETY_PX - measured.headPx - measured.theadPx - measured.everyFootPx;
  const height = (sheet: number[]): number => sheet.reduce((sum, index) => sum + measured.rowPx[index]!, 0);

  const sheets: number[][] = [[]];
  measured.rowPx.forEach((rowPx, index) => {
    const current = sheets[sheets.length - 1]!;
    if (current.length > 0 && height(current) + rowPx > room) sheets.push([index]);
    else current.push(index);
  });

  // The totals and signatures belong under the last rows. When they do not fit
  // there they start a sheet of their own - taking the last row with them, so
  // a total never stands alone at the top of a sheet. The sheet they leave
  // already fitted without them, so one row is all that has to move.
  const tail = measured.lastRowsPx + measured.footPx;
  const last = sheets[sheets.length - 1]!;
  if (last.length > 0 && height(last) + tail > room) {
    const lastRow = last[last.length - 1]!;
    const withCompany = last.length > 1 && measured.rowPx[lastRow]! + tail <= room;
    sheets.push(withCompany ? [last.pop()!] : []);
  }
  return sheets;
}

// -------------------------------------------------------------- component

export function PagedSheets(props: PagedSheetsProps): JSX.Element {
  const gate = useContext(PrintLayoutGate);
  const layout = useReportLayout();
  const measureRef = useRef<HTMLDivElement>(null);

  // A new layout - wider columns, a larger font, space after a row - changes how
  // tall every row is, so the sheets are packed again. The old sheets stay on
  // screen until the new ones are ready, so the editor does not flicker.
  const measureKey = `${props.rows.length}|${props.landscape}|${layout?.version ?? ""}`;
  const [packed, setPacked] = useState<{ key: string; sheets: number[][] } | null>(null);
  const measuring = packed === null || packed.key !== measureKey;

  // Held from the render that starts a measurement until its sheets are on the
  // page, so the PDF is never captured from the invisible pass.
  const done = useRef<(() => void) | null>(null);
  if (measuring && done.current === null && gate) done.current = gate.begin();

  useLayoutEffect(() => {
    if (!measuring) return;
    let cancelled = false;
    const measure = (): void => {
      const root = measureRef.current;
      if (!root || cancelled) return;
      // The printed height of one sheet is the stylesheet's, which knows the
      // paper, the orientation and this report's margins (print.css, ".sheet").
      const sheetPx = parseFloat(getComputedStyle(root).minHeight);
      const top = root.getBoundingClientRect().top;
      const heightOf = (element: Element | null): number =>
        element ? element.getBoundingClientRect().height : 0;
      // A row's height includes the blank band printed after it, if any: the
      // two always go onto the same sheet.
      const withGap = (row: Element): number => {
        const next = row.nextElementSibling;
        return heightOf(row) + (next?.classList.contains("layout-gap") ? heightOf(next) : 0);
      };
      // The paged table, not a details table inside the head.
      const table = root.querySelector("table[data-paged='table']");
      setPacked({
        key: measureKey,
        sheets: packRows(
          {
            headPx: table ? table.getBoundingClientRect().top - top : 0,
            theadPx: heightOf(table?.querySelector(":scope > thead") ?? null),
            rowPx: [...(table?.querySelectorAll(":scope > tbody > tr[data-paged-row]") ?? [])].map(withGap),
            lastRowsPx: [
              ...(table?.querySelectorAll(":scope > tbody > tr:not([data-paged-row]):not(.layout-gap)") ?? []),
            ]
              .map(heightOf)
              .reduce((sum, value) => sum + value, 0),
            footPx: heightOf(root.querySelector(":scope > [data-paged='foot']")),
            everyFootPx: heightOf(root.querySelector(":scope > [data-paged='every']")),
          },
          sheetPx,
        ),
      });
    };
    // Measure only once the fonts are in: a fallback font breaks lines in
    // different places. No animation frame is needed - reading a size forces
    // layout - and a hidden window (the PDF's) may never deliver one.
    void layoutFontsReady(layout?.layout).then(measure);
    return () => {
      cancelled = true;
    };
    // The row nodes are rebuilt every render; the layout depends on how many
    // there are, on the sheet and on the school's layout - the measure key.
  }, [measureKey, measuring]);

  useEffect(() => {
    if (measuring || !done.current) return;
    const finish = done.current;
    done.current = null;
    finish();
  }, [measuring, packed]);

  const className = `sheet${props.landscape ? " landscape" : ""}`;
  const entry = (row: PagedRow): JSX.Element => (
    <Fragment key={row.key}>
      <tr data-paged-row="" data-row={row.key} className={row.className}>
        {row.cells}
      </tr>
      <GapRow rowKey={row.key} />
    </Fragment>
  );
  const block = (kind: "head" | "foot" | "every", content: ReactNode): JSX.Element | null =>
    content ? (
      // flow-root keeps each block's inner margins inside it, so what is
      // measured here is exactly the room it takes on the real sheet.
      <div data-paged={kind} style={{ display: "flow-root" }}>
        {content}
      </div>
    ) : null;
  const table = (rows: PagedRow[], withLastRows: boolean): JSX.Element => (
    <table className={props.tableClassName} data-paged="table" data-layout="">
      <LayoutColGroup />
      <thead>{props.thead}</thead>
      <tbody>
        {rows.map(entry)}
        {withLastRows && props.lastRows}
      </tbody>
    </table>
  );

  return (
    <>
      {measuring && (
        // The measuring pass: everything on one sheet of the printed width, out of sight.
        <div
          ref={measureRef}
          className={className}
          aria-hidden
          style={{ position: "absolute", left: -100000, top: 0, visibility: "hidden" }}
        >
          {block("head", props.head(0, 1))}
          {table(props.rows, true)}
          {block("foot", props.foot)}
          {block("every", props.everyFoot)}
        </div>
      )}

      {packed?.sheets.map((indexes, sheet, sheets) => {
        const isLast = sheet === sheets.length - 1;
        // While a new packing is measured the old one is still shown; rows it
        // names may be gone if the data changed underneath it.
        const rows = indexes.map((index) => props.rows[index]).filter((row) => row !== undefined);
        return (
          <div className={className} key={sheet}>
            {block("head", props.head(sheet, sheets.length))}
            {table(rows, isLast)}
            {isLast && block("foot", props.foot)}
            {block("every", props.everyFoot)}
          </div>
        );
      })}
    </>
  );
}
