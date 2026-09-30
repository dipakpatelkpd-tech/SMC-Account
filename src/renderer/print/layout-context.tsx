import { createContext, useContext } from "react";
import type { JSX } from "react";
import type { PrintableReportId } from "../../shared/api.js";
import {
  REPORT_COLUMNS,
  fontsUsed,
  type ReportLayout,
} from "../../shared/report-layout.js";

/**
 * The layout a report is being printed with, for the pieces of the print pages
 * that React has to render differently because of it: the column widths (a
 * <colgroup>) and the blank space after a row (an extra <tr>). Everything else a
 * layout changes - fonts, sizes, colours, padding - is a stylesheet PrintRoot
 * writes, and needs nothing from the pages beyond their data-col / data-row
 * attributes.
 */
export interface ReportLayoutValue {
  report: PrintableReportId;
  layout: ReportLayout;
  /** Column id -> percent of the table, summing to 100. */
  widths: Record<string, number>;
  /** Changes whenever the layout does: paged tables measure again on it. */
  version: string;
}

export const ReportLayoutContext = createContext<ReportLayoutValue | null>(null);

export function useReportLayout(): ReportLayoutValue | null {
  return useContext(ReportLayoutContext);
}

/**
 * The table's column widths. With `table-layout: fixed` a <col> width decides
 * the column outright, so no heading carries a width of its own any more.
 */
export function LayoutColGroup(): JSX.Element | null {
  const value = useReportLayout();
  if (!value) return null;
  return (
    <colgroup>
      {REPORT_COLUMNS[value.report].map((column) => (
        <col key={column.id} data-col={column.id} style={{ width: `${value.widths[column.id]}%` }} />
      ))}
    </colgroup>
  );
}

/** The blank band a school asked for after one row, or nothing. */
export function GapRow({ rowKey }: { rowKey: string }): JSX.Element | null {
  const value = useReportLayout();
  const mm = value?.layout.rowGapsMm[rowKey];
  if (!value || !mm) return null;
  return (
    <tr className="layout-gap" data-gap-for={rowKey}>
      <td colSpan={REPORT_COLUMNS[value.report].length} style={{ height: `${mm}mm` }} />
    </tr>
  );
}

/**
 * Wait until every face the layout uses has loaded. A face is only fetched once
 * something asks for it, so `document.fonts.ready` alone could resolve before a
 * newly chosen font has even started - and a table measured in the fallback
 * font breaks its lines in other places than the one that prints.
 */
export async function layoutFontsReady(layout: ReportLayout | undefined): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const families = layout ? fontsUsed(layout) : [];
  await Promise.all(
    families.flatMap((family) =>
      ["400", "700"].map((weight) =>
        // A Gujarati letter and a digit: the two subsets every form uses.
        document.fonts.load(`${weight} 16px "${family}"`, "કા1").catch(() => []),
      ),
    ),
  );
  await document.fonts.ready;
}
