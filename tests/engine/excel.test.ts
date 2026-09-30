/**
 * The Excel export, checked by reading back what it wrote.
 *
 * A workbook that opens but holds text where a number belongs is worse than no
 * export at all: the school would sort a column and get 1,000 above 9 without
 * anything looking wrong. So the file is written to bytes, parsed again, and the
 * CELL TYPES are asserted, not just the presence of sheets.
 *
 * It runs against the sample year's book through the same AccountsService the app
 * uses, so the figures here are the ones the reports print.
 */
import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";
import { AccountsService } from "../../src/server/accounts-service.js";
import { buildWorkbook, defaultExcelName, workbookBytes } from "../../src/server/excel.js";

const DB = path.join(process.cwd(), "prisma", "dev.db");

let accounts: AccountsService;

beforeAll(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${DB}` }) });
  const year = await prisma.financialYear.findFirstOrThrow({ orderBy: { label: "desc" } });
  accounts = new AccountsService(prisma, year.id);
});

/** Write the workbook out and read it back, the way a school's Excel would. */
async function roundTrip(report: Parameters<typeof buildWorkbook>[1]): Promise<ExcelJS.Workbook> {
  const bytes = await workbookBytes(await buildWorkbook(accounts, report));
  const reopened = new ExcelJS.Workbook();
  // ExcelJS declares its own Buffer type, which Node's no longer matches
  // structurally; the bytes are the same bytes.
  await reopened.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return reopened;
}

describe("font size", () => {
  it("writes every filled cell of every sheet in size 14", async () => {
    const workbook = await roundTrip("all");
    const sizes = new Set<number | undefined>();
    let cells = 0;
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cells += 1;
          sizes.add(cell.font?.size);
        });
      });
    }
    expect(cells).toBeGreaterThan(500);
    expect([...sizes]).toEqual([14]);
  });
});

describe("one report at a time", () => {
  it("writes Annexure 10 with its totals as numbers", async () => {
    const workbook = await roundTrip("annexure10");
    expect(workbook.worksheets.length).toBe(1);

    const sheet = workbook.worksheets[0]!;
    const statement = await accounts.getAnnexure10();

    // Row 1 is the title, row 2 the headings, so the first head is row 3.
    const firstHead = sheet.getRow(3);
    expect(firstHead.getCell(2).value).toBe(statement.rows[0]!.nameGu);
    expect(firstHead.getCell(3).value).toBe(statement.rows[0]!.openingPaise / 100);
    expect(typeof firstHead.getCell(3).value).toBe("number");

    // The last row is the કુલ total, and it must equal the engine's total - not
    // a sum Excel was asked to compute, which could be edited away.
    const total = sheet.getRow(sheet.rowCount);
    expect(total.getCell(9).value).toBe(statement.totals.closingPaise / 100);
  });

  it("keeps bill numbers as text", async () => {
    const workbook = await roundTrip("billRegister");
    const sheet = workbook.worksheets[0]!;
    const register = await accounts.getBillRegister();

    const withNumber = register.findIndex((row) => row.billNo !== null);
    expect(withNumber).toBeGreaterThanOrEqual(0);

    const cell = sheet.getRow(withNumber + 3).getCell(3);
    // "1/2" as a date would be the single worst bug in the client's own workbook
    // (SPEC 9.7). It has to come back as the string it went in as.
    expect(cell.value).toBe(register[withNumber]!.billNo);
    expect(typeof cell.value).toBe("string");
  });

  it("gives every grant head its own ledger sheet", async () => {
    const workbook = await roundTrip("khatavahi");
    const ledgers = await accounts.getLedgers();
    expect(workbook.worksheets.length).toBe(ledgers.length);
    // Sheet names are the heads' own Gujarati names, trimmed to Excel's limit
    // and with the characters Excel forbids in a name replaced - "વ્યાજ/વટાવ"
    // cannot be a sheet name with its slash.
    expect(workbook.worksheets[0]!.name).toBe(
      ledgers[0]!.nameGu.replace(/[:\\/?*[\]]/g, " ").slice(0, 31),
    );
  });

  it("writes the cash book with a page number on every row", async () => {
    const workbook = await roundTrip("rojmel");
    const sheet = workbook.worksheets[0]!;
    expect(sheet.rowCount).toBeGreaterThan(2);

    for (let row = 3; row <= sheet.rowCount; row += 1) {
      expect(typeof sheet.getRow(row).getCell(1).value).toBe("number");
    }
  });
});

describe("the whole year in one workbook", () => {
  it("has a sheet for every report plus the balances", async () => {
    const workbook = await roundTrip("all");
    const ledgers = await accounts.getLedgers();

    // rojmel + ledgers + grant/cheque/bill registers + vouchers + patrak D +
    // annexures 9 and 10 + balances.
    expect(workbook.worksheets.length).toBe(ledgers.length + 9);
    const names = workbook.worksheets.map((sheet) => sheet.name);
    expect(names).toContain("રોજમેળ");
    expect(names).toContain("પરિશિષ્ટ 10");
    expect(names).toContain("સિલક");
  });
});

describe("file names", () => {
  it("name the report and the year", () => {
    expect(defaultExcelName("all", "2025-26")).toBe("smc-hisab-2025-26.xlsx");
    expect(defaultExcelName("annexure9", "2025-26")).toBe("parishisht-9-2025-26.xlsx");
  });
});
