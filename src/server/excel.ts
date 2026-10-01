/**
 * The reports as an Excel workbook.
 *
 * Why this exists beside the PDF export: the PDF is the form the school submits,
 * and a form is not a working document. The CRC asks for a figure to be checked,
 * the BRC wants the bill register sorted by vendor, someone wants to total one
 * column a different way - and none of that can be done to a PDF. So the same
 * computed numbers are offered in a spreadsheet as well.
 *
 * Three rules that make this a working file rather than a picture of a form:
 *
 *  1. **Amounts are numbers**, in rupees, with a number format. Not text, not
 *     Gujarati digits - a Gujarati-digit amount cannot be summed, sorted or
 *     charted, and the whole point of this file is that it can be. The printed
 *     reports keep their Gujarati digits (SPEC section 6); this is not a printed
 *     report.
 *  2. **Dates are text in DD/MM/YYYY**, the way the forms print them. Excel's
 *     date type would re-interpret them by the reader's locale, which is exactly
 *     how the client's own workbook turned bill number 1/2 into a date
 *     (SPEC 9.7).
 *  3. **Everything else is Gujarati Unicode**, and every heading matches the
 *     printed form, so a row here can be found on the page it came from.
 *
 * No Electron here: this builds a workbook in memory and hands it back. The main
 * process asks where to save it. A web build would stream the same bytes.
 *
 * A school's own layout for a report (shared/report-layout.ts, set on the
 * Reports screen) is carried over as far as a spreadsheet can take it: column
 * widths in the same proportion, the font, the sizes, bold, highlight colours
 * and the blank space after a row. A sheet's columns are not the printed form's
 * - they are laid out for sorting and filtering - so each column names the form
 * column it shows (`layout`), and each row carries the same key as on the form.
 * Padding and row heights are Excel's own to decide.
 *
 * The cash book is the exception to "laid out for sorting": its sheet is the
 * printed રોજમેળ itself - the two halves side by side, block by block, page by
 * page with the same page numbers the ledger refers to - because that is the
 * sheet a school prints. Every sheet carries a print setup: the paper, the
 * orientation of its printed form, one page wide, the heading rows repeated.
 */
import ExcelJS from "exceljs";
import type { Annexure9, Annexure10, DayBalance, Ledger } from "../engine/types.js";
import type { Rojmel } from "../engine/rojmel.js";
import type {
  BillRegisterRow,
  ChequeRegisterRow,
  PatrakDRow,
  Voucher,
} from "../engine/registers.js";
import type {
  BooksApi,
  ExcelReportId,
  GrantRegisterRowDto,
  PrintableReportId,
  SchoolDto,
} from "../shared/api.js";
import { formatDate } from "../lib/dates.js";
import {
  EXCEL_TITLE_PART,
  NO_FILL,
  PAPER_MM,
  paperOf,
  resolvePage,
  columnWidths,
  PT_PER_MM,
  REPORT_DEFAULTS,
  ROW_GROUPS,
  ROW_KEYS,
  billRowKeys,
  rowGapMm,
  emptyLayout,
  fontFamily,
  ledgerRowKeys,
  styleAt,
  targetKey,
  widthScale,
  BORDER_SIDES,
  type BorderStyle,
  type CellStyle,
  type ReportLayout,
  type ResolvedPage,
} from "../shared/report-layout.js";
import { GRANT_CREDIT_FILL, isGrantCredit, rojmelBlockRows } from "../shared/rojmel-rows.js";
import type { RojmelBlock, RojmelLine } from "../engine/rojmel.js";

/** Rupees, as a number. Paise are integers; Excel gets the decimal. */
function rupees(paise: number): number {
  return paise / 100;
}

const MONEY_FORMAT = "#,##0.00";

/**
 * Every cell of every exported workbook is size 14 - the size the school was
 * told its reports must use, and the size of the client's own registers
 * (docs/DECISIONS.md, "Report font size") - unless the school's own layout for
 * that report says otherwise.
 */
export const REPORT_FONT_SIZE = 14;

/**
 * Column widths below are in characters of Excel's default 11-point font, the
 * unit Excel measures widths in. At 14 each character is wider, so the widths
 * are scaled to keep the same text on one line.
 */
const WIDTH_SCALE = REPORT_FONT_SIZE / 11;

/** A date as the forms print it, as text. Never Excel's date type - see above. */
function date(iso: string | null): string {
  return iso ? formatDate(iso) : "";
}

type Cell = string | number | null;

interface Column {
  header: string;
  width: number;
  money?: boolean;
  /** The printed form's column this one shows (REPORT_COLUMNS), for the layout. */
  layout?: string;
  /**
   * For the rojmel, whose one spreadsheet column holds both halves of the form:
   * the column's name on either side ("detail" -> "r.detail" or "p.detail"),
   * chosen by the row's side.
   */
  sided?: string;
}

/** A row that a layout can reach: its key on the form, and - rojmel - its side. */
interface Row {
  cells: Cell[];
  key?: string | null;
  /** The same row in every block (ROW_GROUPS), for a report made of blocks. */
  group?: string | null;
  side?: "r" | "p";
}

/** Which report's layout a sheet follows. */
interface Look {
  report: PrintableReportId;
  layout: ReportLayout;
}

/** "#fff59d" -> the ARGB Excel wants. */
function argb(hex: string): string {
  return `FF${hex.slice(1).toUpperCase()}`;
}

const MM_PER_INCH = 25.4;

/**
 * How a sheet prints: the report's paper and orientation (its page setup, as
 * the school saved it), one page wide - or at the school's zoom - with the
 * heading rows repeated on every page.
 *
 * An .xlsx can only name a paper size, not give one, and there is no "Indian
 * Legal" among Excel's names - so the sheet asks for Legal (215.9 x 355.6mm)
 * and keeps its print inside the 215 x 345mm of the Indian sheet: the far edge
 * of the long side gets the extra 10.6mm as margin. Printed on either paper,
 * nothing is cut.
 */
