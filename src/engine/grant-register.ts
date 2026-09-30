/**
 * ગ્રાન્ટ રજીસ્ટર - the receipts register (SPEC 6.3).
 *
 * One row per receipt. Every column but two is a stored fact; the two computed
 * ones are ખર્ચેલ રકમ (how much of this particular receipt was spent) and
 * બચત રહેલ ગ્રાન્ટ (what is left of it).
 *
 * Attributing spending to a particular receipt needs a rule, because money in a
 * bank account is fungible. The rule, per SPEC 6.3:
 *
 *   Per head, apply outflows in date order FIFO - against the opening balance
 *   first, then receipts in date order. Only SPENDING that lands on a receipt
 *   counts as ખર્ચેલ રકમ; a grant return consumes balance without being spending.
 *
 * On the sample year this reproduces the printed register exactly: every grant
 * receipt comes out fully spent, and every interest receipt fully unspent -
 * because the 2,399 interest return consumed only the opening interest balance.
 *
 * NOTE: still to be confirmed with the client (SPEC 11.10).
 */
import { paise, type Paise, ZERO } from "../lib/money.js";
import { chequeAllocation } from "./allocation.js";
import type { BookReceipt, GrantRegisterRow, YearBook } from "./types.js";

/** A source of money that outflows are drawn from, oldest first. */
interface Pool {
  /** The receipt this pool came from, or null for the opening balance. */
  receiptId: string | null;
  remaining: number;
}

interface Outflow {
  date: string;
  chequeNo: number;
  amount: number;
  isReturn: boolean;
}

/**
 * How much of each receipt was consumed by spending, keyed by receipt id.
 * Exposed separately from the register rows because પત્રક-D and any future
 * utilisation report need the same attribution.
 */
export function spentPerReceipt(book: YearBook): Map<string, Paise> {
  const spent = new Map<string, Paise>();

  for (const head of book.heads) {
    const pools = poolsFor(book, head.code);
    const outflows = outflowsFor(book, head.code);

    for (const outflow of outflows) {
      let unapplied = outflow.amount;

      for (const pool of pools) {
        if (unapplied === 0) break;
        if (pool.remaining === 0) continue;

        const taken = Math.min(pool.remaining, unapplied);
        pool.remaining -= taken;
        unapplied -= taken;

        // A return consumes balance but is not spending, so it never lands in
        // ખર્ચેલ રકમ. Neither does anything drawn from the opening balance.
        if (!outflow.isReturn && pool.receiptId !== null) {
          spent.set(pool.receiptId, paise((spent.get(pool.receiptId) ?? 0) + taken));
        }
      }

      // Anything left over means the head was overdrawn on that date. The engine
      // does not throw here - validation.ts reports it as a warning and the
      // register still prints, which is what an auditor needs to see.
    }
  }

  return spent;
}

export function grantRegister(book: YearBook): GrantRegisterRow[] {
  const spent = spentPerReceipt(book);
  const nameByCode = new Map(book.heads.map((head) => [head.code, head.nameGu]));

  return [...book.receipts]
    .sort(byDateThenId)
    .map((receipt) => {
      const spentPaise = spent.get(receipt.id) ?? ZERO;
      return {
        receipt,
        headNameGu: nameByCode.get(receipt.headCode) ?? receipt.headCode,
        spentPaise,
        savingPaise: paise(receipt.amountPaise - spentPaise),
      };
    });
}

/** Opening balance first, then this head's receipts oldest first. */
function poolsFor(book: YearBook, headCode: string): Pool[] {
  const opening = book.opening.get(headCode);
  const openingTotal = opening ? opening.bankPaise + opening.cashPaise : 0;

  const pools: Pool[] = [{ receiptId: null, remaining: openingTotal }];

  for (const receipt of book.receipts.filter((candidate) => candidate.headCode === headCode).sort(byDateThenId)) {
    pools.push({ receiptId: receipt.id, remaining: receipt.amountPaise });
  }

  return pools;
}

/** This head's share of every cheque, in cash-book date order. */
function outflowsFor(book: YearBook, headCode: string): Outflow[] {
  const outflows: Outflow[] = [];

  for (const cheque of book.cheques) {
    const share = chequeAllocation(cheque).get(headCode);
    if (share === undefined || share === 0) continue;
    outflows.push({
      date: cheque.cashbookDate,
      chequeNo: cheque.chequeNo,
      amount: share,
      isReturn: cheque.type === "GRANT_RETURN",
    });
  }

  return outflows.sort((a, b) =>
    a.date === b.date ? a.chequeNo - b.chequeNo : a.date < b.date ? -1 : 1,
  );
}

function byDateThenId(a: BookReceipt, b: BookReceipt): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
