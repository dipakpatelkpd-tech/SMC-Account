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
  PT_PER_MM,
  REPORT_DEFAULTS,
  ROW_KEYS,
  billRowKeys,
  emptyLayout,
  fontFamily,
  ledgerRowKeys,
  styleAt,
  targetKey,
  widthScale,
  type CellStyle,
  type ReportLayout,
} from "../shared/report-layout.js";
import { rojmelBlockRows } from "../shared/rojmel-rows.js";

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
  const font = { name: fontName, size };
  const headFont = { name: fontName, size, bold: true };

  // Excel forbids : \ / ? * [ ] in a sheet name and truncates at 31 characters.
  const safeName = name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
  const worksheet = workbook.addWorksheet(safeName, {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  worksheet.addRow([titleGu]).font = headFont;
  worksheet.mergeCells(1, 1, 1, Math.max(1, columns.length));

  const header = worksheet.addRow(columns.map((column) => column.header));
  header.font = headFont;
  header.alignment = { vertical: "middle", wrapText: true };

  // Where each keyed row landed, for the styles below.
  const placed: { excelRow: number; key: string | null; side: "r" | "p" | undefined }[] = [
    { excelRow: 2, key: ROW_KEYS.head, side: "r" },
  ];
  for (const entry of rows) {
    const row: Row = Array.isArray(entry) ? { cells: entry } : entry;
    const added = worksheet.addRow(row.cells);
    placed.push({ excelRow: added.number, key: row.key ?? null, side: row.side });
    // The space a school asked for after this row: an empty row that tall.
    const gap = row.key ? layout.rowGapsMm[row.key] : undefined;
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

  /** One cell as the school's layout has it. Blank (NO_FILL) is Excel's default. */
  const apply = (cell: ExcelJS.Cell, style: CellStyle): void => {
    if (style.fill && style.fill !== NO_FILL) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(style.fill) } };
    }
    if (style.bold !== undefined || style.font || style.sizePt !== undefined) {
      cell.font = {
        ...cell.font,
        ...(style.font ? { name: fontFamily(style.font) } : {}),
        ...(style.sizePt !== undefined ? { size: excelSize(style.sizePt) } : {}),
        ...(style.bold !== undefined ? { bold: style.bold } : {}),
      };
    }
    if (style.align) cell.alignment = { ...cell.alignment, horizontal: style.align };
  };

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
    for (const { excelRow, key, side } of styled ? placed : []) {
      const row = worksheet.getRow(excelRow);
      const rowHeight = key ? layout.styles[targetKey({ kind: "row", row: key })]?.heightMm : undefined;
      if (rowHeight !== undefined) row.height = Math.round(rowHeight * PT_PER_MM * 10) / 10;
      columns.forEach((column, index) => {
        const id = layoutIdOf(column, side);
        const style: CellStyle = {
          ...(layout.align ? { align: layout.align } : {}),
          ...(id === null && key === null ? {} : styleAt(layout, key, id)),
        };
        if (Object.keys(style).length > 0) apply(row.getCell(index + 1), style);
      });
    }
  }

  return worksheet;
}

/** The lines every sheet title carries: whose books these are, and which year. */
function titleOf(school: SchoolDto, yearLabel: string, reportGu: string): string {
  return `${school.smcLabelGu} – ${reportGu} – ${yearLabel}`;
}

// ------------------------------------------------------------------- sheets

function rojmelSheet(
  workbook: ExcelJS.Workbook,
  school: SchoolDto,
  yearLabel: string,
  rojmel: Rojmel,
  layout: ReportLayout,
): void {
  const rows: Row[] = [];

  for (const page of rojmel.pages) {
    for (const block of page.blocks) {
      if (block.isNil) {
        rows.push({
          cells: [
            page.pageNo,
            block.fromDate === block.toDate
              ? date(block.fromDate)
              : `${date(block.fromDate)} – ${date(block.toDate)}`,
            "કોઈ નાણાંકીય વ્યવહાર કરેલ નથી",
            "",
            "",
            "",
            null,
            null,
            null,
          ],
        });
        continue;
      }

      // Which row of the printed block each line sits on - the key a layout
      // uses for it (shared/rojmel-rows.ts).
      const keyOf = new Map<unknown, string>();
      for (const row of rojmelBlockRows(block)) {
        if (row.left) keyOf.set(row.left, row.key);
        if (row.right) keyOf.set(row.right, row.key);
      }

      // The printed form is two columns side by side; a spreadsheet reads far
      // better as one column with the side named, and it can then be filtered.
      for (const [sideGu, side, lines] of [
        ["જમા", "r", block.receiptLines],
        ["ઉધાર", "p", block.paymentLines],
      ] as const) {
        for (const line of lines) {
          rows.push({
            key: keyOf.get(line) ?? null,
            side,
            cells: [
              page.pageNo,
              line.dateText,
              line.descriptionGu,
              sideGu,
              line.referenceText,
              line.chequeText,
              line.headingOnly ? null : rupees(line.cashPaise),
              line.headingOnly ? null : rupees(line.bankPaise),
              line.headingOnly ? null : rupees(line.totalPaise),
            ],
          });
        }
      }

      rows.push({
        key: ROW_KEYS.rojmelFooter(block.fromDate, "closing"),
        side: "p",
        cells: [
          page.pageNo,
          "",
          "શ્રી બંધ સિલક",
          "",
          "",
          "",
          rupees(block.closingCashPaise),
          rupees(block.closingBankPaise),
          rupees(block.closingTotalPaise),
        ],
      });
    }
  }

  sheet(
    workbook,
    "રોજમેળ",
    titleOf(school, yearLabel, "રોજમેળ"),
    [
      { header: "પાનું", width: 7 },
      { header: "તારીખ", width: 12, sided: "date" },
      { header: "વિગત", width: 46, sided: "detail" },
      { header: "બાજુ", width: 8 },
      { header: "પહોંચ / વાઉચર", width: 16, sided: "ref" },
      { header: "ચેક નં. તારીખ", width: 16, sided: "cheque" },
      { header: "રોકડ", width: 13, money: true, sided: "cash" },
      { header: "બેન્ક", width: 13, money: true, sided: "bank" },
      { header: "કુલ", width: 13, money: true, sided: "total" },
    ],
    rows,
    { report: "rojmel", layout },
  );
}

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
      { header: "બચત રહેલ", width: 13, money: true, layout: "saving" },
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