function printSetup(worksheet: ExcelJS.Worksheet, page: ResolvedPage, repeatRows?: string): void {
  const edge = page.marginMm / MM_PER_INCH;
  const spare = page.paper === "legal-in" ? (355.6 - PAPER_MM.long) / MM_PER_INCH : 0;
  const zoomed = page.scale !== 1;
  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    paperSize: paperOf(page.paper).excel as ExcelJS.PaperSize,
    orientation: page.landscape ? "landscape" : "portrait",
    // A zoom the school chose is used as it is; otherwise one page wide.
    fitToPage: !zoomed,
    ...(zoomed ? { scale: Math.round(page.scale * 100) } : { fitToWidth: 1, fitToHeight: 0 }),
    margins: {
      left: edge,
      right: page.landscape ? edge + spare : edge,
      top: edge,
      bottom: page.landscape ? edge : edge + spare,
      header: 0,
      footer: 0,
    },
    ...(repeatRows ? { printTitlesRow: repeatRows } : {}),
  };
}

/** The ruled lines round a cell, in a colour a school chose or black. */
function ruledIn(colour: string | undefined): Partial<ExcelJS.Borders> {
  if (!colour) return THIN;
  const line = { style: "thin" as const, color: { argb: argb(colour) } };
  return { top: line, left: line, bottom: line, right: line };
}

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

/**
 * One sheet: a title block, a header row, then the rows.
 *
 * Money columns are declared rather than guessed, so a cheque NUMBER never picks
 * up a rupee format and a cheque AMOUNT never lands as text.
 */
