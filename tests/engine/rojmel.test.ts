/**
 * રોજમેળ - the cash book (SPEC 6.1).
 *
 * The rojmel is the one report that can look right and be wrong: its footers
 * are three interlocking sums, and the client's own page 15 is out by 1,646
 * because a cash line was copied from the wrong page and a hand-typed 0 hid it
 * (SPEC 9.1). So the tests check the identities, not the appearance.
 */
import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "../../src/lib/money.js";
import {
  balancesByDate,
  buildRojmel,
  ledger,
  pageResolver,
  ROWS_PER_PAGE,
  yearEndBalance,
} from "../../src/engine/index.js";
import { expected, sampleBook } from "../fixtures/sample-book.js";

const book = sampleBook();
const rojmel = buildRojmel(book);

describe("block structure", () => {
  it("covers the whole year without a gap or an overlap", () => {
    expect(rojmel.blocks.length).toBeGreaterThan(0);
    expect(rojmel.blocks[0]!.fromDate).toBe(book.year.startDate);
    expect(rojmel.blocks[rojmel.blocks.length - 1]!.toDate).toBe(book.year.endDate);

    for (let index = 1; index < rojmel.blocks.length; index += 1) {
      const previous = rojmel.blocks[index - 1]!;
      const current = rojmel.blocks[index]!;
      // Two vouchers on one date are two blocks of that same date, one after the other.
      const sameDateVoucher = !current.isNil && !previous.isNil && current.fromDate === previous.toDate;
      expect(
        sameDateVoucher || current.fromDate > previous.toDate,
        `${current.fromDate} after ${previous.toDate}`,
      ).toBe(true);
    }
  });

  it("has one block per voucher on each cash-book date, plus nil blocks for the gaps", () => {
    const active = rojmel.blocks.filter((block) => !block.isNil).map((block) => block.fromDate);
    expect([...new Set(active)]).toEqual(Object.keys(expected.closing_balance_after_each_cashbook_date).sort());
    // 03/03/2026 has two vouchers, so two blocks.
    expect(active.filter((date) => date === "2026-03-03")).toHaveLength(2);
    expect(new Set(rojmel.blocks.map((block) => block.id)).size).toBe(rojmel.blocks.length);
  });

  it("gives each voucher of a date its own block, opening where the last one closed", () => {
    const [first, second] = rojmel.blocks.filter((block) => block.fromDate === "2026-03-03");
    // The voucher number is the first word of the cheque line's reference ("6 26/02/2026").
    const voucherOf = (block: typeof first): string => block!.paymentLines[0]!.referenceText.split(" ")[0]!;
    expect(voucherOf(first)).toBe("6");
    expect(voucherOf(second)).toBe("7");
    expect(second!.id).toBe("2026-03-03#2");
    expect(second!.openingBankPaise).toBe(first!.closingBankPaise);
    expect(second!.openingCashPaise).toBe(first!.closingCashPaise);
  });

  it("prints કોઈ નાણાંકીય ખર્ચ કરેલ નથી in a nil block", () => {
    const nil = rojmel.blocks.find((block) => block.isNil)!;
    expect(nil.paymentLines[0]!.descriptionGu).toBe("કોઈ નાણાંકીય ખર્ચ કરેલ નથી");
    expect(nil.spentTotalPaise).toBe(0);
    expect(nil.closingCashPaise).toBe(nil.openingCashPaise);
    expect(nil.closingBankPaise).toBe(nil.openingBankPaise);
  });

  it("never lets a nil block span two months", () => {
    for (const block of rojmel.blocks.filter((candidate) => candidate.isNil)) {
      expect(block.fromDate.slice(0, 7)).toBe(block.toDate.slice(0, 7));
    }
  });
});

