/**
 * Importing the client's own workbook, end to end.
 *
 * The one file this has to work on is the one in reference/, so that is what it
 * runs against: read it, review it the way the screen would, write it into a
 * freshly set-up empty year, and then check that the REPORTS computed from what
 * was written match the workbook's own figures.
 *
 * That last step is the point. A test that only counted rows would pass on an
 * import that dropped every amount.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { runMigrations } from "../../electron/migrate.js";
import { SetupService } from "../../src/server/setup-service.js";
import { AccountsService } from "../../src/server/accounts-service.js";
import { readLegacyWorkbook, suggestHead } from "../../src/server/legacy-import.js";
import { DEFAULT_GRANT_HEADS } from "../../src/lib/default-grant-heads.js";
import { rupeesToPaise } from "../../src/lib/money.js";
import type { LegacyImportSelection, SetupInput } from "../../src/shared/api.js";

const WORKBOOK = path.join(
  process.cwd(),
  "reference",
  "client_workbook_betavadana_muvada_2025-26.xlsm",
);
const DB = path.join(process.cwd(), ".import-test.db");
const MIGRATIONS = path.join(process.cwd(), "prisma", "migrations");
const YEAR = { label: "2025-26", startDate: "2025-04-01", endDate: "2026-03-31" };

function cleanUp(): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}

function setupInput(): SetupInput {
  return {
    school: {
      nameGu: "બેટાવાડાના મુવાડા પ્રા. શાળા",
      smcLabelGu: "SMCE બેટાવાડાના મુવાડા પ્રા.શાળા",
      diseCode: "24160201401",
      clusterGu: "અંતિસર",
      talukaGu: "કપડવંજ",
      districtGu: "ખેડા",
      programmeGu: "સમગ્ર શિક્ષા ખેડા – SMCE",
      memberSecretaryGu: "પટેલ દિપકકુમાર વી.",
      memberSecretaryShortGu: "સભ્ય સચિવ દિપકકુમાર.વી.પટેલ",
      memberSecretaryMobile: null,
    },
    bank: { bankNameGu: "Bank of Baroda (BOB)", branchGu: "અંતિસર", accountNo: "11590100001234" },
    year: { label: YEAR.label, startDate: YEAR.startDate, endDate: YEAR.endDate },
    grantHeads: DEFAULT_GRANT_HEADS.map((head) => ({ ...head })),
    openingBalances: [],
  };
}

let prisma: PrismaClient;
let accounts: AccountsService;

beforeAll(async () => {
  cleanUp();
  runMigrations(DB, MIGRATIONS);
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${DB}` }) });

  const result = await new SetupService(prisma).completeSetup(setupInput());
  expect(result.ok, JSON.stringify(result)).toBe(true);

  const year = await prisma.financialYear.findFirstOrThrow();
  accounts = new AccountsService(prisma, year.id);
});

afterAll(async () => {
  await prisma.$disconnect();
  cleanUp();
});

describe("reading the client's workbook", () => {
  it("finds the year's receipts, bills and cheques", async () => {
    const plan = await readLegacyWorkbook(WORKBOOK, YEAR);

    // The corrected sample data for this year has 12 receipts, 41 bills and 8
    // cheques. The bill register also carries one row for the grant return,
    // which is not a bill - hence 42 rows read.
    expect(plan.receipts.length).toBe(12);
    expect(plan.bills.length).toBe(42);
    expect(plan.cheques.length).toBe(8);
  });

  it("converts the legacy-font grant head names", async () => {
    const plan = await readLegacyWorkbook(WORKBOOK, YEAR);
    expect(plan.headNames).toContain("શાળા સ્વચ્છતા ગ્રાન્ટ");
    expect(plan.headNames).toContain("પ્રવેશોત્સવ ગ્રાન્ટ");
    // Not a single raw legacy byte left in any name.
    for (const name of plan.headNames) expect(name).toMatch(/^[઀-૿\s]+$/u);
  });

  it("recovers the bill numbers Excel turned into dates", async () => {
    const plan = await readLegacyWorkbook(WORKBOOK, YEAR);
    const numbers = plan.bills.map((bill) => bill.billNo);
    expect(numbers).toContain("1/1");
    expect(numbers).toContain("1/2");
    expect(numbers).toContain("8/7");
    // And every recovery said so, so nobody trusts it blindly.
    const recovered = plan.bills.filter((bill) =>
      bill.notes.some((note) => note.includes("બીલ નંબર")),
    );
    expect(recovered.length).toBeGreaterThan(0);
  });

  it("flags the dates that fall outside the year instead of importing them quietly", async () => {
    const plan = await readLegacyWorkbook(WORKBOOK, YEAR);
    expect(plan.issues.some((issue) => issue.code === "dates_outside_year")).toBe(true);
    expect(
      plan.bills.filter((bill) => bill.notes.some((note) => note.includes("તપાસો"))).length,
    ).toBeGreaterThan(0);
  });

  it("works out each cheque's type from its payee and purpose", async () => {
    const plan = await readLegacyWorkbook(WORKBOOK, YEAR);
    const byNo = new Map(plan.cheques.map((cheque) => [cheque.chequeNo, cheque]));

    // 103-106 and 110 went to the member secretary against bills he had paid.
    expect(byNo.get(103)!.suggestedType).toBe("REIMBURSEMENT");
    expect(byNo.get(110)!.suggestedType).toBe("REIMBURSEMENT");
    // 107 is the unspent balance going back to the CRC.
    expect(byNo.get(107)!.suggestedType).toBe("GRANT_RETURN");
    // 108 and 109 were paid straight to the painter and the shop.
    expect(byNo.get(108)!.suggestedType).toBe("DIRECT");
    expect(byNo.get(109)!.suggestedType).toBe("DIRECT");
  });

  it("suggests a grant head where the wording gives one away, and admits when it does not", () => {
    const heads = ["શાળા સ્વચ્છતા ગ્રાન્ટ", "બાળમેળો ગ્રાન્ટ"];
    expect(suggestHead("શાળા સ્વચ્છતા મટરીયલ્સ", heads)).toBe("શાળા સ્વચ્છતા ગ્રાન્ટ");
    expect(suggestHead("બાળમેળો મટરીયલ્સ", heads)).toBe("બાળમેળો ગ્રાન્ટ");
    // "cleaning labour" names no head at all; the reviewer has to choose.
    expect(suggestHead("સફાઈકામ મજૂરી", heads)).toBeNull();
  });
});

describe("importing it into an empty year", () => {
  it("writes the rows that were reviewed, and reproduces the workbook's figures", async () => {
    const preview = await accounts.previewLegacyImport(WORKBOOK);
    expect(preview.ok, JSON.stringify(preview)).toBe(true);
    if (!preview.ok) return;

    expect(preview.data.yearHasData).toBe(false);

    const heads = await accounts.listGrantHeads();
    const idByName = new Map(heads.map((head) => [head.nameGu, head.id]));
    const swachhata = idByName.get("શાળા સ્વચ્છતા ગ્રાન્ટ")!;
    const civil = idByName.get("સિવિલ ગ્રાન્ટ")!;
    const interest = idByName.get("વ્યાજ/વટાવ")!;

    // The matcher gets most names; "વ્યાજ જમા" and "સિવિલ ગ્રાન્ટ જમાં" are the
    // ones the file spells differently.
    const headIdFor = new Map(
      preview.data.headMatches.map((match) => [match.fileName, match.grantHeadId]),
    );
    expect(headIdFor.get("શાળા સ્વચ્છતા ગ્રાન્ટ")).toBe(swachhata);
    expect(headIdFor.get("સિવિલ ગ્રાન્ટ જમાં")).toBe(civil);

    const plan = preview.data.plan;

    // Reviewing, the way the screen does it: take the match or the suggestion,
    // and fall back to the head a person would pick.
    const selection: LegacyImportSelection = {
      plan,
      receipts: plan.receipts.map((row) => ({
        sourceRow: row.sourceRow,
        grantHeadId: headIdFor.get(row.headNameGu) ?? interest,
      })),
      bills: plan.bills
        // The grant-return row is not a bill; a reviewer leaves it out.
        .filter((row) => !row.descriptionGu.includes("પરત"))
        .map((row) => ({
          sourceRow: row.sourceRow,
          grantHeadId:
            (row.suggestedHeadName === null ? null : idByName.get(row.suggestedHeadName)) ??
            (row.descriptionGu.includes("કલર") ? civil : swachhata),
        })),
      cheques: plan.cheques.map((row) => ({
        sourceRow: row.sourceRow,
        type: row.suggestedType,
        grantHeadId: row.suggestedType === "GRANT_RETURN" ? swachhata : null,
      })),
    };

    const applied = await accounts.applyLegacyImport(selection);
    expect(applied.ok, JSON.stringify(applied)).toBe(true);
    if (!applied.ok) return;

    expect(applied.data.receipts).toBe(12);
    expect(applied.data.bills).toBe(41);
    expect(applied.data.cheques).toBe(8);

    // Now the test that matters: the reports computed from what was imported.
    const dashboard = await accounts.getDashboard();
    expect(dashboard.counts).toEqual({ receipts: 12, bills: 41, cheques: 8, unpaidBills: 0 });

    // The workbook's own grant total for the year: 29,427.
    //
    // The corrected sample data says 29,417, and the ten rupees between them are
    // SPEC 9.3: the grant register shows the first interest credit as 55 where
    // the cash book and the ledger say 45. The importer reads the file and
    // reproduces it - it is not its job to quietly correct the school's books,
    // and the difference is exactly the kind of thing the validation screen is
    // there to surface afterwards.
    expect(dashboard.annexure10.totals.receivedPaise).toBe(rupeesToPaise(29427));

    // Every bill ended up on the cheque that paid it, so no voucher is orphaned.
    const vouchers = await accounts.getVouchers();
    expect(vouchers.length).toBeGreaterThan(0);
    expect(vouchers.every((voucher) => voucher.chequeNo !== null)).toBe(true);
    // And each voucher's bills add up to its cheque.
    expect(vouchers.every((voucher) => voucher.balances)).toBe(true);
  });

  it("refuses a second import into the same year", async () => {
    const preview = await accounts.previewLegacyImport(WORKBOOK);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.yearHasData).toBe(true);

    const result = await accounts.applyLegacyImport({
      plan: preview.data.plan,
      receipts: [],
      bills: [],
      cheques: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe("year_not_empty");
  });
});
