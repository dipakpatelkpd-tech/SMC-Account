/**
 * SPEC section 7 validation.
 *
 * The sample year is clean apart from bills dated in the previous year, which
 * the spec expects. Each rule is then proved by deliberately breaking a copy of
 * the book - a rule that never fires is a rule nobody can trust.
 */
import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "../../src/lib/money.js";
import { validate, type YearBook } from "../../src/engine/index.js";
import { sampleBook } from "../fixtures/sample-book.js";

const book = sampleBook();

/** A deep-enough copy that a test can break one thing without affecting others. */
function copy(book: YearBook): YearBook {
  return {
    ...book,
    opening: new Map(book.opening),
    receipts: book.receipts.map((receipt) => ({ ...receipt })),
    bills: book.bills.map((bill) => ({ ...bill })),
    cheques: book.cheques.map((cheque) => ({
      ...cheque,
      bills: cheque.bills.map((bill) => ({ ...bill })),
      typedAllocation: cheque.typedAllocation.map((row) => ({ ...row })),
    })),
    reconciliation: book.reconciliation ? { ...book.reconciliation } : null,
  };
}

function codes(result: ReturnType<typeof validate>): string[] {
  return result.issues.map((issue) => issue.code);
}

describe("the sample year", () => {
  const result = validate(book);

  it("has no errors", () => {
    expect(result.errors, JSON.stringify(result.errors, null, 2)).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("warns only about bills dated before the year, which the spec expects", () => {
    // Voucher 1 pays 2024-25 bills (SPEC 4.4), so these warnings are correct.
    const unexpected = result.warnings.filter((issue) => issue.code !== "bill_date_outside_year");
    expect(unexpected, JSON.stringify(unexpected, null, 2)).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("does not warn about cheque or voucher gaps - both run consecutively", () => {
    expect(codes(result)).not.toContain("cheque_no_gap");
    expect(codes(result)).not.toContain("voucher_no_gap");
  });
});

describe("errors", () => {
  it("catches a deduction larger than the bill", () => {
    const broken = copy(book);
    broken.bills[0]!.deductionPaise = rupeesToPaise(99999);
    expect(codes(validate(broken))).toContain("deduction_exceeds_amount");
    expect(validate(broken).ok).toBe(false);
  });

  it("catches a duplicate cheque number", () => {
    const broken = copy(book);
    broken.cheques[1]!.chequeNo = broken.cheques[0]!.chequeNo;
    expect(codes(validate(broken))).toContain("duplicate_cheque_no");
  });

  it("catches a duplicate bill number inside one voucher", () => {
    const broken = copy(book);
    const first = broken.bills.find((bill) => bill.billNo !== null)!;
    const second = broken.bills.find(
      (bill) => bill.billNo !== null && bill.voucherNo === first.voucherNo && bill.id !== first.id,
    )!;
    second.billNo = first.billNo;
    expect(codes(validate(broken))).toContain("duplicate_bill_no");
  });

  it("catches the bank going below zero", () => {
    const broken = copy(book);
    // Remove every receipt; the first cheque then overdraws the opening balance.
    broken.receipts = [];
    expect(codes(validate(broken))).toContain("bank_overdrawn");
    expect(validate(broken).ok).toBe(false);
  });
});

describe("warnings", () => {
  it("warns when a head spends more than it holds", () => {
    const broken = copy(book);
    broken.opening.set("BALMELO", { bankPaise: rupeesToPaise(0), cashPaise: rupeesToPaise(0) });
    broken.receipts = broken.receipts.filter((receipt) => receipt.headCode !== "BALMELO");
    // Cheque 105 still spends 1,100 of a head that now never received anything.
    expect(codes(validate(broken))).toContain("head_overdrawn");
  });

  it("warns about a gap in the cheque numbers", () => {
    const broken = copy(book);
    broken.cheques[3]!.chequeNo = 200;
    expect(codes(validate(broken))).toContain("cheque_no_gap");
  });

  it("warns when a cash-book date precedes the cheque date", () => {
    const broken = copy(book);
    broken.cheques[0]!.cashbookDate = "2025-01-01";
    expect(codes(validate(broken))).toContain("cashbook_before_cheque_date");
  });

  it("warns when a cheque is encashed before it was written", () => {
    const broken = copy(book);
    broken.cheques[0]!.cashedDate = "2025-01-01";
    expect(codes(validate(broken))).toContain("cashed_before_cheque_date");
  });

  it("warns about bills that no cheque has paid", () => {
    const broken = copy(book);
    broken.bills[0]!.chequeNo = null;
    expect(codes(validate(broken))).toContain("bills_without_cheque");
  });

  it("warns when the reconciliation does not reach the entered passbook figure", () => {
    const broken = copy(book);
    broken.reconciliation!.passbookBalancePaise = rupeesToPaise(9999);
    expect(codes(validate(broken))).toContain("reconciliation_mismatch");
    // A mismatch is a warning, not an error: the report still has to print.
    expect(validate(broken).ok).toBe(true);
  });
});

describe("every issue is reportable to a Gujarati-speaking user", () => {
  it("carries a Gujarati message and an English detail", () => {
    const broken = copy(book);
    broken.bills[0]!.deductionPaise = rupeesToPaise(99999);
    broken.cheques[0]!.cashedDate = "2025-01-01";

    const result = validate(broken);
    expect(result.issues.length).toBeGreaterThan(0);
    for (const issue of result.issues) {
      expect(issue.messageGu.length).toBeGreaterThan(0);
      expect(issue.detail.length).toBeGreaterThan(0);
      expect(issue.code).toMatch(/^[a-z_]+$/);
    }
  });
});