describe("the three footer rows", () => {
  it("balances every block: ખર્ચખાતે + બંધ સિલક = the receipt totals", () => {
    for (const block of rojmel.blocks) {
      const label = `block ${block.fromDate}`;
      expect(block.spentCashPaise + block.closingCashPaise, `${label} cash`).toBe(
        block.receiptTotalCashPaise,
      );
      expect(block.spentBankPaise + block.closingBankPaise, `${label} bank`).toBe(
        block.receiptTotalBankPaise,
      );
    }
  });

  it("carries each block's closing into the next block's opening", () => {
    for (let index = 1; index < rojmel.blocks.length; index += 1) {
      const previous = rojmel.blocks[index - 1]!;
      const current = rojmel.blocks[index]!;
      expect(current.openingCashPaise, `${current.fromDate} cash`).toBe(previous.closingCashPaise);
      expect(current.openingBankPaise, `${current.fromDate} bank`).toBe(previous.closingBankPaise);
    }
  });

  it("counts a reimbursement on both sides of ખર્ચખાતે, and still balances", () => {
    // Cheque 106 on 20/12/2025: 1,700 out of the bank, 1,700 paid in cash to
    // the shopkeepers. The client's page 9 prints ખર્ચખાતે 1700 / 1700 / 3400.
    const block = rojmel.blocks.find((candidate) => candidate.fromDate === "2025-12-20")!;
    expect(block.spentBankPaise).toBe(rupeesToPaise(1700));
    expect(block.spentCashPaise).toBe(rupeesToPaise(1700));
    expect(block.spentTotalPaise).toBe(rupeesToPaise(3400));
    // Cash still returns to zero, which is the point of the round trip.
    expect(block.closingCashPaise).toBe(0);
  });
});

