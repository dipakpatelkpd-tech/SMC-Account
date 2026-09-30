/**
 * The remaining four reports: cheque register, bill register, voucher print and
 * પત્રક-D (SPEC 6.4 to 6.7).
 *
 * These are mostly listings of stored facts, so the interesting parts are the
 * few figures that are NOT stored and the ordering rules that the client's
 * hand-typed workbook gets wrong:
 *
 *   - a cheque's amount and its bill-number range (SPEC 6.4)
 *   - a bill's net amount, and the fact that a grant return appears in the bill
 *     register with no bill number at all (SPEC 6.5)
 *   - a voucher's total, which must equal the cheque that paid it (SPEC 6.6)
 *   - પત્રક-D's one row per cheque AND grant head, not per cheque (SPEC 6.7)
 */
import { paise, sum, type Paise, ZERO } from "../lib/money.js";
import { billNet, chequeAllocation, chequeAmount } from "./allocation.js";
import type { BookBill, BookCheque, YearBook } from "./types.js";

// --------------------------------------------------------- cheque register

export interface ChequeRegisterRow {
  serial: number;
  chequeNo: number;
  chequeDate: string;
  voucherNo: number | null;
  /** "1/1 થી 1/21", or "3/1" for a single bill, or "" when there are none. */
  billRangeText: string;
  amountPaise: Paise;
  payeeGu: string;
  purposeGu: string;
  cashedDate: string | null;
  remarksGu: string | null;
}

/** ચેક રજીસ્ટર - one row per cheque, in cheque-number order (SPEC 6.4). */
export function chequeRegister(book: YearBook): ChequeRegisterRow[] {
  return [...book.cheques]
    .sort((a, b) => a.chequeNo - b.chequeNo)
    .map((cheque, index) => ({
      serial: index + 1,
      chequeNo: cheque.chequeNo,
      chequeDate: cheque.chequeDate,
      voucherNo: cheque.voucherNo,
      billRangeText: billRange(cheque),
      amountPaise: chequeAmount(cheque),
      payeeGu: cheque.payeeGu,
      purposeGu: cheque.purposeGu,
      cashedDate: cheque.cashedDate,
      remarksGu: cheque.remarksGu,
    }));
}

/**
 * The bill numbers a cheque covers, as the register prints them.
 *
 * Bills are ordered by the number after the slash, so 1/2 comes before 1/10 -
 * string order would put 1/10 first and make the range read "1/1 થી 1/9".
 */
function billRange(cheque: BookCheque): string {
  const numbered = cheque.bills
    .filter((bill) => bill.billNo !== null)
    .sort((a, b) => billSequence(a.billNo!) - billSequence(b.billNo!));

  if (numbered.length === 0) return "";
  if (numbered.length === 1) return numbered[0]!.billNo!;
  return `${numbered[0]!.billNo!} થી ${numbered[numbered.length - 1]!.billNo!}`;
}

