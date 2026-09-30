import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import type { DashboardDto, GrantRegisterRowDto } from "../../shared/api.js";
import { PRINTABLE_REPORTS, type PrintableReportId } from "../../shared/api.js";
import type { Rojmel } from "../../engine/rojmel.js";
import type { Annexure9, Ledger } from "../../engine/types.js";
import type {
  BillRegisterRow,
  ChequeRegisterRow,
  PatrakDRow,
  Voucher,
} from "../../engine/registers.js";
import { Annexure10Page } from "./Annexure10Page.js";
import { Annexure9Page } from "./Annexure9Page.js";
import { KhatavahiPages } from "./KhatavahiPage.js";
import { RojmelSheet } from "./RojmelPage.js";
import {
  BillRegisterPages,
  ChequeRegisterPages,
  GrantRegisterPages,
  PatrakDPages,
  VoucherPages,
} from "./RegisterPages.js";
import { PrintLayoutGate, usePrintLayoutGate } from "./PagedSheets.js";
import { ReportLayoutContext, layoutFontsReady, type ReportLayoutValue } from "./layout-context.js";
import {
  LANDSCAPE_REPORTS,
  NARROW_MARGIN_REPORTS,
  columnWidths,
  layoutCss,
  type ReportLayout,
} from "../../shared/report-layout.js";
import "./print.css";

/**
 * The print view: one report, no application chrome.
 *
 * Reached at `#print:<report>`. The same component serves the on-screen preview
 * and the PDF, because the PDF is produced by loading this very route in an
 * offscreen window and calling printToPDF on it. What the user proofreads is
 * therefore the same DOM that becomes the file.
 *
 * The school's own layout for the report (shared/report-layout.ts) is applied
 * here: a stylesheet for fonts, sizes, spacing and highlights, and a context the
 * pages read for column widths and the space after a row. The editor on the
 * Reports screen passes the layout being edited instead of the saved one, so
 * the preview shows each change before it is saved.
 *
 * When the data has rendered - and every table long enough to run over sheets
 * has been measured and split (PagedSheets) - it sets `window.__printReady`.
 * The main process waits for that flag rather than guessing with a timeout, so
 * a slow query can never produce a half-empty PDF.
 */
declare global {
  interface Window {
    __printReady?: boolean;
  }
}

export const PRINT_HASH_PREFIX = "print:";

export type PrintableReport = PrintableReportId;

