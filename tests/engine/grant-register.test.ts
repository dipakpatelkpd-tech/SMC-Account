/**
 * The FIFO attribution behind ખર્ચેલ રકમ in the grant register (SPEC 6.3).
 *
 * The printed sample register is the oracle: every grant receipt comes out fully
 * spent, and every interest receipt fully unspent. That second half is the
 * interesting one - it only comes out right if a grant RETURN consumes balance
 * without counting as spending, and if the opening balance is consumed first.
 */
import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "../../src/lib/money.js";
import { grantRegister, spentPerReceipt } from "../../src/engine/index.js";
import { sampleBook } from "../fixtures/sample-book.js";

const book = sampleBook();

describe("ખર્ચેલ રકમ - how much of each receipt was spent", () => {
  const rows = grantRegister(book);

  it("has one row per receipt, in date order", () => {
    expect(rows).toHaveLength(book.receipts.length);
    const dates = rows.map((row) => row.receipt.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("shows every grant receipt as fully spent, બચત 0", () => {
    const grantRows = rows.filter((row) => row.receipt.headCode !== "INTEREST");
    expect(grantRows.length).toBeGreaterThan(0);
    for (const row of grantRows) {
      expect(row.spentPaise, `${row.receipt.headCode} ${row.receipt.date}`).toBe(
        row.receipt.amountPaise,
      );
      expect(row.savingPaise).toBe(0);
    }
  });

  it("shows every interest receipt as unspent, બચત = the full amount", () => {
    // The 2,399 interest return consumed only the OPENING interest balance, so
    // none of the four interest credits was ever spent.
    const interestRows = rows.filter((row) => row.receipt.headCode === "INTEREST");
    expect(interestRows).toHaveLength(4);
    for (const row of interestRows) {
      expect(row.spentPaise).toBe(0);
      expect(row.savingPaise).toBe(row.receipt.amountPaise);
    }
  });

  it("leaves the interest savings adding up to the year's closing balance", () => {
    const interestSaving = rows
      .filter((row) => row.receipt.headCode === "INTEREST")
      .reduce((total, row) => total + row.savingPaise, 0);
    expect(interestSaving).toBe(rupeesToPaise(154));
  });

  it("never attributes more to a receipt than the receipt was worth", () => {
    for (const row of rows) {
      expect(row.spentPaise).toBeLessThanOrEqual(row.receipt.amountPaise);
      expect(row.spentPaise).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the FIFO rule itself", () => {
  it("consumes the opening balance before any receipt", () => {
    // SWACHHATA opens at 9,000. Cheque 103 spends exactly 9,000 on 09/06, before
    // the first cleanliness receipt arrives on 24/06. That spending must land on
    // the opening balance, leaving both later receipts free to be spent by the
    // later cheques.
    const spent = spentPerReceipt(book);
    const firstSwachhataReceipt = book.receipts.find(
      (receipt) => receipt.headCode === "SWACHHATA" && receipt.date === "2025-06-24",
    )!;
    expect(spent.get(firstSwachhataReceipt.id)).toBe(rupeesToPaise(3000));
  });

  it("does not count a grant return as spending", () => {
    // CIVIL opens at 98 and receives 17,963. Cheque 107 RETURNS the 98, then
    // cheques 108 and 109 spend 6,000 and 11,963. If the return counted as
    // spending, the receipt would show 98 more than it should.
    const spent = spentPerReceipt(book);
    const civilReceipt = book.receipts.find((receipt) => receipt.headCode === "CIVIL")!;
    expect(spent.get(civilReceipt.id)).toBe(rupeesToPaise(17963));
    expect(civilReceipt.amountPaise).toBe(rupeesToPaise(17963));
  });

  it("applies outflows oldest first within a head", () => {
    // SWACHHATA: receipt of 24/06 is spent by cheque 104 on 02/07, and the
    // receipt of 18/03 by cheque 110 on 23/03. Swapping the order would still
    // total 6,000 but would attribute the wrong amounts, so check both.
    const spent = spentPerReceipt(book);
    for (const date of ["2025-06-24", "2026-03-18"]) {
      const receipt = book.receipts.find(
        (candidate) => candidate.headCode === "SWACHHATA" && candidate.date === date,
      )!;
      expect(spent.get(receipt.id), `swachhata receipt ${date}`).toBe(rupeesToPaise(3000));
    }
  });
});