function billSequence(billNo: string): number {
  const afterSlash = billNo.includes("/") ? billNo.slice(billNo.lastIndexOf("/") + 1) : billNo;
  const parsed = Number.parseInt(afterSlash, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ----------------------------------------------------------- bill register

export interface BillRegisterRow {
  serial: number;
  voucherNo: number;
  /** Printed only on the first row of each voucher, as the form does. */
  showVoucherNo: boolean;
  billNo: string | null;
  billDate: string;
  descriptionGu: string;
  vendorGu: string;
  amountPaise: Paise;
  deductionPaise: Paise;
  /** Computed: amount − deduction. Never stored. */
  netPaise: Paise;
  quantityGu: string | null;
  remarksGu: string | null;
  /** True for the grant-return row, which is not a bill at all. */
  isGrantReturn: boolean;
}

/**
 * બિલ રજીસ્ટર - every bill, plus a row for each grant return (SPEC 6.5).
 *
 * A grant return has no bill behind it, but the register still lists it so that
 * the voucher numbers run unbroken. The sample year has 42 rows: 41 bills and
 * one return.
 */
export function billRegister(book: YearBook): BillRegisterRow[] {
  interface Entry {
    voucherNo: number;
    sequence: number;
    row: Omit<BillRegisterRow, "serial" | "showVoucherNo">;
  }

  const entries: Entry[] = book.bills.map((bill) => ({
    voucherNo: bill.voucherNo,
    sequence: bill.billNo === null ? Number.MAX_SAFE_INTEGER : billSequence(bill.billNo),
    row: {
      voucherNo: bill.voucherNo,
      billNo: bill.billNo,
      billDate: bill.billDate,
      descriptionGu: bill.descriptionGu,
      vendorGu: bill.vendorGu,
      amountPaise: bill.amountPaise,
      deductionPaise: bill.deductionPaise,
      netPaise: billNet(bill),
      quantityGu: bill.quantityGu,
      remarksGu: bill.remarksGu,
      isGrantReturn: false,
    },
  }));

  for (const cheque of book.cheques) {
    if (cheque.type !== "GRANT_RETURN") continue;
    entries.push({
      voucherNo: cheque.voucherNo ?? 0,
      sequence: 0,
      row: {
        voucherNo: cheque.voucherNo ?? 0,
        billNo: null,
        billDate: cheque.chequeDate,
        descriptionGu: "બચત ગ્રાન્ટ પરત",
        vendorGu: cheque.payeeGu,
        amountPaise: chequeAmount(cheque),
        deductionPaise: ZERO,
        netPaise: chequeAmount(cheque),
        quantityGu: null,
        remarksGu: null,
        isGrantReturn: true,
      },
    });
  }

  entries.sort((a, b) =>
    a.voucherNo === b.voucherNo ? a.sequence - b.sequence : a.voucherNo - b.voucherNo,
  );

  let previousVoucher: number | null = null;
  return entries.map((entry, index) => {
    const showVoucherNo = entry.voucherNo !== previousVoucher;
    previousVoucher = entry.voucherNo;
    return { ...entry.row, serial: index + 1, showVoucherNo };
  });
}

// ---------------------------------------------------------- voucher print

export interface VoucherLine {
  serial: number;
  billNo: string | null;
  billDate: string;
  descriptionGu: string;
  vendorGu: string;
  amountPaise: Paise;
  remarksGu: string | null;
}

export interface Voucher {
  voucherNo: number;
  /** The cheque this voucher was paid by, when there is one. */
  chequeNo: number | null;
  chequeDate: string | null;
  payeeGu: string | null;
  lines: VoucherLine[];
  totalPaise: Paise;
  /**
   * The cheque's own amount. It must equal totalPaise - a voucher whose bills do
   * not add up to its cheque is the error the whole product exists to prevent.
   */
  chequeAmountPaise: Paise | null;
  balances: boolean;
}

/** વાઉચર - one page per voucher (SPEC 6.6). */
export function vouchers(book: YearBook): Voucher[] {
  const numbers = [...new Set(book.bills.map((bill) => bill.voucherNo))].sort((a, b) => a - b);
  const chequeByVoucher = new Map<number, BookCheque>();
  for (const cheque of book.cheques) {
    if (cheque.voucherNo !== null) chequeByVoucher.set(cheque.voucherNo, cheque);
  }

  return numbers.map((voucherNo) => {
    const bills = book.bills
      .filter((bill) => bill.voucherNo === voucherNo)
      .sort(byBillSequence);

    const cheque = chequeByVoucher.get(voucherNo) ?? null;
    const totalPaise = sum(bills.map(billNet));
    const chequeAmountPaise = cheque ? chequeAmount(cheque) : null;

    return {
      voucherNo,
      chequeNo: cheque?.chequeNo ?? null,
      chequeDate: cheque?.chequeDate ?? null,
      payeeGu: cheque?.payeeGu ?? null,
      lines: bills.map((bill, index) => ({
        serial: index + 1,
        billNo: bill.billNo,
        billDate: bill.billDate,
        descriptionGu: bill.descriptionGu,
        vendorGu: bill.vendorGu,
        amountPaise: billNet(bill),
        remarksGu: bill.remarksGu,
      })),
      totalPaise,
      chequeAmountPaise,
      balances: chequeAmountPaise === null || chequeAmountPaise === totalPaise,
    };
  });
}

function byBillSequence(a: BookBill, b: BookBill): number {
  const left = a.billNo === null ? Number.MAX_SAFE_INTEGER : billSequence(a.billNo);
  const right = b.billNo === null ? Number.MAX_SAFE_INTEGER : billSequence(b.billNo);
  return left - right;
}

// ---------------------------------------------------------------- પત્રક-D

export interface PatrakDRow {
  serial: number;
  chequeDate: string;
  chequeNo: number;
  /** Whose account the money went to - the payee. */
  payeeGu: string;
  /** The shop or party the bills came from, joined for this head. */
  partiesGu: string;
  headNameGu: string;
  amountPaise: Paise;
}

/**
 * પત્રક – D - the bank's spending broken down by cheque AND grant head.
 *
 * One row per (cheque, head) pair, not per cheque: a reimbursement covering four
 * heads produces four rows. That is the whole point of the statement - it shows
 * which head each rupee that left the bank belonged to.
 */
export function patrakD(book: YearBook): PatrakDRow[] {
  const nameByCode = new Map(book.heads.map((head) => [head.code, head.nameGu]));
  const order = new Map(book.heads.map((head, index) => [head.code, index]));

  const rows: Omit<PatrakDRow, "serial">[] = [];

  for (const cheque of [...book.cheques].sort((a, b) => a.chequeNo - b.chequeNo)) {
    const allocation = [...chequeAllocation(cheque).entries()].sort(
      (a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0),
    );

    for (const [code, amount] of allocation) {
      // The parties are the vendors of this head's bills within this cheque.
      const parties = [
        ...new Set(
          cheque.bills.filter((bill) => bill.headCode === code).map((bill) => bill.vendorGu),
        ),
      ];

      rows.push({
        chequeDate: cheque.chequeDate,
        chequeNo: cheque.chequeNo,
        payeeGu: cheque.payeeGu,
        partiesGu: parties.length > 0 ? parties.join(", ") : cheque.payeeGu,
        headNameGu: nameByCode.get(code) ?? code,
        amountPaise: amount,
      });
    }
  }

  return rows.map((row, index) => ({ ...row, serial: index + 1 }));
}

/** The total of પત્રક-D, which is everything that left the bank. */
export function patrakDTotal(book: YearBook): Paise {
  return paise(patrakD(book).reduce((total, row) => total + row.amountPaise, 0));
}
