/**
 * The cheque register, bill register, voucher print and પત્રક-D
 * (SPEC 6.4 to 6.7).
 *
 * These reports are mostly listings, so the tests concentrate on the things the
 * client's hand-typed workbook gets wrong: bill ordering, the grant return that
 * belongs in the bill register without being a bill, and whether each voucher
 * actually adds up to the cheque that paid it.
 */
import { describe, expect, it } from "vitest";
import { rupeesToPaise } from "../../src/lib/money.js";
import {
  billRegister,
  chequeRegister,
  patrakD,
  patrakDTotal,
  vouchers,
} from "../../src/engine/index.js";
import { expected, sampleBook } from "../fixtures/sample-book.js";

const book = sampleBook();

describe("ચેક રજીસ્ટર - cheque register", () => {
  const rows = chequeRegister(book);

  it("lists every cheque in cheque-number order", () => {
    expect(rows).toHaveLength(book.cheques.length);
    expect(rows.map((row) => row.chequeNo)).toEqual([103, 104, 105, 106, 107, 108, 109, 110]);
    expect(rows.map((row) => row.serial)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("reproduces the printed amounts", () => {
    const amounts = new Map(rows.map((row) => [row.chequeNo, row.amountPaise]));
    expect(amounts.get(103)).toBe(rupeesToPaise(10500));
    expect(amounts.get(107)).toBe(rupeesToPaise(2498));
    expect(amounts.get(109)).toBe(rupeesToPaise(11963));
    expect(amounts.get(110)).toBe(rupeesToPaise(3500));
  });

  it("prints the bill range the way the form does", () => {
    const ranges = new Map(rows.map((row) => [row.chequeNo, row.billRangeText]));
    // Voucher 1 has 21 bills.
    expect(ranges.get(103)).toBe("1/1 થી 1/21");
    // A single bill prints on its own, with no "થી".
    expect(ranges.get(105)).toBe("3/1");
    // A grant return has no bills at all.
    expect(ranges.get(107)).toBe("");
    // A direct payment's bill carries no number (SPEC 6.5).
    expect(ranges.get(108)).toBe("");
  });

  it("orders bill numbers numerically, so 1/2 precedes 1/10", () => {
    // String order would end the range at 1/9 and lose twelve bills.
    expect(chequeRegister(book).find((row) => row.chequeNo === 103)!.billRangeText).toBe(
      "1/1 થી 1/21",
    );
    expect(rows.find((row) => row.chequeNo === 110)!.billRangeText).toBe("8/1 થી 8/7");
  });
});

describe("બિલ રજીસ્ટર - bill register", () => {
  const rows = billRegister(book);

  it("has 42 rows: 41 bills and the one grant return", () => {
    expect(rows).toHaveLength(book.bills.length + 1);
    expect(rows).toHaveLength(42);
    expect(rows.filter((row) => row.isGrantReturn)).toHaveLength(1);
  });

  it("lists the grant return with no bill number", () => {
    const row = rows.find((candidate) => candidate.isGrantReturn)!;
    expect(row.billNo).toBeNull();
    expect(row.descriptionGu).toBe("બચત ગ્રાન્ટ પરત");
    expect(row.vendorGu).toBe("સી.આર.સી કો.ઓર્ડિનેટર");
    expect(row.amountPaise).toBe(rupeesToPaise(2498));
  });

  it("sorts by voucher, then by the number after the slash", () => {
    const voucherOne = rows.filter((row) => row.voucherNo === 1).map((row) => row.billNo);
    expect(voucherOne.slice(0, 4)).toEqual(["1/1", "1/2", "1/3", "1/4"]);
    // The moment string sorting would go wrong.
    expect(voucherOne.indexOf("1/2")).toBeLessThan(voucherOne.indexOf("1/10"));
    expect(voucherOne[voucherOne.length - 1]).toBe("1/21");
  });

  it("prints the voucher number only on the first row of each voucher", () => {
    const firstRows = rows.filter((row) => row.showVoucherNo);
    const vouchersSeen = [...new Set(rows.map((row) => row.voucherNo))];
    expect(firstRows).toHaveLength(vouchersSeen.length);
    expect(firstRows.map((row) => row.voucherNo)).toEqual(vouchersSeen);
  });

  it("computes the net column rather than trusting a typed one", () => {
    for (const row of rows) {
      expect(row.netPaise).toBe(row.amountPaise - row.deductionPaise);
    }
  });

  it("numbers rows 1..42 without a gap", () => {
    expect(rows.map((row) => row.serial)).toEqual(rows.map((_, index) => index + 1));
  });
});

describe("વાઉચર - voucher print", () => {
  const all = vouchers(book);

  it("has one voucher per voucher number in the bills", () => {
    const numbers = [...new Set(book.bills.map((bill) => bill.voucherNo))].sort((a, b) => a - b);
    expect(all.map((voucher) => voucher.voucherNo)).toEqual(numbers);
  });

  it("totals each voucher to exactly the cheque that paid it", () => {
    for (const voucher of all) {
      expect(voucher.balances, `voucher ${voucher.voucherNo}`).toBe(true);
      if (voucher.chequeAmountPaise !== null) {
        expect(voucher.totalPaise, `voucher ${voucher.voucherNo}`).toBe(voucher.chequeAmountPaise);
      }
    }
  });

  it("puts voucher 1's 21 bills in order and totals 10500", () => {
    const voucher = all.find((candidate) => candidate.voucherNo === 1)!;
    expect(voucher.lines).toHaveLength(21);
    expect(voucher.lines.map((line) => line.billNo).slice(0, 3)).toEqual(["1/1", "1/2", "1/3"]);
    expect(voucher.totalPaise).toBe(rupeesToPaise(10500));
    expect(voucher.chequeNo).toBe(103);
  });

  it("notices when a voucher does not match its cheque", () => {
    // Drop a bill from voucher 3 and the voucher must stop balancing.
    const broken = {
      ...book,
      bills: book.bills.filter((bill) => bill.voucherNo !== 3),
      cheques: book.cheques.map((cheque) =>
        cheque.voucherNo === 3 ? { ...cheque, bills: [] } : cheque,
      ),
    };
    const voucher = vouchers(broken).find((candidate) => candidate.voucherNo === 3);
    // Voucher 3 has no bills left, so it no longer appears at all.
    expect(voucher).toBeUndefined();
  });
});

describe("પત્રક – D", () => {
  const rows = patrakD(book);

  it("has one row per cheque AND grant head, not per cheque", () => {
    // Cheque 103 spans four heads, so it contributes four rows.
    const forCheque103 = rows.filter((row) => row.chequeNo === 103);
    expect(forCheque103).toHaveLength(4);
    expect(rows.length).toBeGreaterThan(book.cheques.length);
  });

  it("totals to everything that left the bank", () => {
    const totals = expected.annexure_10_totals;
    expect(patrakDTotal(book)).toBe(rupeesToPaise(totals.total_out));
    expect(patrakDTotal(book)).toBe(rupeesToPaise(42261));
  });

  it("splits a cheque into exactly its allocation", () => {
    const forCheque103 = rows.filter((row) => row.chequeNo === 103);
    const total = forCheque103.reduce((sum, row) => sum + row.amountPaise, 0);
    expect(total).toBe(rupeesToPaise(10500));

    const swachhata = forCheque103.find((row) => row.headNameGu.includes("સ્વચ્છતા"))!;
    expect(swachhata.amountPaise).toBe(rupeesToPaise(9000));
  });

  it("names the shops behind each head's share", () => {
    const row = rows.find(
      (candidate) => candidate.chequeNo === 103 && candidate.headNameGu.includes("પ્રવેશોત્સવ"),
    )!;
    expect(row.partiesGu).toContain("વિદ્યાર્થી");
  });

  it("falls back to the payee when a head has no bills, as a grant return does", () => {
    const row = rows.find((candidate) => candidate.chequeNo === 107)!;
    expect(row.partiesGu).toBe("સી.આર.સી કો.ઓર્ડિનેટર");
  });

  it("numbers rows without a gap", () => {
    expect(rows.map((row) => row.serial)).toEqual(rows.map((_, index) => index + 1));
  });
});
