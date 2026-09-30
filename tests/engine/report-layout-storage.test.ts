/**
 * A report layout in the books, and in the Excel file.
 *
 * Runs on a copy of the sample year's database, so saving layouts here never
 * touches prisma/dev.db. What is checked is what the school relies on: a saved
 * layout comes back as saved and outlives the year it was made in; "back to
 * default" leaves nothing behind; a bad or damaged layout never stops a report
 * from printing; and the workbook carries the widths, fonts, highlights and
 * spacing onto the same entries the PDF shows them on.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { runMigrations } from "../../electron/migrate.js";
import { AccountsService } from "../../src/server/accounts-service.js";
import { buildWorkbook, workbookBytes } from "../../src/server/excel.js";
import {
  NO_FILL,
  ROW_KEYS,
  emptyLayout,
  setColumnWidth,
  withRowGap,
  withStyle,
  type ReportLayout,
} from "../../src/shared/report-layout.js";

const DIR = mkdtempSync(path.join(os.tmpdir(), "smc-layout-"));
const DB = path.join(DIR, "books.db");

let prisma: PrismaClient;
let accounts: AccountsService;

beforeAll(async () => {
  copyFileSync(path.join(process.cwd(), "prisma", "dev.db"), DB);
  // The copy gets the shipped migrations, as a school's books do on opening.
  runMigrations(DB, path.join(process.cwd(), "prisma", "migrations"));
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${DB}` }) });
  const year = await prisma.financialYear.findFirstOrThrow({ orderBy: { label: "desc" } });
  accounts = new AccountsService(prisma, year.id);
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(DIR, { recursive: true, force: true });
});

async function roundTrip(report: Parameters<typeof buildWorkbook>[1]): Promise<ExcelJS.Workbook> {
  const bytes = await workbookBytes(await buildWorkbook(accounts, report));
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return reopened;
}

/** A cell's solid fill colour, or null: ExcelJS reads "no fill" back as pattern "none". */
function fillOf(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill as { pattern?: string; fgColor?: { argb?: string } } | undefined;
  return fill?.pattern === "solid" ? (fill.fgColor?.argb ?? null) : null;
}

function saved<T>(result: { ok: true; data: T } | { ok: false }): T {
  if (!result.ok) throw new Error("expected the save to succeed");
  return result.data;
}

describe("in the books", () => {
  it("is empty until a school saves one", async () => {
    expect(await accounts.getReportLayout("chequeRegister")).toEqual(emptyLayout());
  });

  it("comes back exactly as saved, per report", async () => {
    const layout: ReportLayout = withStyle(
      { ...emptyLayout(), font: "hind-vadodara", sizePt: 13 },
      { kind: "col", col: "amount" },
      { fill: "#fff59d" },
    );
    expect(saved(await accounts.saveReportLayout("billRegister", layout))).toEqual(layout);
    expect(await accounts.getReportLayout("billRegister")).toEqual(layout);
    // Another report is untouched.
    expect(await accounts.getReportLayout("chequeRegister")).toEqual(emptyLayout());
  });

  it("belongs to the school, so every year of it prints alike", async () => {
    const other = await prisma.financialYear.create({
      data: {
        schoolId: (await prisma.school.findFirstOrThrow()).id,
        label: "2099-00",
        startDate: "2099-04-01",
        endDate: "2100-03-31",
      },
    });
    const nextYear = new AccountsService(prisma, other.id);
    expect((await nextYear.getReportLayout("billRegister")).font).toBe("hind-vadodara");
    await prisma.financialYear.delete({ where: { id: other.id } });
  });

  it("leaves nothing stored once put back to default", async () => {
    saved(await accounts.saveReportLayout("billRegister", emptyLayout()));
    expect(await prisma.reportLayout.count()).toBe(0);
    expect(await accounts.getReportLayout("billRegister")).toEqual(emptyLayout());
  });

  it("refuses a layout outside the limits, and an unknown report", async () => {
    const huge = { ...emptyLayout(), sizePt: 400 };
    const refused = await accounts.saveReportLayout("billRegister", huge);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.issues[0]?.code).toBe("invalid_layout");
    const unknown = await accounts.saveReportLayout("nonsense" as never, emptyLayout());
    expect(unknown.ok).toBe(false);
  });

  it("prints the default rather than failing when a stored layout is damaged", async () => {
    const schoolId = (await prisma.school.findFirstOrThrow()).id;
    await prisma.reportLayout.create({
      data: { schoolId, report: "patrakD", layoutJson: "{not json" },
    });
    expect(await accounts.getReportLayout("patrakD")).toEqual(emptyLayout());
    await prisma.reportLayout.deleteMany({});
  });
});