describe("agreement with the rest of the engine", () => {
  it("closes each transaction date exactly as balancesByDate does", () => {
    const byDate = new Map(balancesByDate(book).map((balance) => [balance.date, balance]));
    // The last block of each date closes the day.
    const lastOfDate = new Map(rojmel.blocks.filter((candidate) => !candidate.isNil).map((block) => [block.fromDate, block]));
    for (const block of lastOfDate.values()) {
      const balance = byDate.get(block.fromDate);
      expect(balance, `no balance for ${block.fromDate}`).toBeDefined();
      expect(block.closingBankPaise, `${block.fromDate} bank`).toBe(balance!.bankPaise);
      expect(block.closingCashPaise, `${block.fromDate} cash`).toBe(balance!.cashPaise);
    }
  });

  it("ends the year at the same 154.00", () => {
    const last = rojmel.blocks[rojmel.blocks.length - 1]!;
    expect(last.closingBankPaise).toBe(rupeesToPaise(expected.year_end.bank));
    expect(last.closingCashPaise).toBe(rupeesToPaise(expected.year_end.cash));
    expect(last.closingBankPaise).toBe(yearEndBalance(book).bankPaise);
  });

  it("never prints a negative closing, the way the client's page 15 does", () => {
    for (const block of rojmel.blocks) {
      expect(block.closingBankPaise, `block ${block.fromDate}`).toBeGreaterThanOrEqual(0);
      expect(block.closingCashPaise, `block ${block.fromDate}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("pagination", () => {
  it("never splits a block across pages", () => {
    const paged = rojmel.pages.flatMap((page) => page.blocks);
    expect(paged).toHaveLength(rojmel.blocks.length);
    expect(paged.map((block) => block.fromDate)).toEqual(
      rojmel.blocks.map((block) => block.fromDate),
    );
  });

  it("keeps each page within its row capacity", () => {
    for (const page of rojmel.pages) {
      const rows = page.blocks.reduce((total, block) => total + block.rowCount, 0);
      // A single block larger than a page is allowed to exceed it; two are not.
      if (page.blocks.length > 1) expect(rows, `page ${page.pageNo}`).toBeLessThanOrEqual(ROWS_PER_PAGE);
    }
  });

  it("numbers pages from 1 without a gap", () => {
    expect(rojmel.pages.map((page) => page.pageNo)).toEqual(
      rojmel.pages.map((_, index) => index + 1),
    );
  });

  it("is deterministic - the same book gives the same pages", () => {
    const again = buildRojmel(sampleBook());
    expect(again.pages.map((page) => page.blocks.map((block) => block.fromDate))).toEqual(
      rojmel.pages.map((page) => page.blocks.map((block) => block.fromDate)),
    );
  });
});

describe("page numbers for the ખાતાવહી", () => {
  const pages = pageResolver(rojmel);

  it("gives every receipt and cheque a page", () => {
    for (const receipt of book.receipts) {
      expect(pages.receiptPage(receipt.id), `receipt ${receipt.id}`).not.toBeNull();
    }
    for (const cheque of book.cheques) {
      expect(pages.chequePage(cheque.chequeNo), `cheque ${cheque.chequeNo}`).not.toBeNull();
    }
  });

  it("fills in the ledger's રોજમેળ પાનું column", () => {
    // Without a resolver the column is blank; with one, every row has a page.
    const withoutPages = ledger(book, "SWACHHATA");
    expect(withoutPages.rows.every((row) => row.rojmelPage === null)).toBe(true);

    const withPages = ledger(book, "SWACHHATA", { pages });
    expect(withPages.rows.every((row) => row.rojmelPage !== null)).toBe(true);
  });

  it("puts a later entry on a page at or after an earlier one", () => {
    const withPages = ledger(book, "SWACHHATA", { pages });
    const numbers = withPages.rows.map((row) => row.rojmelPage!);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  });

  it("opens on page 1", () => {
    expect(pages.openingPage()).toBe(1);
    expect(pages.chequePage(103)).toBeGreaterThan(1);
  });
});

describe("the closing sentence", () => {
  it("states the year-end balance", () => {
    expect(rojmel.closingSentenceGu).toContain("31/03/2026");
    expect(rojmel.closingSentenceGu).toContain("154");
    expect(rojmel.closingSentenceGu).toContain(book.school.nameGu);
  });
});

describe("the nil-block rule is a setting, because SPEC 11.4 is open", () => {
  it("can be switched off, leaving only dates with transactions", () => {
    const bare = buildRojmel(book, { nilBlocks: "none" });
    expect(bare.blocks.every((block) => !block.isNil)).toBe(true);
    expect(new Set(bare.blocks.map((block) => block.fromDate)).size).toBe(
      Object.keys(expected.closing_balance_after_each_cashbook_date).length,
    );
    // The year still ends in the same place.
    expect(bare.blocks[bare.blocks.length - 1]!.closingBankPaise).toBe(rupeesToPaise(154));
  });
});

describe("the આવક side", () => {
  it("leaves a blank row after the opening balance and after the receipts", async () => {
    const { rojmelBlockRows } = await import("../../src/shared/rojmel-rows.js");
    const block = rojmel.blocks.find((candidate) => candidate.receiptLines.some((line) => line.source.kind === "receipt"))!;
    const left = rojmelBlockRows(block).map((row) => row.left?.descriptionGu ?? null);
    expect(left[0]).toBe("શ્રી ઉઘડતી સિલક");
    expect(left[1]).toBeNull();
    const receipts = block.receiptLines.filter((line) => line.source.kind === "receipt").length;
    for (let index = 2; index < 2 + receipts; index += 1) expect(left[index]).not.toBeNull();
    expect(left[2 + receipts]).toBeNull();
  });
});

describe("one block per cheque", () => {
  it("keeps a cheque's sub-vouchers (1/1, 1/2 ...) together in its one block", () => {
    const blocks = rojmel.blocks.filter((block) => block.paymentLines.some((line) => line.chequeText.startsWith("103")));
    expect(blocks).toHaveLength(1);
    const subVouchers = blocks[0]!.paymentLines.filter((line) => /^1\/\d+ /.test(line.referenceText));
    expect(subVouchers.length).toBe(21);
  });

  it("splits two cheques of the same date into two blocks, even under one voucher number", () => {
    const book2 = sampleBook();
    const second = book2.cheques.find((cheque) => cheque.chequeNo === 109)!;
    const first = book2.cheques.find((cheque) => cheque.chequeNo === 108)!;
    second.voucherNo = first.voucherNo;
    const blocks = buildRojmel(book2).blocks.filter((block) => block.fromDate === second.cashbookDate);
    expect(blocks.map((block) => block.paymentLines[0]!.chequeText.split(" ")[0])).toEqual(["108", "109"]);
  });

  it("prints the block's date once: a cheque of the same day shows only its number", () => {
    const block = rojmel.blocks.find((candidate) => candidate.paymentLines.some((line) => line.chequeText.startsWith("103")))!;
    const chequeLine = block.paymentLines[0]!;
    expect(chequeLine.chequeText).toBe("103");
    expect(chequeLine.referenceText).toBe("1");
    // A cheque written on another day keeps its own date beside its number.
    const later = rojmel.blocks.find((candidate) => candidate.id === "2026-03-03")!;
    expect(later.paymentLines[0]!.chequeText).toBe("108 26/02/2026");
  });
});
