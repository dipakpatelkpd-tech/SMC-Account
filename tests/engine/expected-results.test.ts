/**
 * The acceptance test for the engine.
 *
 * SPEC section 8 and CLAUDE.md: "Automated tests must reproduce every number in
 * expected_results of the sample JSON before a report is considered done." This
 * file asserts every one of them, driven from the sample data rather than from
 * hand-copied constants, so the oracle and the test cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "../../src/lib/money.js";
import {
  annexure9,
  annexure10,
  balancesByDate,
  chequeAmount,
  ledger,
  yearEndBalance,
} from "../../src/engine/index.js";
import { expected, sampleBook, sampleData } from "../fixtures/sample-book.js";

const book = sampleBook();

describe("પરિશિષ્ટ ૧૦ - annexure 10", () => {
  const report = annexure10(book);

  it("has one row per grant head, in print order", () => {
    expect(report.rows.map((row) => row.headCode)).toEqual(
      expected.annexure_10_rows.map((row) => row.grant_head),
    );
  });

  it.each(expected.annexure_10_rows)("reproduces every column for $grant_head", (row) => {
    const actual = report.rows.find((candidate) => candidate.headCode === row.grant_head);
    expect(actual, `no row for ${row.grant_head}`).toBeDefined();
    expect(actual!.openingPaise).toBe(rupeesToPaise(row.opening));
    expect(actual!.receivedPaise).toBe(rupeesToPaise(row.received));
    expect(actual!.totalPaise).toBe(rupeesToPaise(row.total));
    expect(actual!.spentPaise).toBe(rupeesToPaise(row.spent));
    expect(actual!.returnedPaise).toBe(rupeesToPaise(row.returned));
    expect(actual!.totalOutPaise).toBe(rupeesToPaise(row.total_out));
    expect(actual!.closingPaise).toBe(rupeesToPaise(row.closing));
  });

  it("reproduces the કુલ total row", () => {
    const totals = expected.annexure_10_totals;
    expect(report.totals.openingPaise).toBe(rupeesToPaise(totals.opening));
    expect(report.totals.receivedPaise).toBe(rupeesToPaise(totals.received));
    expect(report.totals.totalPaise).toBe(rupeesToPaise(totals.total));
    expect(report.totals.spentPaise).toBe(rupeesToPaise(totals.spent));
    expect(report.totals.returnedPaise).toBe(rupeesToPaise(totals.returned));
    expect(report.totals.totalOutPaise).toBe(rupeesToPaise(totals.total_out));
    expect(report.totals.closingPaise).toBe(rupeesToPaise(totals.closing));
  });

  it("prints ખર્ચ 39763, not the 36763 in the client's own annexure", () => {
    // SPEC 9.2: the client typed the cleanliness grant's ખર્ચ as 12000 instead of
    // 15000, so their ખર્ચ column totals 36763. Every figure here is computed.
    const swachhata = report.rows.find((row) => row.headCode === "SWACHHATA");
    expect(swachhata!.spentPaise).toBe(rupeesToPaise(15000));
    expect(report.totals.spentPaise).toBe(rupeesToPaise(39763));
  });

  it("satisfies Opening + Received − Spent − Returned = Closing", () => {
    for (const row of report.rows) {
      expect(row.openingPaise + row.receivedPaise - row.spentPaise - row.returnedPaise).toBe(
        row.closingPaise,
      );
    }
  });
});

describe("cash-book balances after every date", () => {
  const balances = balancesByDate(book);
  const byDate = new Map(balances.map((balance) => [balance.date, balance]));
  const expectedDates = Object.entries(expected.closing_balance_after_each_cashbook_date);

  it("has exactly the 17 cash-book dates of the sample year", () => {
    expect(balances.map((balance) => balance.date)).toEqual(
      expectedDates.map(([date]) => date).sort(),
    );
  });

  it.each(expectedDates)("matches bank and cash after %s", (date, balance) => {
    const actual = byDate.get(date);
    expect(actual, `no balance computed for ${date}`).toBeDefined();
    expect(actual!.bankPaise).toBe(rupeesToPaise(balance.bank));
    expect(actual!.cashPaise).toBe(rupeesToPaise(balance.cash));
  });

  it("returns cash to zero after every date, as the reimbursement round-trip does", () => {
    for (const balance of balances) expect(balance.cashPaise).toBe(0);
  });

  it("closes the year at 154.00 in the bank and nothing in hand", () => {
    const yearEnd = yearEndBalance(book);
    expect(yearEnd.bankPaise).toBe(rupeesToPaise(expected.year_end.bank));
    expect(yearEnd.cashPaise).toBe(rupeesToPaise(expected.year_end.cash));
    expect(yearEnd.totalPaise).toBe(rupeesToPaise(expected.year_end.total));
  });
});

describe("cheque amounts", () => {
  it.each(
    // Drawn from the sample file so the expectations cannot be typed wrong here.
    sampleData.cheques.map((cheque) => [cheque.cheque_no, cheque.amount] as const),
  )("cheque %i is worth %i rupees", (chequeNo, amount) => {
    const cheque = book.cheques.find((candidate) => candidate.chequeNo === chequeNo);
    expect(cheque, `no cheque ${chequeNo}`).toBeDefined();
    expect(chequeAmount(cheque!)).toBe(rupeesToPaise(amount));
  });

  it("computes a reimbursement's amount from its bills, never from a stored figure", () => {
    // Cheque 103 pays the 21 bills of voucher 1.
    const cheque = book.cheques.find((candidate) => candidate.chequeNo === 103)!;
    expect(cheque.bills).toHaveLength(21);
    const fromBills = cheque.bills.reduce(
      (total, bill) => total + bill.amountPaise - bill.deductionPaise,
      0,
    );
    expect(chequeAmount(cheque)).toBe(fromBills);
    expect(chequeAmount(cheque)).toBe(rupeesToPaise(10500));
  });
});

describe("ખાતાવહી - ledger closing rows", () => {
  // The three the spec calls out by name (SPEC section 8).
  it.each([
    ["SWACHHATA", 15000, 15000, 0],
    ["INTEREST", 2553, 2399, 154],
    ["CIVIL", 18061, 18061, 0],
  ])("%s closes at credit %i, debit %i, balance %i", (headCode, credit, debit, balance) => {
    const account = ledger(book, headCode as string);
    expect(account.totalCreditPaise).toBe(rupeesToPaise(credit as number));
    expect(account.totalDebitPaise).toBe(rupeesToPaise(debit as number));
    expect(account.closingPaise).toBe(rupeesToPaise(balance as number));
  });

  it("agrees with annexure 10 for every head", () => {
    const report = annexure10(book);
    for (const row of report.rows) {
      const account = ledger(book, row.headCode);
      expect(account.closingPaise, `${row.headCode} ledger vs annexure 10`).toBe(row.closingPaise);
      // Σ credits is opening + receipts; Σ debits is spending + returns.
      expect(account.totalCreditPaise).toBe(row.totalPaise);
      expect(account.totalDebitPaise).toBe(row.totalOutPaise);
    }
  });

  it("keeps rows in date order with the opening balance first", () => {
    const account = ledger(book, "SWACHHATA");
    expect(account.rows[0]!.descriptionGu).toBe("શ્રી ઉઘડતી સિલક");
    const dates = account.rows.map((row) => row.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("describes only its own head's share of a multi-head cheque", () => {
    // Cheque 103 spans four heads. The entry-festival ledger must describe the
    // entry-festival kit, not the cheque's whole four-head purpose line - which
    // is how the reference ખાતાવહી prints it.
    const praveshotsav = ledger(book, "PRAVESHOTSAV");
    const row = praveshotsav.rows.find((candidate) => candidate.date === "2025-06-09")!;
    expect(row.descriptionGu).toContain("પ્રવેશોત્સવ કીટ");
    expect(row.descriptionGu).not.toContain("સ્વચ્છતા");

    const swachhata = ledger(book, "SWACHHATA");
    const sameCheque = swachhata.rows.find((candidate) => candidate.date === "2025-06-09")!;
    expect(sameCheque.descriptionGu).toContain("સ્વચ્છતા");
    expect(sameCheque.descriptionGu).not.toContain("પ્રવેશોત્સવ");
  });

  it("keeps the grant-return wording on a return row", () => {
    const interest = ledger(book, "INTEREST");
    const returnRow = interest.rows.find((row) => row.debitPaise > 0)!;
    expect(returnRow.descriptionGu).toBe("બચત ગ્રાન્ટ પરત");
  });

  it("carries the running balance into જમા બાકી while it is positive", () => {
    const account = ledger(book, "INTEREST");
    const last = account.rows[account.rows.length - 1]!;
    expect(last.creditBalancePaise).toBe(rupeesToPaise(154));
    expect(last.debitBalancePaise).toBe(0);
  });
});

describe("પરિશિષ્ટ ૯ - bank reconciliation", () => {
  const report = annexure9(book);

  it("computes 154 + 0 + 0 − 0 − 0 = 154", () => {
    expect(report.cashbookBankPaise).toBe(rupeesToPaise(154));
    expect(report.subtotalPaise).toBe(rupeesToPaise(154));
    expect(report.deductionsPaise).toBe(0);
    expect(report.computedPassbookPaise).toBe(rupeesToPaise(154));
  });

  it("agrees with the passbook figure the school entered", () => {
    expect(report.enteredPassbookPaise).toBe(
      rupeesToPaise(sampleData.year_end_bank_reconciliation.passbook_balance_on_31_03_2026),
    );
    expect(report.matches).toBe(true);
  });

  it("computes the passbook line instead of copying the cash-book balance", () => {
    // SPEC 9.9: the client's Excel copies A into the last line, which makes the
    // statement reconcile by construction. Give it a real B and the two must
    // differ - proving the figure is computed.
    const withUncashed = {
      ...book,
      reconciliation: { ...book.reconciliation!, chequesIssuedNotCashedPaise: rupeesToPaise(500) },
    };
    const report = annexure9(withUncashed);
    expect(report.computedPassbookPaise).toBe(rupeesToPaise(654));
    expect(report.computedPassbookPaise).not.toBe(report.cashbookBankPaise);
    expect(report.matches).toBe(false);
  });
});