describe("in Excel", () => {
  it("writes the default workbook when no layout is saved", async () => {
    const sheet = (await roundTrip("chequeRegister")).worksheets[0]!;
    // 11-point character widths scaled to 14 (excel.ts), unchanged.
    expect(sheet.getColumn(7).width).toBeCloseTo((28 * 14) / 11, 1);
    expect(fillOf(sheet.getRow(3).getCell(6))).toBeNull();
  });

  it("carries widths, fonts, sizes, highlights and row spacing onto the same entries", async () => {
    const register = await accounts.getChequeRegister();
    const first = register[0]!;
    const second = register[1]!;

    let layout: ReportLayout = { ...emptyLayout(), font: "noto-serif", sizePt: 16 };
    // The payee column half as wide again as the form's 15%.
    layout = setColumnWidth("chequeRegister", layout, "payee", 22.5);
    layout = withStyle(layout, { kind: "row", row: ROW_KEYS.cheque(first.chequeNo) }, { fill: "#c8e6c9" });
    layout = withStyle(
      layout,
      { kind: "cell", row: ROW_KEYS.cheque(first.chequeNo), col: "amount" },
      { fill: "#fff59d", bold: true },
    );
    layout = withRowGap(layout, ROW_KEYS.cheque(first.chequeNo), 5);
    saved(await accounts.saveReportLayout("chequeRegister", layout));

    const sheet = (await roundTrip("chequeRegister")).worksheets[0]!;

    // Payee is Excel column 7: 28 characters, scaled to 14pt, then by 1.5.
    expect(sheet.getColumn(7).width).toBeCloseTo((28 * 14 * 1.5) / 11, 0);

    // Row 3 is the first cheque: its row colour everywhere, its amount cell its own.
    const row = sheet.getRow(3);
    expect(row.getCell(2).value).toBe(first.chequeNo);
    expect(fillOf(row.getCell(7))).toBe("FFC8E6C9");
    expect(fillOf(row.getCell(6))).toBe("FFFFF59D");
    expect(row.getCell(6).font).toMatchObject({ bold: true, name: "Noto Serif Gujarati" });

    // Sizes keep their proportion to the form's 14: 16 there is 16 here.
    expect(row.getCell(7).font).toMatchObject({ name: "Noto Serif Gujarati", size: 16 });

    // The 5mm after it is an empty row that tall, and the next cheque follows.
    expect(sheet.getRow(4).getCell(2).value).toBeNull();
    expect(sheet.getRow(4).height).toBeCloseTo(14.2, 1);
    expect(sheet.getRow(5).getCell(2).value).toBe(second.chequeNo);
    expect(fillOf(sheet.getRow(5).getCell(7))).toBeNull();
  });

  it("styles the title row, aligns as asked and never fills a blank cell", async () => {
    let layout: ReportLayout = { ...emptyLayout(), align: "left" };
    layout = withStyle(layout, { kind: "part", part: "title" }, { sizePt: 18, fill: "#ffe0b2", heightMm: 12 });
    layout = withStyle(layout, { kind: "col", col: "amount" }, { fill: NO_FILL, align: "right" });
    saved(await accounts.saveReportLayout("patrakD", layout));

    const sheet = (await roundTrip("patrakD")).worksheets[0]!;
    const title = sheet.getRow(1).getCell(1);
    expect(fillOf(title)).toBe("FFFFE0B2");
    expect(title.font).toMatchObject({ size: 18 });
    expect(sheet.getRow(1).height).toBeCloseTo(34, 0);
    // Blank is Excel's own blank; the report's alignment, then the column's.
    expect(fillOf(sheet.getRow(3).getCell(7))).toBeNull();
    expect(sheet.getRow(3).getCell(7).alignment).toMatchObject({ horizontal: "right" });
    expect(sheet.getRow(3).getCell(4).alignment).toMatchObject({ horizontal: "left" });
  });

  it("finds a rojmel highlight on the side and row it was made on", async () => {
    const rojmel = await accounts.getRojmel();
    const block = rojmel.blocks.find((each) => !each.isNil && each.paymentLines.length > 0)!;
    const key = ROW_KEYS.rojmelRow(block.id, 0);
    saved(
      await accounts.saveReportLayout(
        "rojmel",
        withStyle(emptyLayout(), { kind: "cell", row: key, col: "p.detail" }, { fill: "#bbdefb" }),
      ),
    );

    const sheet = (await roundTrip("rojmel")).worksheets[0]!;
    const filled: string[] = [];
    sheet.eachRow((row) => {
      // Column 9 is the જાવક side's વિગત. The footers' own colour is not the school's.
      const detail = row.getCell(9);
      if (fillOf(detail) === "FFBBDEFB") filled.push(String(detail.value));
    });
    // Exactly one cell: the payment side's first line of that block.
    expect(filled).toEqual([block.paymentLines[0]!.descriptionGu]);
  });
});

describe("colours and page setup in the workbook", () => {
  it("colours every grant received in the rojmel, from its words to its amounts", async () => {
    saved(await accounts.saveReportLayout("rojmel", emptyLayout()));
    const receipts = await accounts.listReceipts();
    const sheet = (await roundTrip("rojmel")).worksheets[0]!;
    const coloured: string[] = [];
    sheet.eachRow((row) => {
      // Column 2 is the આવક side's વિગત, 8 its કુલ રકમ.
      if (fillOf(row.getCell(2)) === "FFE3EEFA") {
        expect(fillOf(row.getCell(8))).toBe("FFE3EEFA");
        // Not the date, nor the payment side.
        expect(fillOf(row.getCell(1))).toBeNull();
        coloured.push(String(row.getCell(2).value));
      }
    });
    expect(coloured).toHaveLength(receipts.length);
    // The opening balance is not a grant received.
    expect(coloured).not.toContain("શ્રી ઉઘડતી સિલક");
  });

  it("carries the text and line colours, the paper and the zoom", async () => {
    const layout: ReportLayout = withStyle(
      { ...emptyLayout(), lineColour: "#9e9e9e", page: { paper: "a4", orientation: "portrait", scalePct: 80 } },
      { kind: "col", col: "amount" },
      { colour: "#b71c1c" },
    );
    saved(await accounts.saveReportLayout("chequeRegister", layout));
    const sheet = (await roundTrip("chequeRegister")).worksheets[0]!;
    const cell = sheet.getRow(3).getCell(6);
    expect(cell.font?.color?.argb).toBe("FFB71C1C");
    expect(cell.border?.top?.color?.argb).toBe("FF9E9E9E");
    expect(sheet.getRow(3).getCell(2).border?.left?.color?.argb).toBe("FF9E9E9E");
    expect(sheet.pageSetup).toMatchObject({ paperSize: 9, orientation: "portrait", scale: 80, fitToPage: false });
    saved(await accounts.saveReportLayout("chequeRegister", emptyLayout()));
  });
});