export function printableReportFromHash(hash: string): PrintableReport | null {
  const value = hash.replace(/^#/, "");
  if (!value.startsWith(PRINT_HASH_PREFIX)) return null;
  const report = value.slice(PRINT_HASH_PREFIX.length) as PrintableReport;
  return PRINTABLE_REPORTS.includes(report) ? report : null;
}

/**
 * Excel's "shrink to fit", for text wider than its cell. Only that cell gets
 * smaller; a row can only get shorter by it, so sheets already packed still fit.
 *
 *   an amount    - a school's first lakh-rupee total at 14pt - down to 9pt;
 *   a rojmel description, footer label or reference, kept to one line so the
 *                page holds its 26 rows - down to 7pt, the way the client sets
 *                long ones to 9 by hand. Beyond that it wraps rather than being cut;
 *   a rojmel column heading whose longest word is wider than its column.
 */
const PT = 96 / 72;

function fitCells(): void {
  // Undo an earlier pass first: after a layout change a cell may fit at its
  // full size again, or need shrinking by a different amount.
  for (const cell of document.querySelectorAll<HTMLElement>(".print-root [data-fitted]")) {
    cell.style.fontSize = "";
    cell.style.whiteSpace = "";
    cell.removeAttribute("data-fitted");
  }

  const groups: [selector: string, smallestPt: number, wrapIfStillTooWide: boolean][] = [
    ["td.figure", 9, false],
    ["table.rojmel td.detail, table.rojmel td.label, table.rojmel td.ref", 7, true],
    ["table.rojmel th", 7, false],
  ];
  const cells = groups.flatMap(([selector, smallestPt, wrap]) =>
    [...document.querySelectorAll<HTMLElement>(`.print-root .sheet:not([aria-hidden]) ${selector}`)].map(
      (cell) => ({ cell, smallestPx: smallestPt * PT, wrap }),
    ),
  );

  // Every size is read first and written after, a few rounds at most. Reading a
  // width after each write would make the browser lay out every sheet again
  // for each half-pixel step - over a thousand times for a year's rojmel.
  // Text width follows font size closely, so one round lands on (or just
  // above) the right size and the next rounds only trim what is left.
  let pending = cells;
  for (let round = 0; round < 8 && pending.length > 0; round += 1) {
    const tooWide = pending.flatMap((entry) => {
      const { cell } = entry;
      if (cell.scrollWidth <= cell.clientWidth + 1) return [];
      const style = getComputedStyle(cell);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const ratio = (cell.clientWidth - padding) / Math.max(1, cell.scrollWidth - padding);
      return [{ ...entry, size: parseFloat(style.fontSize), ratio }];
    });

    pending = [];
    for (const entry of tooWide) {
      const { cell, size, ratio, smallestPx, wrap } = entry;
      // The size that fits, to the half pixel below; at least half a pixel
      // smaller than now, so every round makes progress.
      const next = Math.max(smallestPx, Math.min(size - 0.5, Math.floor(size * ratio * 2) / 2));
      if (size > smallestPx) {
        cell.style.fontSize = `${next}px`;
        cell.setAttribute("data-fitted", "");
        pending.push(entry);
      } else if (wrap) {
        // At the smallest size and still too wide: wrap rather than cut.
        cell.style.whiteSpace = "normal";
        cell.setAttribute("data-fitted", "");
      }
    }
  }
}

/** Rounding and hairline borders: a sheet is never filled to the last pixel. */
const SPREAD_SAFETY_PX = 4;

/**
 * Share a rojmel sheet's spare height among the gaps BETWEEN its blocks, so two
 * blocks spread down the page evenly instead of leaving the space at the
 * bottom. The gap after a sheet's last block keeps its size; a sheet with one
 * block is left as it is. Everything is read first and written after, so the
 * sheets are laid out once.
 */
function spreadBlocks(): void {
  for (const cell of document.querySelectorAll<HTMLElement>(".print-root [data-spread]")) {
    cell.style.height = "";
    cell.style.padding = "";
    cell.removeAttribute("data-spread");
  }
  const sheets = document.querySelectorAll<HTMLElement>(".print-root > .sheet[data-spread-blocks]:not([aria-hidden])");
  const plans = [...sheets].map((sheet) => {
    const gaps = [...sheet.querySelectorAll<HTMLElement>("tr.block-gap > td")].slice(0, -1);
    // How far the content reaches - the sheet's own box is never shorter than
    // the paper, so its height says nothing about the space left inside it.
    const top = sheet.getBoundingClientRect().top;
    const used = Math.max(
      0,
      ...[...sheet.children].map(
        (child) => child.getBoundingClientRect().bottom + parseFloat(getComputedStyle(child).marginBottom) - top,
      ),
    );
    const room = parseFloat(getComputedStyle(sheet).minHeight) - used - SPREAD_SAFETY_PX;
    return { gaps: gaps.map((cell) => ({ cell, px: cell.getBoundingClientRect().height })), room };
  });
  for (const { gaps, room } of plans) {
    if (gaps.length === 0 || room <= 0) continue;
    const extra = room / gaps.length;
    for (const { cell, px } of gaps) {
      // No padding: the height set is then the row's whole height.
      cell.style.padding = "0";
      cell.style.height = `${px + extra}px`;
      cell.setAttribute("data-spread", "");
    }
  }
}

/**
 * Cells whose text is wider than their column even after shrink-to-fit - an
 * amount in a column a school made too narrow. The text would print across the
 * next cell, so the editor says how many there are.
 */
function overflowingCells(): number {
  const cells = document.querySelectorAll<HTMLElement>(
    ".print-root > .sheet:not([aria-hidden]) table[data-layout] td",
  );
  return [...cells].filter((cell) => cell.scrollWidth > cell.clientWidth + 1).length;
}

/**
 * Sheets whose content no longer fits the paper - 1-based, in print order. The
 * forms fit by default; a school that makes the type larger or adds space can
 * push a sheet past its edge, and the PDF would silently crop it there. The
 * editor says so instead.
 */
function overflowingSheets(): number[] {
  const sheets = document.querySelectorAll<HTMLElement>(".print-root > .sheet:not([aria-hidden])");
  return [...sheets].flatMap((sheet, index) => {
    const room = parseFloat(getComputedStyle(sheet).minHeight);
    const tooTall = sheet.getBoundingClientRect().height > room + 1;
    const tooWide = sheet.scrollWidth > sheet.clientWidth + 1;
    return tooTall || tooWide ? [index + 1] : [];
  });
}

/** Everything a print page might need, fetched per report rather than always. */
interface PrintData {
  dashboard: DashboardDto;
  rojmel?: Rojmel;
  grantRegister?: GrantRegisterRowDto[];
  chequeRegister?: ChequeRegisterRow[];
  billRegister?: BillRegisterRow[];
  vouchers?: Voucher[];
  patrakD?: PatrakDRow[];
  ledgers?: Ledger[];
  annexure9?: Annexure9;
  /** The school's saved layout - unless the editor passed one to preview. */
  layout: ReportLayout;
}

export interface PrintRootProps {
  report: PrintableReport;
  /** A layout to preview instead of the saved one (the editor's draft). */
  layout?: ReportLayout;
  /** Extra rules for the editor: the selected cell's outline, the cursor. */
  editorCss?: string;
  /** Told, after every layout pass, what no longer fits: sheets (1-based) and cells. */
  onChecked?: (check: LayoutCheck) => void;
}

export interface LayoutCheck {
  /** Sheets taller or wider than the paper, 1-based in print order. */
  sheets: number[];
  /** How many cells hold text wider than their column. */
  cells: number;
}

/** The id the layout stylesheet is scoped to: it outranks print.css's classes. */
export const LAYOUT_ROOT_ID = "report-layout";

export function PrintRoot({ report, layout: draft, editorCss, onChecked }: PrintRootProps): JSX.Element {
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gate = usePrintLayoutGate();

  useEffect(() => {
    void (async () => {
      try {
        // Only what this report needs: the rojmel and the registers are far
        // larger than the dashboard, and fetching all of them for one page
        // would make every export pay for every report.
        const dashboard = await api.getDashboard();
        const next: PrintData = {
          dashboard,
          // The editor always passes its own; only the PDF and a plain preview
          // need the saved one.
          layout: draft ?? (await api.getReportLayout(report)),
        };

        if (report === "rojmel") next.rojmel = await api.getRojmel();
        if (report === "grantRegister") next.grantRegister = await api.getGrantRegister();
        if (report === "chequeRegister") next.chequeRegister = await api.getChequeRegister();
        if (report === "billRegister") next.billRegister = await api.getBillRegister();
        if (report === "vouchers") next.vouchers = await api.getVouchers();
        if (report === "patrakD") next.patrakD = await api.getPatrakD();
        if (report === "khatavahi") next.ledgers = await api.getLedgers();
        if (report === "annexure9") next.annexure9 = await api.getAnnexure9();

        setData(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    // The draft is read once, for the first paint; after that it arrives
    // through `layout` below without fetching the report's data again.
  }, [report]);

  const layout = draft ?? data?.layout;
  const layoutValue = useMemo<ReportLayoutValue | null>(
    () =>
      layout
        ? { report, layout, widths: columnWidths(report, layout), version: JSON.stringify(layout) }
        : null,
    [report, layout],
  );
  const version = layoutValue?.version ?? "";

  // Signal readiness only after the browser has painted the report, so
  // printToPDF cannot capture an empty page.
  const ready = error !== null || data !== null;

  // `settled` changes whenever a paged table finishes, so this re-checks then.
  // It also re-runs when the layout changes, so shrink-to-fit and the overflow
  // check follow the editor.
  const { pending, settled } = gate;
  useEffect(() => {
    if (!ready || pending() > 0) return;
    let cancelled = false;
    const signal = (): void => {
      if (cancelled || pending() > 0) return;
      cancelled = true;
      void layoutFontsReady(layoutValue?.layout).then(() => {
        if (pending() > 0) return;
        fitCells();
        spreadBlocks();
        onChecked?.({ sheets: overflowingSheets(), cells: overflowingCells() });
        window.__printReady = true;
      });
    };
    // After the browser has painted - or shortly after, in a window that is
    // never shown and so may never deliver an animation frame.
    const frame = requestAnimationFrame(() => requestAnimationFrame(signal));
    const timer = setTimeout(signal, 250);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
    // layoutValue changes exactly when `version` does; onChecked is a setter.
  }, [ready, pending, settled, version]);


  // The sheets themselves, rebuilt only when the data or the layout changes. The
  // editor re-renders this component for every click and pointer move (the
  // selection outline arrives as `editorCss`); without this, each of those would
  // rebuild every sheet of the report.
  const pages = useMemo(() => {
    if (!data || !layoutValue) return null;
    const { dashboard } = data;
    return (
      <>
        {report === "rojmel" &&
          data.rojmel?.pages.map((page, index) => (
            <RojmelSheet
              key={page.pageNo}
              school={dashboard.school}
              page={page}
              closingSentenceGu={data.rojmel!.closingSentenceGu}
              isLastPage={index === data.rojmel!.pages.length - 1}
            />
          ))}

        {report === "grantRegister" && data.grantRegister && (
          <GrantRegisterPages
            school={dashboard.school}
            year={dashboard.year}
            rows={data.grantRegister}
          />
        )}

        {report === "chequeRegister" && data.chequeRegister && (
          <ChequeRegisterPages
            school={dashboard.school}
            year={dashboard.year}
            rows={data.chequeRegister}
          />
        )}

        {report === "billRegister" && data.billRegister && (
          <BillRegisterPages
            school={dashboard.school}
            year={dashboard.year}
            rows={data.billRegister}
          />
        )}

        {report === "vouchers" && data.vouchers && (
          <VoucherPages school={dashboard.school} vouchers={data.vouchers} />
        )}

        {report === "patrakD" && data.patrakD && (
          <PatrakDPages school={dashboard.school} year={dashboard.year} rows={data.patrakD} />
        )}

        {report === "khatavahi" && data.ledgers && (
          <KhatavahiPages school={dashboard.school} year={dashboard.year} ledgers={data.ledgers} />
        )}

        {report === "annexure9" && data.annexure9 && (
          <Annexure9Page school={dashboard.school} year={dashboard.year} report={data.annexure9} />
        )}

        {report === "annexure10" && (
          <Annexure10Page
            school={dashboard.school}
            year={dashboard.year}
            report={dashboard.annexure10}
          />
        )}
      </>
    );
  }, [data, layoutValue, report]);

  if (error !== null) {
    return (
      <div className="print-root">
        <div className="sheet">માહિતી વાંચી શકાઈ નહીં: {error}</div>
      </div>
    );
  }

  if (!data || !layoutValue) {
    return (
      <div className="print-root">
        <div className="sheet">…</div>
      </div>
    );
  }

  const landscape = LANDSCAPE_REPORTS.has(report);
  const narrow = NARROW_MARGIN_REPORTS.has(report);

  return (
    <PrintLayoutGate.Provider value={gate.gate}>
      <ReportLayoutContext.Provider value={layoutValue}>
        <div id={LAYOUT_ROOT_ID} className={`print-root${narrow ? " narrow" : ""}`}>
          {/*
          The page box, set per report.
          `printToPDF` is called with preferCSSPageSize, so this rule - not the
          landscape flag passed to Electron - decides the actual orientation. A
          single global `@page` would print all seven landscape forms portrait,
          with their tables cropped down the right-hand side.
          */}
          <style>{`@page { size: ${landscape ? "345mm 215mm" : "215mm 345mm"}; margin: ${narrow ? "5mm" : "10mm"}; }`}</style>
          {/* The school's layout, then - on the Reports screen - the editor's marks. */}
          <style>{layoutCss(report, layoutValue.layout, `#${LAYOUT_ROOT_ID}`)}</style>
          {editorCss && <style>{editorCss}</style>}

          {pages}
        </div>
      </ReportLayoutContext.Provider>
    </PrintLayoutGate.Provider>
  );
}
