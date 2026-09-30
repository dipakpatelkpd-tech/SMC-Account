/**
 * The database path and the fixture path must agree.
 *
 * Every other engine test drives a YearBook built from the sample JSON, which
 * keeps them pure and fast. That is only safe if a book loaded from the database
 * produces the same numbers - otherwise the suite could be green while the real
 * application is wrong. This file is what closes that gap.
 *
 * Reports are compared rather than raw structures, because the two paths
 * legitimately differ in their record ids: the fixture keeps the sample file's
 * "R1"/"B1", the database uses its own primary keys.
 *
 * Requires a seeded database (npm run db:reset).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../src/lib/db.js";
import {
  annexure9,
  annexure10,
  balancesByDate,
  chequeAmount,
  grantRegister,
  ledger,
  loadYearBookByLabel,
  validate,
  type YearBook,
} from "../../src/engine/index.js";
import { sampleBook, sampleData } from "../fixtures/sample-book.js";

const prisma = createPrismaClient();
const fixture = sampleBook();
let loaded: YearBook;

beforeAll(async () => {
  const seeded = await prisma.financialYear.findFirst({
    where: { label: sampleData.financial_year.label },
    select: { id: true },
  });
  if (!seeded) {
    throw new Error(
      `No seeded financial year "${sampleData.financial_year.label}" in the database. ` +
        `Run "npm run db:reset" before the tests.`,
    );
  }
  loaded = await loadYearBookByLabel(prisma, sampleData.financial_year.label);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("a book loaded from the database", () => {
  it("carries the same facts as the sample file", () => {
    expect(loaded.school.diseCode).toBe(fixture.school.diseCode);
    expect(loaded.year.label).toBe(fixture.year.label);
    expect(loaded.year.startDate).toBe(fixture.year.startDate);
    expect(loaded.year.endDate).toBe(fixture.year.endDate);
    expect(loaded.heads.map((head) => head.code)).toEqual(fixture.heads.map((head) => head.code));
    expect(loaded.receipts).toHaveLength(fixture.receipts.length);
    expect(loaded.bills).toHaveLength(fixture.bills.length);
    expect(loaded.cheques).toHaveLength(fixture.cheques.length);
  });

  it("produces an identical annexure 10", () => {
    const fromDb = annexure10(loaded);
    const fromFixture = annexure10(fixture);
    expect(fromDb.rows).toEqual(fromFixture.rows);
    expect(fromDb.totals).toEqual(fromFixture.totals);
  });

  it("produces identical cash-book balances on every date", () => {
    expect(balancesByDate(loaded)).toEqual(balancesByDate(fixture));
  });

  it("produces identical cheque amounts", () => {
    for (const cheque of fixture.cheques) {
      const fromDb = loaded.cheques.find((candidate) => candidate.chequeNo === cheque.chequeNo);
      expect(fromDb, `cheque ${cheque.chequeNo} missing from the database`).toBeDefined();
      expect(chequeAmount(fromDb!)).toBe(chequeAmount(cheque));
    }
  });

  it("produces identical ledgers for every head", () => {
    for (const head of fixture.heads) {
      const fromDb = ledger(loaded, head.code);
      const fromFixture = ledger(fixture, head.code);
      expect(fromDb.totalCreditPaise, `${head.code} credits`).toBe(fromFixture.totalCreditPaise);
      expect(fromDb.totalDebitPaise, `${head.code} debits`).toBe(fromFixture.totalDebitPaise);
      expect(fromDb.closingPaise, `${head.code} closing`).toBe(fromFixture.closingPaise);
      expect(fromDb.rows.map((row) => [row.date, row.creditPaise, row.debitPaise])).toEqual(
        fromFixture.rows.map((row) => [row.date, row.creditPaise, row.debitPaise]),
      );
    }
  });

  it("produces an identical reconciliation", () => {
    expect(annexure9(loaded)).toEqual(annexure9(fixture));
  });

  it("attributes spending to receipts the same way", () => {
    // Ids differ between the two paths, so compare the attribution by position
    // in date order, which both paths sort identically.
    const fromDb = grantRegister(loaded).map((row) => [
      row.receipt.date,
      row.receipt.headCode,
      row.spentPaise,
      row.savingPaise,
    ]);
    const fromFixture = grantRegister(fixture).map((row) => [
      row.receipt.date,
      row.receipt.headCode,
      row.spentPaise,
      row.savingPaise,
    ]);
    expect(fromDb).toEqual(fromFixture);
  });

  it("raises the same validation issues", () => {
    expect(validate(loaded).issues.map((issue) => issue.code).sort()).toEqual(
      validate(fixture).issues.map((issue) => issue.code).sort(),
    );
  });
});
