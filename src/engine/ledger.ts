/**
 * ખાતાવહી - the ledger, one account per grant head (SPEC 6.2).
 *
 * Rows in date order: the opening balance as a credit, each receipt of the head
 * as a credit, each cheque's share of the head as a debit, each bank charge laid
 * on the head as a debit, then a closing row
 * carrying Σ credits, Σ debits and the balance.
 *
 * The running balance prints in જમા બાકી while it is positive and in ઉધાર બાકી
 * once it goes negative - so both columns are computed here and exactly one of
 * them is non-zero on any row.
 *
 * `rojmelPage` is left null. The ledger prints the cash-book page each entry
 * appears on, which only exists once the rojmel is paginated; pass a `pageOf`
 * resolver then and the rows fill in.
 */
import { paidForGu } from "../lib/gujarati.js";
import { add, paise, type Paise, ZERO } from "../lib/money.js";
import { chequeAllocation } from "./allocation.js";
import type { Ledger, LedgerRow, YearBook } from "./types.js";

/** Resolves the rojmel page an entry lands on, once the cash book is paginated. */
export interface PageResolver {
  receiptPage(receiptId: string): number | null;
  chequePage(chequeNo: number): number | null;
  chargePage(chargeId: string): number | null;
  openingPage(): number | null;
  closingPage(): number | null;
}

export interface LedgerOptions {
  pages?: PageResolver;
}

export function ledger(book: YearBook, headCode: string, options: LedgerOptions = {}): Ledger {
  const head = book.heads.find((candidate) => candidate.code === headCode);
  if (!head) throw new Error(`no grant head "${headCode}" in this year`);

  const pages = options.pages;
  const entries: Omit<LedgerRow, "creditBalancePaise" | "debitBalancePaise">[] = [];

  // 1. Opening balance, dated the first day of the year.
  const opening = book.opening.get(headCode);
  const openingPaise = opening ? add(opening.bankPaise, opening.cashPaise) : ZERO;
  entries.push({
    date: book.year.startDate,
    rojmelPage: pages?.openingPage() ?? null,
    descriptionGu: "શ્રી ઉઘડતી સિલક",
    creditPaise: openingPaise,
    debitPaise: ZERO,
  });

  // 2. Receipts of this head.
  for (const receipt of book.receipts.filter((candidate) => candidate.headCode === headCode)) {
    entries.push({
      date: receipt.date,
      rojmelPage: pages?.receiptPage(receipt.id) ?? null,
      descriptionGu: receiptDescription(head.code),
      creditPaise: receipt.amountPaise,
      debitPaise: ZERO,
    });
  }

  // 3. Each cheque's share of this head, dated by the cheque's cash-book date.
  for (const cheque of book.cheques) {
    const share = chequeAllocation(cheque).get(headCode);
    if (share === undefined || share === ZERO) continue;
    entries.push({
      date: cheque.cashbookDate,
      rojmelPage: pages?.chequePage(cheque.chequeNo) ?? null,
      descriptionGu: chequeDescriptionFor(cheque, headCode),
      creditPaise: ZERO,
      debitPaise: share,
    });
  }

  // 4. What the bank took from this head itself - no cheque, no voucher.
  for (const charge of book.bankCharges.filter((candidate) => candidate.headCode === headCode)) {
    entries.push({
      date: charge.date,
      rojmelPage: pages?.chargePage(charge.id) ?? null,
      descriptionGu: charge.descriptionGu,
      creditPaise: ZERO,
      debitPaise: charge.amountPaise,
    });
  }

  // Date order, with the opening row kept first when a receipt shares its date.
  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.date === b.entry.date ? a.index - b.index : a.entry.date < b.entry.date ? -1 : 1))
    .map(({ entry }) => entry);

  const rows: LedgerRow[] = [];
  let balance = ZERO;
  let totalCreditPaise = ZERO;
  let totalDebitPaise = ZERO;

  for (const entry of sorted) {
    balance = paise(balance + entry.creditPaise - entry.debitPaise);
    totalCreditPaise = add(totalCreditPaise, entry.creditPaise);
    totalDebitPaise = add(totalDebitPaise, entry.debitPaise);
    rows.push({
      ...entry,
      creditBalancePaise: balance >= 0 ? balance : ZERO,
      debitBalancePaise: balance < 0 ? paise(-balance) : ZERO,
    });
  }

  return {
    headCode: head.code,
    nameGu: head.nameGu,
    rows,
    totalCreditPaise,
    totalDebitPaise,
    closingPaise: paise(totalCreditPaise - totalDebitPaise),
  };
}

/** Every head's ledger, in print order. */
export function allLedgers(book: YearBook, options: LedgerOptions = {}): Ledger[] {
  return book.heads.map((head) => ledger(book, head.code, options));
}

/** Interest is credited by the bank, so it reads differently from a grant. */
function receiptDescription(headCode: string): string {
  return headCode === "INTEREST" ? "શ્રી વ્યાજના નાણાં જમા" : "શ્રી ગ્રાન્ટ જમા";
}

/**
 * What a cheque's row says in ONE head's ledger.
 *
 * A cheque usually spans several heads - cheque 103 covers cleanliness, first
 * aid, the parents' meeting and the entry festival - but each ledger shows only
 * its own share, so it must describe only its own share too. The reference
 * ledger prints "પ્રવેશોત્સવ કીટના ચુકવ્યા વા.મુ" in the entry-festival account,
 * not the cheque's full four-head purpose line. So the text is built from the
 * bills of THIS head within that cheque.
 *
 * It always reads "<what>ના નાણાં ચુકવ્યા વા.મુજબ", as the client asked for it
 * on every such line.
 */
function chequeDescriptionFor(cheque: YearBook["cheques"][number], headCode: string): string {
  if (cheque.type === "GRANT_RETURN") return cheque.purposeGu;

  const descriptions = [
    ...new Set(
      cheque.bills
        .filter((bill) => bill.headCode === headCode)
        .map((bill) => bill.descriptionGu.trim())
        .filter((description) => description.length > 0),
    ),
  ];

  // A direct cheque may carry a bill with no description; fall back to the
  // cheque's own purpose rather than printing an empty cell.
  if (descriptions.length === 0) return cheque.purposeGu;

  // "... સરભરા ખર્ચના નાણાં ચુકવ્યા વા.મુજબ".
  return `${paidForGu(descriptions.join(", "))} વા.મુજબ`;
}
