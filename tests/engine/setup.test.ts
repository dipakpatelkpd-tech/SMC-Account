/**
 * First-run setup, against a genuinely empty database.
 *
 * This is the one path nobody exercises during development - here the database
 * has always existed - and the one that every new installation depends on. So
 * it is tested the hard way: build a database from the shipped migrations, run
 * setup through the real service, and check the application can read what it
 * produced.
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

const DB = path.join(process.cwd(), ".setup-test.db");
const MIGRATIONS = path.join(process.cwd(), "prisma", "migrations");

function cleanUp(): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}

function validInput(): SetupInput {
  return {
    school: {
      nameGu: "પરીક્ષા પ્રા. શાળા",
      smcLabelGu: "SMCE પરીક્ષા પ્રા. શાળા",
      diseCode: "24160299999",
      clusterGu: "પરીક્ષા ક્લસ્ટર",
      talukaGu: "કપડવંજ",
      districtGu: "ખેડા",
      programmeGu: "સમગ્ર શિક્ષા ખેડા – SMCE / સર્વ શિક્ષા અભિયાન – ખેડા",
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
}

let prisma: PrismaClient;
let setup: SetupService;

beforeAll(() => {
  cleanUp();
  runMigrations(DB, MIGRATIONS);
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${DB}` }) });
  setup = new SetupService(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  cleanUp();
});

describe("a freshly migrated database", () => {
  it("reports that it needs setting up", async () => {
    const state = await setup.getSetupState();
    expect(state.needsSetup).toBe(true);
    expect(state.schoolNameGu).toBeNull();
    expect(state.yearLabel).toBeNull();
  });
});

describe("validation refuses an unusable school", () => {
  it.each([
    ["no school name", (input: SetupInput) => ({ ...input, school: { ...input.school, nameGu: "  " } })],
    ["no DISE code", (input: SetupInput) => ({ ...input, school: { ...input.school, diseCode: "" } })],
    ["no bank account", (input: SetupInput) => ({ ...input, bank: { ...input.bank, accountNo: "" } })],
    ["no grant heads", (input: SetupInput) => ({ ...input, grantHeads: [] })],
  ])("rejects %s", async (_name, break_) => {
    const result = await setup.completeSetup(break_(validInput()));
    expect(result.ok).toBe(false);
  });

  it("rejects a year label that is not 2025-26 shaped", async () => {
    const result = await setup.completeSetup({
      ...validInput(),
      year: { label: "2026", startDate: "", endDate: "" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe("bad_year_label");
  });

  it("rejects a negative opening balance", async () => {
    const result = await setup.completeSetup({
      ...validInput(),
      openingBalances: [{ code: "INTEREST", bankPaise: -100, cashPaise: 0 }],
    });
    expect(result.ok).toBe(false);
  });

  it("leaves the database empty after every refusal", async () => {
    expect(await prisma.school.count()).toBe(0);
    expect(await prisma.financialYear.count()).toBe(0);
    expect(await prisma.grantHead.count()).toBe(0);
  });
});

describe("completing setup", () => {
  it("creates the school, bank, year, heads and balances", async () => {
    const result = await setup.completeSetup(validInput());
    expect(result.ok, JSON.stringify(result)).toBe(true);

    expect(await prisma.school.count()).toBe(1);
    expect(await prisma.bankAccount.count()).toBe(1);
    expect(await prisma.financialYear.count()).toBe(1);
    expect(await prisma.grantHead.count()).toBe(DEFAULT_GRANT_HEADS.length);
    expect(await prisma.grantHeadYear.count()).toBe(DEFAULT_GRANT_HEADS.length);
    // Only the two that were given one.
    expect(await prisma.openingBalance.count()).toBe(2);
    // Annexure 9 has something to read from day one.
    expect(await prisma.bankReconciliation.count()).toBe(1);
  });

  it("now reports that it does not need setting up", async () => {
    const state = await setup.getSetupState();
    expect(state.needsSetup).toBe(false);
    expect(state.schoolNameGu).toBe("પરીક્ષા પ્રા. શાળા");
    expect(state.yearLabel).toBe("2026-27");
  });

  it("refuses to run a second time", async () => {
    const result = await setup.completeSetup(validInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe("already_set_up");
    // And nothing was duplicated.
    expect(await prisma.school.count()).toBe(1);
  });
});

describe("the application can use what setup produced", () => {
  it("opens a dashboard on the new year", async () => {
    const year = await prisma.financialYear.findFirstOrThrow();
    const accounts = new AccountsService(prisma, year.id);

    const dashboard = await accounts.getDashboard();
    expect(dashboard.school.nameGu).toBe("પરીક્ષા પ્રા. શાળા");
    expect(dashboard.year.label).toBe("2026-27");
    expect(dashboard.counts).toEqual({ receipts: 0, bills: 0, cheques: 0, unpaidBills: 0 });

    // Opening balances carried through, and a year with nothing in it closes
    // exactly where it opened.
    expect(dashboard.annexure10.totals.openingPaise).toBe(rupeesToPaise(2154));
    expect(dashboard.annexure10.totals.closingPaise).toBe(rupeesToPaise(2154));
    expect(dashboard.yearEnd.bankPaise).toBe(rupeesToPaise(2154));
  });

  it("produces every report without a single transaction entered", async () => {
    const year = await prisma.financialYear.findFirstOrThrow();
    const accounts = new AccountsService(prisma, year.id);

    // A brand-new school opening the reports before entering anything must not
    // meet a crash.
    const rojmel = await accounts.getRojmel();
    expect(rojmel.pages.length).toBeGreaterThan(0);
    expect(rojmel.blocks.every((block) => block.isNil)).toBe(true);

    expect(await accounts.getChequeRegister()).toEqual([]);
    expect(await accounts.getBillRegister()).toEqual([]);
    expect(await accounts.getVouchers()).toEqual([]);
    expect(await accounts.getPatrakD()).toEqual([]);
    expect((await accounts.getLedgers()).length).toBe(DEFAULT_GRANT_HEADS.length);
    expect((await accounts.getAnnexure9()).computedPassbookPaise).toBe(rupeesToPaise(2154));
  });

  it("reports no validation errors on an untouched year", async () => {
    const year = await prisma.financialYear.findFirstOrThrow();
    const issues = await new AccountsService(prisma, year.id).getValidation();
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
