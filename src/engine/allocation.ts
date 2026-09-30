/**
 * How much of a cheque belongs to each grant head.
 *
 * This is the single place that answers it, and every other report - Annexure 10,
 * the ledger, પત્રક-D, the grant register - goes through it. That is deliberate:
 * the client's workbook retypes this split into each register by hand, which is
 * where several of the errors in SPEC section 9 come from.
 *
 * The rule (CLAUDE.md): a reimbursement or direct cheque's split is COMPUTED from
 * its linked bills. Only a grant return carries a typed split, because it has no
 * bills to compute from.
 */
import { add, paise, sum, type Paise, ZERO } from "../lib/money.js";
import { isAllocationComputed } from "../lib/types.js";
import type { BookBill, BookCheque, YearBook } from "./types.js";

/** A bill's payable amount: gross less any deduction. Never stored (CLAUDE.md). */
export function billNet(bill: BookBill): Paise {
  return paise(bill.amountPaise - bill.deductionPaise);
}

/**
 * The cheque's split by grant head code.
 *
 * Returns a Map so callers cannot accidentally depend on row order; the reports
 * that print a breakdown sort by the head's print order themselves.
 */
export function chequeAllocation(cheque: BookCheque): Map<string, Paise> {
  const allocation = new Map<string, Paise>();

  if (isAllocationComputed(cheque.type)) {
    for (const bill of cheque.bills) {
      allocation.set(bill.headCode, add(allocation.get(bill.headCode) ?? ZERO, billNet(bill)));
    }
  } else {
    for (const row of cheque.typedAllocation) {
      allocation.set(row.headCode, add(allocation.get(row.headCode) ?? ZERO, row.amountPaise));
    }
  }

  return allocation;
}

/** The cheque's face value = the total of its allocation. Never stored. */
export function chequeAmount(cheque: BookCheque): Paise {
  return sum([...chequeAllocation(cheque).values()]);
}

/** Every cheque that takes money out as an expense (not a grant return). */
export function spendingCheques(book: YearBook): BookCheque[] {
  return book.cheques.filter((cheque) => cheque.type !== "GRANT_RETURN");
}

/** Every cheque that sends unspent grant back to the CRC coordinator. */
export function returnCheques(book: YearBook): BookCheque[] {
  return book.cheques.filter((cheque) => cheque.type === "GRANT_RETURN");
}

/** Σ receipts of each head, keyed by head code. */
export function receivedByHead(book: YearBook): Map<string, Paise> {
  const totals = new Map<string, Paise>();
  for (const receipt of book.receipts) {
    totals.set(receipt.headCode, add(totals.get(receipt.headCode) ?? ZERO, receipt.amountPaise));
  }
  return totals;
}

/** Σ spending allocated to each head (reimbursement and direct cheques). */
export function spentByHead(book: YearBook): Map<string, Paise> {
  return totalAllocation(spendingCheques(book));
}

/** Σ returned to the CRC from each head (grant-return cheques). */
export function returnedByHead(book: YearBook): Map<string, Paise> {
  return totalAllocation(returnCheques(book));
}

function totalAllocation(cheques: BookCheque[]): Map<string, Paise> {
  const totals = new Map<string, Paise>();
  for (const cheque of cheques) {
    for (const [headCode, amount] of chequeAllocation(cheque)) {
      totals.set(headCode, add(totals.get(headCode) ?? ZERO, amount));
    }
  }
  return totals;
}

/** A head's opening balance across bank and cash. */
export function openingOf(book: YearBook, headCode: string): Paise {
  const opening = book.opening.get(headCode);
  if (!opening) return ZERO;
  return add(opening.bankPaise, opening.cashPaise);
}

/**
 * The identity everything rests on, for one head:
 *   Opening + Received − Spent − Returned = Closing
 */
export function closingOf(book: YearBook, headCode: string): Paise {
  return paise(
    openingOf(book, headCode) +
      (receivedByHead(book).get(headCode) ?? ZERO) -
      (spentByHead(book).get(headCode) ?? ZERO) -
      (returnedByHead(book).get(headCode) ?? ZERO),
  );
}
