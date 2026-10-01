/**
 * The masters screens' writes, and year closing.
 *
 * Both are tested against a real database built from the shipped migrations,
 * because both are about what the DATABASE ends up holding: a renamed head that
 * every year now prints, and a second year whose opening balances came from the
 * first year's closing. A pure engine test could not see either.
 *
 * Closing is the one action here that cannot be undone from any screen, so the
 * refusals get as much attention as the happy path.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { runMigrations } from "../../electron/migrate.js";
import { SetupService } from "../../src/server/setup-service.js";
import { AccountsService } from "../../src/server/accounts-service.js";
import { DEFAULT_GRANT_HEADS } from "../../src/lib/default-grant-heads.js";
import { rupeesToPaise } from "../../src/lib/money.js";
import type { SetupInput } from "../../src/shared/api.js";

const DB = path.join(process.cwd(), ".closing-test.db");
const MIGRATIONS = path.join(process.cwd(), "prisma", "migrations");

function cleanUp(): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}

const SETUP: SetupInput = {
  school: {
    nameGu: "પરીક્ષા પ્રા. શાળા",
    smcLabelGu: "SMCE પરીક્ષા પ્રા. શાળા",
    diseCode: "24160299999",
    clusterGu: "પરીક્ષા ક્લસ્ટર",
    talukaGu: "કપડવંજ",
    districtGu: "ખેડા",
    programmeGu: "સમગ્ર શિક્ષા ખેડા – SMCE",
    memberSecretaryGu: "પટેલ રમેશભાઈ",
    memberSecretaryShortGu: "સભ્ય સચિવ રમેશ.પટેલ",
    memberSecretaryMobile: "9999999999",
  },
  bank: { bankNameGu: "Bank of Baroda (BOB)", branchGu: "અંતિસર", accountNo: "11590100009999" },
  year: { label: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31" },
  grantHeads: DEFAULT_GRANT_HEADS.map((head) => ({ ...head })),
  openingBalances: [
    { code: "INTEREST", bankPaise: rupeesToPaise(154), cashPaise: 0 },
    { code: "SWACHHATA", bankPaise: rupeesToPaise(2000), cashPaise: 0 },
  ],
};

let prisma: PrismaClient;
let accounts: AccountsService;
let yearId: number;

beforeAll(async () => {
  cleanUp();
  runMigrations(DB, MIGRATIONS);
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${DB}` }) });

  const result = await new SetupService(prisma).completeSetup(SETUP);
  expect(result.ok, JSON.stringify(result)).toBe(true);

  const year = await prisma.financialYear.findFirstOrThrow();
  yearId = year.id;
  accounts = new AccountsService(prisma, yearId);
});

afterAll(async () => {
  await prisma.$disconnect();
  cleanUp();
});

describe("the school's own details", () => {
  it("are corrected in place, bank account included", async () => {
    const before = await accounts.getSchool();
    const result = await accounts.saveSchool({
      ...before,
      nameGu: "સુધારેલ પ્રા. શાળા",
      diseCode: "24160200001",
      bankBranchGu: "કપડવંજ",
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const after = await accounts.getSchool();
    expect(after.nameGu).toBe("સુધારેલ પ્રા. શાળા");
    expect(after.diseCode).toBe("24160200001");
    expect(after.bankBranchGu).toBe("કપડવંજ");
    // Edited, not replaced: still exactly one account for the receipts and
    // cheques to point at.
    expect(await prisma.bankAccount.count()).toBe(1);
  });

  it("refuse a blank required field", async () => {
    const before = await accounts.getSchool();
    const result = await accounts.saveSchool({ ...before, diseCode: "  " });
    expect(result.ok).toBe(false);
    // And nothing was written.
    expect((await accounts.getSchool()).diseCode).toBe("24160200001");
  });
});

describe("grant heads", () => {
  it("are added at the end of the print order", async () => {
    const before = await accounts.listGrantHeads();
    const result = await accounts.createGrantHead({ nameGu: "નવી ગ્રાન્ટ" });
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const after = await accounts.listGrantHeads();
    expect(after.length).toBe(before.length + 1);
    expect(after[after.length - 1]!.nameGu).toBe("નવી ગ્રાન્ટ");
    expect(after[after.length - 1]!.reportOrder).toBe(before.length + 1);
  });

  it("refuse a second head with the same name", async () => {
    const result = await accounts.createGrantHead({ nameGu: "નવી ગ્રાન્ટ" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe("duplicate_grant_head");
  });

  it("are renamed and reordered", async () => {
    const heads = await accounts.listGrantHeads();
    const head = heads[heads.length - 1]!;
    const result = await accounts.updateGrantHead(head.id, {
      nameGu: "સુધારેલ ગ્રાન્ટ",
      reportOrder: 1,
      active: false,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);

    const updated = (await accounts.listGrantHeads()).find((each) => each.id === head.id)!;
    expect(updated.nameGu).toBe("સુધારેલ ગ્રાન્ટ");
    expect(updated.reportOrder).toBe(1);
    expect(updated.active).toBe(false);
  });

  it("can be deleted while nothing points at them", async () => {
    const head = (await accounts.listGrantHeads()).find(
      (each) => each.nameGu === "સુધારેલ ગ્રાન્ટ",
    )!;
    const result = await accounts.deleteGrantHead(head.id);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect((await accounts.listGrantHeads()).some((each) => each.id === head.id)).toBe(false);
  });

  it("are refused deletion once they carry an opening balance", async () => {
    const head = (await accounts.listGrantHeads()).find((each) => each.code === "SWACHHATA")!;
    const result = await accounts.deleteGrantHead(head.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe("grant_head_has_opening_balance");
  });
});

describe("bank charges", () => {
  it("are saved, show in the ledger, and close the year short by as much - not in Annexure 10", async () => {
    const heads = await accounts.listGrantHeads();
    const swachhata = heads.find((head) => head.code === "SWACHHATA")!;
    const before = await accounts.getYearEndPreview();
    const annexureBefore = await accounts.getAnnexure10();

    expect((await accounts.createBankCharge({ date: "2026-05-01", grantHeadId: swachhata.id, amountPaise: 0, descriptionGu: "બેન્ક ચાર્જ" })).ok).toBe(false);
    expect((await accounts.createBankCharge({ date: "2026-05-01", grantHeadId: swachhata.id, amountPaise: 1770, descriptionGu: "  " })).ok).toBe(false);

    const created = await accounts.createBankCharge({
      date: "2026-05-01",
      grantHeadId: swachhata.id,
      amountPaise: 1770,
      descriptionGu: "બેન્ક ચાર્જ",
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    if (!created.ok) return;
    expect(await accounts.listBankCharges()).toEqual([created.data]);

    const ledgers = await accounts.getLedgers();
    const row = ledgers.find((each) => each.headCode === "SWACHHATA")!.rows.find((each) => each.descriptionGu === "બેન્ક ચાર્જ");
    expect(row?.debitPaise).toBe(1770);
    expect(row?.rojmelPage).not.toBeNull();
    expect(await accounts.getAnnexure10()).toEqual(annexureBefore);

    const after = await accounts.getYearEndPreview();
    const closing = (preview: typeof after): number => preview.rows.find((each) => each.headCode === "SWACHHATA")!.closingPaise;
    expect(closing(after)).toBe(closing(before) - 1770);
    expect(after.totalClosingPaise).toBe(before.totalClosingPaise - 1770);

    const edited = await accounts.updateBankCharge(created.data.id, { ...created.data, amountPaise: 2000 });
    expect(edited.ok && edited.data.amountPaise).toBe(2000);

    expect((await accounts.deleteBankCharge(created.data.id)).ok).toBe(true);
    expect(await accounts.listBankCharges()).toEqual([]);
    expect((await accounts.getYearEndPreview()).totalClosingPaise).toBe(before.totalClosingPaise);
  });
});

describe("the year-end preview", () => {
  it("shows next year's label and this year's closing balances", async () => {
    const preview = await accounts.getYearEndPreview();
    expect(preview.suggestedNextLabel).toBe("2027-28");
    expect(preview.existingLabels).toEqual(["2026-27"]);
    expect(preview.cashPaise).toBe(0);
    // Nothing was entered, so every head closes where it opened.
    expect(preview.totalClosingPaise).toBe(rupeesToPaise(2154));
    expect(preview.blocking).toEqual([]);
  });
});

describe("closing the year", () => {
  it("refuses a label that is not 2027-28 shaped", async () => {
    const result = await accounts.closeYear({ nextLabel: "2027" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe("bad_year_label");
    expect(await prisma.financialYear.count()).toBe(1);
  });

  it("refuses to reuse an existing year", async () => {
    const result = await accounts.closeYear({ nextLabel: "2026-27" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe("year_exists");
    expect(await prisma.financialYear.count()).toBe(1);
  });

  it("creates the next year with this year's closing balances as its openings", async () => {
    const closings = await accounts.getYearEndPreview();
    const result = await accounts.closeYear({ nextLabel: "2027-28" });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    expect(result.data.label).toBe("2027-28");
    expect(result.data.startDate).toBe("2027-04-01");
    expect(result.data.endDate).toBe("2028-03-31");

    const next = new AccountsService(prisma, result.data.id);
    const openings = await next.listOpeningBalances();

    // Only the active heads carried forward, each with its closing in the bank
    // column and nothing in cash.
    const activeCodes = closings.rows.map((row) => row.headCode);
    expect(openings.map((row) => row.headCode).sort()).toEqual([...activeCodes].sort());
    for (const opening of openings) {
      const closing = closings.rows.find((row) => row.headCode === opening.headCode)!;
      expect(opening.bankPaise).toBe(closing.closingPaise);
      expect(opening.cashPaise).toBe(0);
    }

    // And the new year opens exactly where the old one closed.
    const dashboard = await next.getDashboard();
    expect(dashboard.annexure10.totals.openingPaise).toBe(closings.totalClosingPaise);
    expect(dashboard.counts).toEqual({ receipts: 0, bills: 0, cheques: 0, unpaidBills: 0 });
    // Annexure 9 has a reconciliation row from the first day.
    expect(await next.getAnnexure9()).toBeTruthy();
  });

  it("marks the old year closed and refuses to close it twice", async () => {
    const year = await prisma.financialYear.findUniqueOrThrow({ where: { id: yearId } });
    expect(year.status).toBe("CLOSED");

    const result = await accounts.closeYear({ nextLabel: "2028-29" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe("year_already_closed");
    expect(await prisma.financialYear.count()).toBe(2);
  });

  it("refuses every write to the closed year, while still printing it", async () => {
    const head = (await accounts.listGrantHeads())[0]!;

    const writes = await Promise.all([
      accounts.saveOpeningBalance({ grantHeadId: head.id, bankPaise: 100, cashPaise: 0 }),
      accounts.deleteReceipt(1),
      accounts.saveReconciliation({
        chequesIssuedNotCashedPaise: 100,
        creditsInBankNotInCashbookPaise: 0,
        depositsNotYetCreditedPaise: 0,
        bankChargesNotInCashbookPaise: 0,
        passbookBalancePaise: 100,
      }),
    ]);
    for (const write of writes) {
      expect(write.ok).toBe(false);
      if (!write.ok) expect(write.issues[0]!.code).toBe("year_closed");
    }

    // Reading and printing a submitted year stays open.
    const rojmel = await accounts.getRojmel();
    expect(rojmel.pages.length).toBeGreaterThan(0);
    expect((await accounts.getAnnexure10()).totals.closingPaise).toBe(rupeesToPaise(2154));
  });

  it("switches which year is open", async () => {
    const years = await accounts.listFinancialYears();
    const next = years.find((year) => year.label === "2027-28")!;

    const opened = await accounts.openYear(next.id);
    expect(opened.ok).toBe(true);
    if (opened.ok) expect(opened.data.label).toBe("2027-28");

    const missing = await accounts.openYear(9999);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues[0]!.code).toBe("unknown_year");
  });
});

describe("changing next year's openings while closing", () => {
  it("opens with the amounts the school typed, and the closing balance everywhere else", async () => {
    const year = await prisma.financialYear.findFirstOrThrow({ where: { label: "2027-28" } });
    const books = new AccountsService(prisma, year.id);
    const preview = await books.getYearEndPreview();
    const changed = preview.rows.find((row) => row.headCode === "SWACHHATA")!;

    const refused = await books.closeYear({ nextLabel: "2028-29", openings: { [changed.grantHeadId]: -5 } });
    expect(refused.ok).toBe(false);

    const result = await books.closeYear({
      nextLabel: "2028-29",
      openings: { [changed.grantHeadId]: rupeesToPaise(1500) },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    const openings = await new AccountsService(prisma, result.data.id).listOpeningBalances();
    for (const opening of openings) {
      const closing = preview.rows.find((row) => row.headCode === opening.headCode)!;
      expect(opening.bankPaise, opening.headCode).toBe(
        opening.headCode === "SWACHHATA" ? rupeesToPaise(1500) : closing.closingPaise,
      );
    }
  });
});