function sheet(
  workbook: ExcelJS.Workbook,
  name: string,
  titleGu: string,
  columns: Column[],
  rows: (Cell[] | Row)[],
  look: Look | null = null,
): ExcelJS.Worksheet {
  const layout = look?.layout ?? emptyLayout();
  const defaultPt = look ? REPORT_DEFAULTS[look.report].sizePt : REPORT_FONT_SIZE;
  // A size on the form becomes the same proportion of Excel's 14: the rojmel
  // prints at 12, so 13 there is 15 here.
  const excelSize = (pt: number): number => Math.round(((pt * REPORT_FONT_SIZE) / defaultPt) * 2) / 2;
  const fontName = fontFamily(layout.font);
  const size = layout.sizePt === undefined ? REPORT_FONT_SIZE : excelSize(layout.sizePt);
  const colour: Partial<ExcelJS.Font> = layout.colour ? { color: { argb: argb(layout.colour) } } : {};
  const font = { name: fontName, size, ...colour };
  const headFont = { name: fontName, size, bold: true, ...colour };

  // Excel forbids : \ / ? * [ ] in a sheet name and truncates at 31 characters.
  const safeName = name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
  const worksheet = workbook.addWorksheet(safeName, {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  const titleRow = worksheet.addRow([titleGu]);
  titleRow.font = headFont;
  titleRow.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.mergeCells(1, 1, 1, Math.max(1, columns.length));

  const header = worksheet.addRow(columns.map((column) => column.header));
  header.font = headFont;
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  // Where each keyed row landed, for the styles below.
  const placed: { excelRow: number; key: string | null; group: string | null; side: "r" | "p" | undefined }[] = [
    { excelRow: 2, key: ROW_KEYS.head, group: null, side: "r" },
  ];
  for (const entry of rows) {
    const row: Row = Array.isArray(entry) ? { cells: entry } : entry;
    const added = worksheet.addRow(row.cells);
    placed.push({ excelRow: added.number, key: row.key ?? null, group: row.group ?? null, side: row.side });
    // The space a school asked for after this row (or its group): an empty row that tall.
    const gap = row.key ? rowGapMm(layout, row.key, row.group ?? null) : undefined;
    if (gap) worksheet.addRow([]).height = Math.round(gap * PT_PER_MM * 10) / 10;
  }

  const layoutIdOf = (column: Column, side: "r" | "p" | undefined): string | null =>
    column.layout ?? (column.sided ? `${side ?? "r"}.${column.sided}` : null);

  columns.forEach((column, index) => {
    const excelColumn = worksheet.getColumn(index + 1);
    const ids = column.layout ? [column.layout] : column.sided ? [`r.${column.sided}`, `p.${column.sided}`] : [];
    const scale = look ? widthScale(look.report, layout, ids) : 1;
    excelColumn.width = Math.round(column.width * WIDTH_SCALE * scale * 10) / 10;
    excelColumn.font = font;
    if (column.money) {
      excelColumn.numFmt = MONEY_FORMAT;
      excelColumn.alignment = { horizontal: "right" };
    }
  });
  // The title and header keep their own font, which the column font just undid.
  worksheet.getRow(1).font = headFont;
  worksheet.getRow(2).font = headFont;

  // Ruled like the printed form, so it prints as one - before the school's
  // own styles, which win. Figures and dates in
  // Calibri, as the client's workbook has them: a Gujarati face's Latin digits
  // are not on every PC.
  const latinText = /^[\d\s/.,\-–]+$/;
  for (let rowNo = 2; rowNo <= worksheet.rowCount; rowNo += 1) {
    const row = worksheet.getRow(rowNo);
    if (row.cellCount === 0) continue;
    for (let col = 1; col <= columns.length; col += 1) {
      const target = row.getCell(col);
      target.border = ruledIn(layout.lineColour);
      if (layout.colour) target.font = { ...target.font, color: { argb: argb(layout.colour) } };
      const value = target.value;
      const figure = typeof value === "number" || (typeof value === "string" && latinText.test(value));
      // Unless the school chose a face for the whole report.
      if (rowNo > 2 && figure && layout.font === undefined) {
        target.font = { ...target.font, name: "Calibri" };
      }
    }
  }
  /** One cell as the school's layout has it. Blank (NO_FILL) is Excel's default. */
  const apply = (cell: ExcelJS.Cell, style: CellStyle): void => applyStyle(cell, style, excelSize);

  if (look) {
    // The title row is the form's title part.
    const title = layout.styles[targetKey({ kind: "part", part: EXCEL_TITLE_PART[look.report] })];
    if (title) {
      apply(worksheet.getRow(1).getCell(1), title);
      if (title.heightMm !== undefined) worksheet.getRow(1).height = Math.round(title.heightMm * PT_PER_MM * 10) / 10;
    }

    // Highlights, bold, fonts, sizes and alignment the school chose, cell by
    // cell: the report's alignment, then the column's style, the row's, the cell's.
    const styled = Object.keys(layout.styles).length > 0 || layout.align !== undefined;
    for (const { excelRow, key, group, side } of styled ? placed : []) {
      const row = worksheet.getRow(excelRow);
      const rowHeight = key ? heightOfRow(layout, key, group) : undefined;
      if (rowHeight !== undefined) row.height = Math.round(rowHeight * PT_PER_MM * 10) / 10;
      columns.forEach((column, index) => {
        const id = layoutIdOf(column, side);
        const style: CellStyle = {
          ...(layout.align ? { align: layout.align } : {}),
          ...(id === null && key === null ? {} : styleAt(layout, key, id, group)),
        };
        if (Object.keys(style).length > 0) apply(row.getCell(index + 1), style);
      });
    }
  }

  const page = look
    ? resolvePage(look.report, layout.page)
    : resolvePage(columns.length > 5 ? "chequeRegister" : "annexure9", undefined);
  printSetup(worksheet, page, "1:2");

  return worksheet;
}

/** The lines every sheet title carries: whose books these are, and which year. */
function titleOf(school: SchoolDto, yearLabel: string, reportGu: string): string {
  return `${school.smcLabelGu} – ${reportGu} – ${yearLabel}`;
}

// ------------------------------------------------------------------- sheets

/** The rojmel's columns in print order: REPORT_COLUMNS.rojmel. */
const ROJMEL_HEADINGS: [id: string, heading: string][] = [
  ["r.date", "તારીખ"],
  ["r.detail", "આવકની વિગત"],
  ["r.ref", "પહોંચ નંબર અને તારીખ"],
  ["r.cheque", "ચેક નં તારીખ ડી.ડી.નં તારીખ"],
  ["r.class", "વર્ગીકરણ રજી.નો પાન નં"],
  ["r.cash", "રોકડ"],
  ["r.bank", "બેન્ક"],
  ["r.total", "કુલ રકમ"],
  ["p.detail", "જાવક ની વિગત"],
  ["p.ref", "વાઉચર નંબર અને તારીખ"],
  ["p.cheque", "ચેક નં તારીખ"],
  ["p.class", "વર્ગીકરણ રજી.નો પાન નં"],
  ["p.cash", "રોકડ"],
  ["p.bank", "બેન્ક"],
  ["p.total", "કુલ રકમ"],
];

/** The footer rows' colours, as printed: only the words and the amounts. */
const ROJMEL_FOOTER_FILL = { spent: "FFFDEEE4", closing: "FFFDF6E3", grand: "FFEAF3EA" } as const;

/**
 * The cash book as the printed form: the આવક and જાવક halves side by side,
 * block after block, each printed page starting a new Excel page with its title,
 * the Cash Book band and the column headings - so it prints like the PDF, with
 * the same page numbers.
 */
function rojmelSheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  _yearLabel: string,
  rojmel: Rojmel,
  layout: ReportLayout,
): void {
  const defaultPt = REPORT_DEFAULTS.rojmel.sizePt;
  const excelSize = (pt: number): number => Math.round(((pt * REPORT_FONT_SIZE) / defaultPt) * 2) / 2;
  const fontName = fontFamily(layout.font);
  const size = layout.sizePt === undefined ? REPORT_FONT_SIZE : excelSize(layout.sizePt);
  // The text colour the school chose for the whole report, if any.
  const colour: Partial<ExcelJS.Font> = layout.colour ? { color: { argb: argb(layout.colour) } } : {};
  const font: Partial<ExcelJS.Font> = { name: fontName, size, ...colour };
  const bold: Partial<ExcelJS.Font> = { ...font, bold: true };
  // Figures, dates and numbers in Calibri, as the client's ROJMED sheet has
  // them: a Gujarati face's Latin digits are not on every PC. A face the
  // school chose for the whole report is used for them too.
  const latin: Partial<ExcelJS.Font> = {
    name: layout.font === undefined ? "Calibri" : fontName,
    size,
    ...colour,
  };
  const ruling = ruledIn(layout.lineColour);
  const latinBold: Partial<ExcelJS.Font> = { ...latin, bold: true };
  const last = ROJMEL_HEADINGS.length;
  const colOf = new Map(ROJMEL_HEADINGS.map(([id], index) => [id, index + 1]));

  const worksheet = workbook.addWorksheet("રોજમેળ");
  // The printed proportions, in Excel's character widths: about 190 across -
  // what one page's rows need to fill a landscape sheet once fit-to-width has
  // brought it to the paper.
  const widths = columnWidths("rojmel", layout);
  ROJMEL_HEADINGS.forEach(([id], index) => {
    worksheet.getColumn(index + 1).width = Math.round((widths[id] ?? 5) * 19) / 10;
  });

  const keyed: { row: ExcelJS.Row; key: string; group?: string }[] = [];
  const cell = (row: ExcelJS.Row, id: string): ExcelJS.Cell => row.getCell(colOf.get(id)!);
  const money = (target: ExcelJS.Cell, paise: number | null): void => {
    target.value = paise === null ? null : rupees(paise);
    target.numFmt = "0.00";
    target.font = latin;
    target.alignment = { horizontal: "right", vertical: "middle" };
  };
  const ruled = (row: ExcelJS.Row): void => {
    for (let col = 1; col <= last; col += 1) {
      const target = row.getCell(col);
      target.border = ruling;
      if (!target.font) target.font = font;
    }
    // The heavy rule down the middle, between આવક and જાવક.
    const middle = cell(row, "p.detail");
    middle.border = { ...ruling, left: { ...ruling.left, style: "medium" } };
  };
  const text = (target: ExcelJS.Cell, value: string, shrink = true): void => {
    target.value = value;
    target.alignment = { horizontal: "center", vertical: "middle", shrinkToFit: shrink, wrapText: !shrink };
  };

  const half = (row: ExcelJS.Row, side: "r" | "p", line: RojmelLine | null): void => {
    if (!line) return;
    if (side === "r") {
      text(cell(row, "r.date"), line.dateText, false);
      cell(row, "r.date").font = latin;
    }
    text(cell(row, `${side}.detail`), line.descriptionGu);
    const ref = cell(row, `${side}.ref`);
    text(ref, line.referenceText);
    ref.font = latin;
    // "1/3 11/07/24": the voucher number bold, the date not.
    const space = line.referenceText.indexOf(" ");
    if (side === "p" && line.referenceText !== "") {
      ref.value = {
        richText:
          space > 0
            ? [
                { text: line.referenceText.slice(0, space), font: latinBold },
                { text: line.referenceText.slice(space), font: latin },
              ]
            : [{ text: line.referenceText, font: latinBold }],
      };
    }
    text(cell(row, `${side}.cheque`), line.chequeText);
    cell(row, `${side}.cheque`).font = latin;
    if (!line.headingOnly) {
      money(cell(row, `${side}.cash`), line.cashPaise);
      money(cell(row, `${side}.bank`), line.bankPaise);
      money(cell(row, `${side}.total`), line.totalPaise);
    }
    // A grant received, coloured from its words to its amounts, as printed.
    if (isGrantCredit(line) && !layout.plain) {
      for (const column of ["detail", "ref", "cheque", "class", "cash", "bank", "total"]) {
        cell(row, `${side}.${column}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: argb(GRANT_CREDIT_FILL) },
        };
      }
    }
  };

  const footer = (
    block: RojmelBlock,
    which: "spent" | "closing" | "grand",
    labelGu: string,
    figures: [number, number, number],
    receiptTotals?: [number, number, number],
  ): void => {
    const row = worksheet.addRow([]);
    row.height = 21;
    ruled(row);
    const fill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJMEL_FOOTER_FILL[which] } };
    const label = cell(row, "p.detail");
    text(label, labelGu);
    const painted = [label];
    (["cash", "bank", "total"] as const).forEach((column, index) => {
      money(cell(row, `p.${column}`), figures[index]!);
      painted.push(cell(row, `p.${column}`));
      if (receiptTotals) {
        money(cell(row, `r.${column}`), receiptTotals[index]!);
        painted.push(cell(row, `r.${column}`));
      }
    });
    for (const target of painted) {
      target.fill = fill;
      target.font = target === label ? bold : latinBold;
    }
    keyed.push({ row, key: ROW_KEYS.rojmelFooter(block.id, which), group: ROW_GROUPS.rojmelFooter(which) });
  };

  for (const page of rojmel.pages) {
    const title = worksheet.addRow([school.smcLabelGu]);
    worksheet.mergeCells(title.number, 1, title.number, last);
    title.font = bold;
    title.alignment = { horizontal: "center", vertical: "middle" };
    title.height = 24;
    keyed.push({ row: title, key: "" });

    const band = worksheet.addRow([]);
    band.height = 20;
    const bandCell = (from: number, to: number, value: string, argbFill: string): void => {
      worksheet.mergeCells(band.number, from, band.number, to);
      const target = band.getCell(from);
      target.value = value;
      target.font = bold;
      target.alignment = { horizontal: "center", vertical: "middle" };
      target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argbFill } };
      target.border = ruling;
    };
    bandCell(1, colOf.get("r.total")!, "આવક            ( Cash Book )", "FFEEF2EA");
    bandCell(colOf.get("p.detail")!, colOf.get("p.cash")!, "( કેશ બુક )            જાવક", "FFEEF2EA");
    bandCell(colOf.get("p.bank")!, last, `પાના.નંબર   ${page.pageNo}`, "FFF6EEF2");

    const head = worksheet.addRow(ROJMEL_HEADINGS.map(([, heading]) => heading));
    head.height = 80;
    ruled(head);
    head.eachCell((target) => {
      target.font = bold;
      target.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    keyed.push({ row: head, key: ROW_KEYS.head });

    for (const block of page.blocks) {
      for (const [index, tableRow] of rojmelBlockRows(block).entries()) {
        const row = worksheet.addRow([]);
        // The first row holds the date, which may be a range on three lines.
        row.height = tableRow.left?.dateText.includes("TO") ? 44 : 21;
        ruled(row);
        half(row, "r", tableRow.left);
        half(row, "p", tableRow.right);
        keyed.push({ row, key: tableRow.key, group: ROW_GROUPS.rojmelRow(index) });
        const gap = rowGapMm(layout, tableRow.key, ROW_GROUPS.rojmelRow(index));
        if (gap) worksheet.addRow([]).height = Math.round(gap * PT_PER_MM * 10) / 10;
      }
      footer(block, "spent", "શ્રી ખર્ચખાતે", [block.spentCashPaise, block.spentBankPaise, block.spentTotalPaise]);
      footer(
        block,
        "closing",
        "શ્રી બંધ સિલક",
        [block.closingCashPaise, block.closingBankPaise, block.closingTotalPaise],
        [block.receiptTotalCashPaise, block.receiptTotalBankPaise, block.receiptTotalTotalPaise],
      );
      footer(block, "grand", "શ્રી કુલ", [
        block.spentCashPaise + block.closingCashPaise,
        block.spentBankPaise + block.closingBankPaise,
        block.spentCashPaise + block.closingCashPaise + block.spentBankPaise + block.closingBankPaise,
      ]);
      // The blank band between blocks.
      worksheet.addRow([]).height = 8;
    }

    // Each printed page is an Excel page.
    worksheet.getRow(worksheet.rowCount).addPageBreak();
  }

  const closing = worksheet.addRow([rojmel.closingSentenceGu]);
  worksheet.mergeCells(closing.number, 1, closing.number, last);
  closing.font = bold;
  closing.alignment = { horizontal: "center" };

  // The school's own layout: highlights, bold, fonts, sizes, alignment.
  const titleStyle = layout.styles[targetKey({ kind: "part", part: EXCEL_TITLE_PART.rojmel })];
  for (const { row, key, group = null } of keyed) {
    if (key === "") {
      if (titleStyle) applyStyle(row.getCell(1), titleStyle, excelSize);
      continue;
    }
    const rowHeight = heightOfRow(layout, key, group);
    if (rowHeight !== undefined) row.height = Math.round(rowHeight * PT_PER_MM * 10) / 10;
    for (const [id] of ROJMEL_HEADINGS) {
      const style = styleAt(layout, key, id, group);
      if (Object.keys(style).length > 0) applyStyle(cell(row, id), style, excelSize);
    }
  }

  printSetup(worksheet, resolvePage("rojmel", layout.page));
}

/** A row's height as the school set it: for the row itself, else for its group. */
function heightOfRow(layout: ReportLayout, key: string, group: string | null): number | undefined {
  return (
    layout.styles[targetKey({ kind: "row", row: key })]?.heightMm ??
    (group !== null ? layout.styles[targetKey({ kind: "row", row: group })]?.heightMm : undefined)
  );
}

/** One cell as a school's layout has it. Blank (NO_FILL) is Excel's default. */
function applyStyle(cell: ExcelJS.Cell, style: CellStyle, excelSize: (pt: number) => number): void {
  if (style.fill && style.fill !== NO_FILL) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(style.fill) } };
  }
  if (
    style.bold !== undefined ||
    style.italic !== undefined ||
    style.underline !== undefined ||
    style.font ||
    style.sizePt !== undefined ||
    style.colour
  ) {
    cell.font = {
      ...cell.font,
      ...(style.font ? { name: fontFamily(style.font) } : {}),
      ...(style.sizePt !== undefined ? { size: excelSize(style.sizePt) } : {}),
      ...(style.bold !== undefined ? { bold: style.bold } : {}),
      ...(style.italic !== undefined ? { italic: style.italic } : {}),
      ...(style.underline !== undefined ? { underline: style.underline } : {}),
      ...(style.colour ? { color: { argb: argb(style.colour) } } : {}),
    };
  }
  if (style.align || style.vAlign || style.wrap !== undefined) {
    cell.alignment = {
      ...cell.alignment,
      ...(style.align ? { horizontal: style.align } : {}),
      ...(style.vAlign ? { vertical: style.vAlign } : {}),
      // Wrapping and shrinking to fit cannot both be on.
      ...(style.wrap !== undefined ? { wrapText: style.wrap, shrinkToFit: !style.wrap } : {}),
    };
  }
  if (style.lineColour || style.borders) {
    // Each edge: the school's own line for it, else the cell's line in the
    // line colour, keeping its weight (the rojmel's heavy middle rule).
    const border = cell.border ?? {};
    const lineColour = style.lineColour ? { argb: argb(style.lineColour) } : undefined;
    const next: Partial<ExcelJS.Borders> = {};
    for (const side of BORDER_SIDES) {
      const edge = style.borders?.[side];
      const current = border[side];
      if (edge?.style === "none") continue;
      if (edge) {
        const colour = edge.colour ? { argb: argb(edge.colour) } : (lineColour ?? current?.color);
        next[side] = { style: EXCEL_BORDER[edge.style], ...(colour ? { color: colour } : {}) };
      } else if (current) {
        next[side] = { ...current, ...(lineColour ? { color: lineColour } : {}) };
      } else if (lineColour) {
        next[side] = { style: "thin", color: lineColour };
      }
    }
    cell.border = next;
  }
}

/** Excel's own names for the line styles the editor offers. */
const EXCEL_BORDER: Record<Exclude<BorderStyle, "none">, ExcelJS.BorderStyle> = {
  thin: "thin",
  medium: "medium",
  thick: "thick",
  dashed: "dashed",
  dotted: "dotted",
  double: "double",
};

function ledgerSheets(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  ledgers: Ledger[],
  layout: ReportLayout,
): void {
  for (const ledger of ledgers) {
    const keys = ledgerRowKeys(ledger.headCode, ledger.rows);
    const rows: Row[] = ledger.rows.map((row, index) => ({
      key: keys[index]!,
      group: ROW_GROUPS.ledgerRow(index),
      cells: [
        date(row.date),
        row.rojmelPage,
        row.descriptionGu,
        rupees(row.creditPaise),
        rupees(row.debitPaise),
        rupees(row.creditBalancePaise),
        rupees(row.debitBalancePaise),
      ],
    }));

    rows.push({
      key: ROW_KEYS.ledgerClosing(ledger.headCode),
      group: ROW_GROUPS.ledgerClosing,
      cells: [
        "",
        null,
        "કુલ",
        rupees(ledger.totalCreditPaise),
        rupees(ledger.totalDebitPaise),
        rupees(ledger.closingPaise),
        null,
      ],
    });

    sheet(
      workbook,
      ledger.nameGu,
      titleOf(school, yearLabel, `ખાતાવહી – ${ledger.nameGu}`),
      [
        { header: "તારીખ", width: 12, layout: "date" },
        { header: "રોજમેળ પાનું", width: 12, layout: "page" },
        { header: "વિગત", width: 46, layout: "detail" },
        { header: "જમા", width: 13, money: true, layout: "credit" },
        { header: "ઉધાર", width: 13, money: true, layout: "debit" },
        { header: "જમા બાકી", width: 13, money: true, layout: "creditBalance" },
        { header: "ઉધાર બાકી", width: 13, money: true, layout: "debitBalance" },
      ],
      rows,
      { report: "khatavahi", layout },
    );
  }
}

function grantRegisterSheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  register: GrantRegisterRowDto[],
  layout: ReportLayout,
): void {
  sheet(
    workbook,
    "ગ્રાન્ટ રજીસ્ટર",
    titleOf(school, yearLabel, "ગ્રાન્ટ રજીસ્ટર"),
    [
      { header: "ક્રમ", width: 6 },
      { header: "તારીખ", width: 12, layout: "ddDate" },
      { header: "ગ્રાન્ટ હેડ", width: 26, layout: "purpose" },
      { header: "કોના તરફથી મળી", width: 26, layout: "from" },
      { header: "હુકમ નંબર", width: 16, layout: "order" },
      { header: "હુકમ તારીખ", width: 12, layout: "order" },
      { header: "મળેલ રકમ", width: 13, money: true, layout: "amount" },
      { header: "ખર્ચેલ રકમ", width: 13, money: true, layout: "spent" },
      { header: "બચત રહેલ ગ્રાન્ટ", width: 13, money: true, layout: "saving" },
      { header: "રીમાર્કસ", width: 18, layout: "remarks" },
    ],
    register.map((row, index) => ({
      key: ROW_KEYS.receipt(row.receipt.id),
      cells: [
        index + 1,
        date(row.receipt.date),
        row.receipt.headNameGu,
        row.receipt.receivedFromGu,
        row.receipt.allotmentOrderNo ?? "",
        date(row.receipt.allotmentOrderDate),
        rupees(row.receipt.amountPaise),
        rupees(row.spentPaise),
        rupees(row.savingPaise),
        row.receipt.remarksGu ?? "",
      ],
    })),
    { report: "grantRegister", layout },
  );
}

function chequeRegisterSheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  register: ChequeRegisterRow[],
  layout: ReportLayout,
): void {
  sheet(
    workbook,
    "ચેક રજીસ્ટર",
    titleOf(school, yearLabel, "ચેક રજીસ્ટર"),
    [
      { header: "ક્રમ", width: 6, layout: "serial" },
      { header: "ચેક નંબર", width: 11, layout: "chequeNo" },
      { header: "ચેક તારીખ", width: 12, layout: "chequeDate" },
      { header: "વાઉચર નં.", width: 10, layout: "voucherNo" },
      { header: "બીલ નંબર", width: 16, layout: "billRange" },
      { header: "રકમ", width: 13, money: true, layout: "amount" },
      { header: "કોના નામે", width: 28, layout: "payee" },
      { header: "કયા કામે", width: 34, layout: "purpose" },
      { header: "વટાવ્યા તારીખ", width: 13, layout: "cashedDate" },
      { header: "રીમાર્કસ", width: 18, layout: "remarks" },
    ],
    register.map((row) => ({
      key: ROW_KEYS.cheque(row.chequeNo),
      cells: [
        row.serial,
        row.chequeNo,
        date(row.chequeDate),
        row.voucherNo,
        row.billRangeText,
        rupees(row.amountPaise),
        row.payeeGu,
        row.purposeGu,
        date(row.cashedDate),
        row.remarksGu ?? "",
      ],
    })),
    { report: "chequeRegister", layout },
  );
}

function billRegisterSheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  register: BillRegisterRow[],
  layout: ReportLayout,
): void {
  const keys = billRowKeys(register);
  sheet(
    workbook,
    "બિલ રજીસ્ટર",
    titleOf(school, yearLabel, "બિલ રજીસ્ટર"),
    [
      { header: "ક્રમ", width: 6, layout: "serial" },
      { header: "વાઉચર નં.", width: 10, layout: "voucherNo" },
      { header: "બીલ નંબર", width: 12, layout: "billNo" },
      { header: "બીલ તારીખ", width: 12, layout: "billDate" },
      { header: "વિગત", width: 40, layout: "description" },
      { header: "કોના તરફથી", width: 26, layout: "vendor" },
      { header: "નંગ", width: 10, layout: "quantity" },
      { header: "બીલની રકમ", width: 13, money: true, layout: "amount" },
      { header: "કપાત", width: 11, money: true, layout: "deduction" },
      { header: "ચોખ્ખી રકમ", width: 13, money: true, layout: "net" },
      { header: "રીમાર્કસ", width: 18, layout: "remarks" },
    ],
    register.map((row, index) => ({
      key: keys[index]!,
      cells: [
        row.serial,
        row.voucherNo,
        // Text, always: "1/2" is a bill number, not the second of January.
        row.billNo ?? "",
        date(row.billDate),
        row.descriptionGu,
        row.vendorGu,
        row.quantityGu ?? "",
        rupees(row.amountPaise),
        rupees(row.deductionPaise),
        rupees(row.netPaise),
        row.isGrantReturn ? "ગ્રાન્ટ પરત" : (row.remarksGu ?? ""),
      ],
    })),
    { report: "billRegister", layout },
  );
}

function voucherSheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  list: Voucher[],
  layout: ReportLayout,
): void {
  const rows: Row[] = [];

  for (const voucher of list) {
    // Keyed as the printed voucher keys its lines (RegisterPages, lineKeys).
    const keys = billRowKeys(voucher.lines.map((line) => ({ voucherNo: voucher.voucherNo, billNo: line.billNo })));
    voucher.lines.forEach((line, index) => {
      rows.push({
        key: keys[index]!,
        group: ROW_GROUPS.voucherLine(index),
        cells: [
          voucher.voucherNo,
          voucher.chequeNo,
          date(voucher.chequeDate),
          voucher.payeeGu ?? "",
          line.serial,
          line.billNo ?? "",
          date(line.billDate),
          line.descriptionGu,
          line.vendorGu,
          rupees(line.amountPaise),
          line.remarksGu ?? "",
        ],
      });
    });
    rows.push({
      key: ROW_KEYS.voucherTotal(voucher.voucherNo),
      group: ROW_GROUPS.voucherTotal,
      cells: [
        voucher.voucherNo,
        voucher.chequeNo,
        date(voucher.chequeDate),
        "",
        null,
        "",
        "",
        "કુલ",
        "",
        rupees(voucher.totalPaise),
        // The one check this statement exists for: the bills must add up to the
        // cheque that paid them.
        voucher.balances ? "" : "ચેકની રકમ સાથે મેળ ખાતું નથી",
      ],
    });
  }

  sheet(
    workbook,
    "વાઉચર",
    titleOf(school, yearLabel, "વાઉચર"),
    [
      { header: "વાઉચર નં.", width: 10 },
      { header: "ચેક નંબર", width: 11 },
      { header: "ચેક તારીખ", width: 12 },
      { header: "કોના નામે", width: 26 },
      { header: "ક્રમ", width: 6, layout: "serial" },
      { header: "બીલ નંબર", width: 12, layout: "billNo" },
      { header: "બીલ તારીખ", width: 12, layout: "billDate" },
      { header: "વિગત", width: 40, layout: "description" },
      { header: "કોના તરફથી", width: 26, layout: "vendor" },
      { header: "રકમ", width: 13, money: true, layout: "amount" },
      { header: "રીમાર્કસ", width: 22, layout: "remarks" },
    ],
    rows,
    { report: "vouchers", layout },
  );
}

function patrakDSheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  rows: PatrakDRow[],
  layout: ReportLayout,
): void {
  const total = rows.reduce((sum, row) => sum + row.amountPaise, 0);

  sheet(
    workbook,
    "પત્રક D",
    titleOf(school, yearLabel, "પત્રક – D"),
    [
      { header: "ક્રમ", width: 6, layout: "serial" },
      { header: "ચેક તારીખ", width: 12, layout: "chequeDate" },
      { header: "ચેક નંબર", width: 11, layout: "chequeNo" },
      { header: "કોના ખાતામાં", width: 28, layout: "payee" },
      { header: "કઈ પાર્ટી", width: 34, layout: "parties" },
      { header: "ગ્રાન્ટ હેડ", width: 26, layout: "head" },
      { header: "રકમ", width: 13, money: true, layout: "amount" },
    ],
    [
      ...rows.map((row) => ({
        key: ROW_KEYS.patrakD(row.chequeNo, row.headNameGu),
        cells: [
          row.serial,
          date(row.chequeDate),
          row.chequeNo,
          row.payeeGu,
          row.partiesGu,
          row.headNameGu,
          rupees(row.amountPaise),
        ],
      })),
      { key: ROW_KEYS.total, cells: ["", "", null, "", "", "કુલ", rupees(total)] },
    ],
    { report: "patrakD", layout },
  );
}

function annexure9Sheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  report: Annexure9,
  layout: ReportLayout,
): void {
  // Keys are the form's own rows (ANNEXURE9_ROWS); the last two lines are this
  // sheet's alone.
  const line = (key: string | null, label: string, paise: number): Row => ({
    key,
    cells: [label, rupees(paise)],
  });
  sheet(
    workbook,
    "પરિશિષ્ટ 9",
    titleOf(school, yearLabel, "પરિશિષ્ટ – ૯ (બેંક મેળવણું)"),
    [
      { header: "વિગત", width: 52, layout: "detail" },
      { header: "રકમ", width: 15, money: true, layout: "amount" },
    ],
    [
      line("cashbook", "રોજમેળ પ્રમાણે બેન્ક સિલક", report.cashbookBankPaise),
      line("notCashed", "(+) ચેક ઈસ્યુ થયા પણ વટાવેલ નથી", report.chequesIssuedNotCashedPaise),
      line("notInCashbook", "(+) બેંકમાં જમા, રોજમેળમાં નથી", report.creditsInBankNotInCashbookPaise),
      line("addTotal", "કુલ", report.subtotalPaise),
      line("notCredited", "(−) બેંકમાં જમા ન થયેલ", report.depositsNotYetCreditedPaise),
      line("charges", "(−) બેંક ચાર્જિસ", report.bankChargesNotInCashbookPaise),
      line("passbook", "પાસબુક પ્રમાણે સિલક (ગણતરી)", report.computedPassbookPaise),
      line(null, "પાસબુક પ્રમાણે સિલક (દાખલ કરેલ)", report.enteredPassbookPaise),
      line(
        null,
        report.matches ? "મેળ ખાય છે" : "મેળ ખાતું નથી",
        report.enteredPassbookPaise - report.computedPassbookPaise,
      ),
    ],
    { report: "annexure9", layout },
  );
}

function annexure10Sheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  report: Annexure10,
  layout: ReportLayout,
): void {
  sheet(
    workbook,
    "પરિશિષ્ટ 10",
    titleOf(school, yearLabel, "પરિશિષ્ટ – ૧૦ (વાર્ષિક ગ્રાન્ટ પત્રક)"),
    [
      { header: "ક્રમ", width: 6, layout: "serial" },
      { header: "વિગત", width: 30, layout: "head" },
      { header: "શરૂની સિલક", width: 13, money: true, layout: "opening" },
      { header: "મળેલ ગ્રાન્ટ", width: 13, money: true, layout: "received" },
      { header: "કુલ", width: 13, money: true, layout: "total" },
      { header: "ખર્ચ", width: 13, money: true, layout: "spent" },
      { header: "પરત કરેલ", width: 13, money: true, layout: "returned" },
      { header: "કુલ ખર્ચ", width: 13, money: true, layout: "totalOut" },
      { header: "બંધ સિલક", width: 13, money: true, layout: "closing" },
    ],
    [
      ...report.rows.map((row, index) => ({
        key: ROW_KEYS.grantHead(row.headCode),
        cells: [
          index + 1,
          row.nameGu,
          rupees(row.openingPaise),
          rupees(row.receivedPaise),
          rupees(row.totalPaise),
          rupees(row.spentPaise),
          rupees(row.returnedPaise),
          rupees(row.totalOutPaise),
          rupees(row.closingPaise),
        ],
      })),
      {
        key: ROW_KEYS.total,
        cells: [
          null,
          "કુલ",
          rupees(report.totals.openingPaise),
          rupees(report.totals.receivedPaise),
          rupees(report.totals.totalPaise),
          rupees(report.totals.spentPaise),
          rupees(report.totals.returnedPaise),
          rupees(report.totals.totalOutPaise),
          rupees(report.totals.closingPaise),
        ],
      },
    ],
    { report: "annexure10", layout },
  );
}

function balancesSheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  balances: DayBalance[],
): void {
  sheet(
    workbook,
    "સિલક",
    titleOf(school, yearLabel, "તારીખ પ્રમાણે સિલક"),
    [
      { header: "તારીખ", width: 12 },
      { header: "રોકડ", width: 13, money: true },
      { header: "બેન્ક", width: 13, money: true },
      { header: "કુલ", width: 13, money: true },
    ],
    balances.map((balance) => [
      date(balance.date),
      rupees(balance.cashPaise),
      rupees(balance.bankPaise),
      rupees(balance.totalPaise),
    ]),
  );
}

// -------------------------------------------------------------- the workbook

/**
 * Build the workbook for one report, or for the whole year.
 *
 * Only the data the chosen sheets need is fetched: the rojmel of a full year is
 * the expensive one, and there is no reason to compute it to export Annexure 10.
 */
export async function buildWorkbook(
  api: BooksApi,
  report: ExcelReportId,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SMC હિસાબ";
  workbook.created = new Date();

  const school = await api.getSchool();
  const dashboard = await api.getDashboard();
  const yearLabel = dashboard.year.label;

  const wants = (id: PrintableReportId): boolean => report === "all" || report === id;
  // Each sheet follows the school's layout for its report.
  const layoutOf = (id: PrintableReportId): Promise<ReportLayout> => api.getReportLayout(id);

  if (wants("rojmel")) {
    rojmelSheet(workbook, school, yearLabel, await api.getRojmel(), await layoutOf("rojmel"));
  }
  if (wants("khatavahi")) {
    ledgerSheets(workbook, school, yearLabel, await api.getLedgers(), await layoutOf("khatavahi"));
  }
  if (wants("grantRegister")) {
    const layout = await layoutOf("grantRegister");
    grantRegisterSheet(workbook, school, yearLabel, await api.getGrantRegister(), layout);
  }
  if (wants("chequeRegister")) {
    const layout = await layoutOf("chequeRegister");
    chequeRegisterSheet(workbook, school, yearLabel, await api.getChequeRegister(), layout);
  }
  if (wants("billRegister")) {
    const layout = await layoutOf("billRegister");
    billRegisterSheet(workbook, school, yearLabel, await api.getBillRegister(), layout);
  }
  if (wants("vouchers")) {
    voucherSheet(workbook, school, yearLabel, await api.getVouchers(), await layoutOf("vouchers"));
  }
  if (wants("patrakD")) {
    patrakDSheet(workbook, school, yearLabel, await api.getPatrakD(), await layoutOf("patrakD"));
  }
  if (wants("annexure9")) {
    annexure9Sheet(workbook, school, yearLabel, await api.getAnnexure9(), await layoutOf("annexure9"));
  }
  if (wants("annexure10")) {
    annexure10Sheet(workbook, school, yearLabel, dashboard.annexure10, await layoutOf("annexure10"));
  }
  // The running balances have no printed form, so they ride along with the full
  // workbook only - they are the quickest way to answer "where was the money on
  // this date".
  if (report === "all") balancesSheet(workbook, school, yearLabel, await api.getBalances());

  return workbook;
}

/** The workbook as bytes, ready to write to a file or send over HTTP. */
export async function workbookBytes(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(written);
}

/** A filename a school will recognise a year later. */
export function defaultExcelName(report: ExcelReportId, yearLabel: string): string {
  const slug: Record<ExcelReportId, string> = {
    all: "smc-hisab",
    rojmel: "rojmel",
    khatavahi: "khatavahi",
    grantRegister: "grant-register",
    chequeRegister: "cheque-register",
    billRegister: "bill-register",
    vouchers: "vouchers",
    patrakD: "patrak-d",
    annexure9: "parishisht-9",
    annexure10: "parishisht-10",
  };
  return `${slug[report]}-${yearLabel}.xlsx`;
}
