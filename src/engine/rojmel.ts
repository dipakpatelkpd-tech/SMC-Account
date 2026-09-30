/**
 * રોજમેળ - the cash book (SPEC 6.1).
 *
 * The rojmel is a sequence of BLOCKS. A block covers one voucher on one
 * cash-book date - two vouchers on the same date are two blocks, one after the
 * other - or a range of dates on which nothing happened. Each block has two sides - આવક
 * (receipts, left) and જાવક (payments, right) - and closes with three footer
 * rows that must agree:
 *
 *     શ્રી ખર્ચખાતે   Σ payments in the block, per column
 *     શ્રી બંધ સિલક   (opening + Σ receipts) − ખર્ચખાતે
 *     શ્રી કુલ        ખર્ચખાતે + બંધ સિલક, which must equal the receipt totals
 *
 * The one thing that looks like an error and is not: a reimbursement is counted
 * on BOTH sides of ખર્ચખાતે - once as the bank withdrawal, once as the cash paid
 * out to the shopkeepers - so the total column reads cash + bank and the block
 * still balances. SPEC 6.1 note 4 says so explicitly.
 *
 * Pagination matters beyond looks: the ખાતાવહી prints the rojmel page number of
 * every entry, so `pageResolver()` here is what fills in those references.
 */
import { add, paise, sum, type Paise, ZERO } from "../lib/money.js";
import { paidForGu } from "../lib/gujarati.js";
import { addDays, endOfMonth, formatDate, formatDateShort } from "../lib/dates.js";
import { billNet, chequeAllocation, chequeAmount } from "./allocation.js";
import { openingBank, openingCash } from "./balances.js";
import type { PageResolver } from "./ledger.js";
import type { BookCheque, BookReceipt, YearBook } from "./types.js";

/** Which side of the book a line sits on. */
export type RojmelSide = "receipt" | "payment";

/** One printed line. Blank columns are empty strings, as on the form. */
export interface RojmelLine {
  side: RojmelSide;
  /** Printed only on the first line of a block; blank afterwards. */
  dateText: string;
  descriptionGu: string;
  /** પહોંચ / વાઉચર નંબર અને તારીખ - receipt or voucher reference. */
  referenceText: string;
  /** ચેક નં તારીખ. */
  chequeText: string;
  cashPaise: Paise;
  bankPaise: Paise;
  totalPaise: Paise;
  /** True when the row carries no money, e.g. the "પદર ખર્ચ" sub-heading. */
  headingOnly: boolean;
  /** Which record produced this line, for the ledger's page lookup. */
  source: { kind: "opening" } | { kind: "receipt"; id: string } | { kind: "cheque"; chequeNo: number } | { kind: "bill"; id: string } | { kind: "none" };
}

export interface RojmelBlock {
  /**
   * Which block this is, for layout keys: the date, or for the second and later
   * vouchers of one date the date and its place ("2025-06-09#2").
   */
  id: string;
  /** The date, or the first date of a nil range. */
  fromDate: string;
  /** The last date of a nil range; equal to fromDate for a normal block. */
  toDate: string;
  /** True when nothing happened: prints કોઈ નાણાંકીય ખર્ચ કરેલ નથી. */
  isNil: boolean;

  openingCashPaise: Paise;
  openingBankPaise: Paise;

  receiptLines: RojmelLine[];
  paymentLines: RojmelLine[];

  /** શ્રી ખર્ચખાતે */
  spentCashPaise: Paise;
  spentBankPaise: Paise;
  spentTotalPaise: Paise;

  /** શ્રી બંધ સિલક */
  closingCashPaise: Paise;
  closingBankPaise: Paise;
  closingTotalPaise: Paise;

  /** The receipt-side totals, which શ્રી કુલ must equal. */
  receiptTotalCashPaise: Paise;
  receiptTotalBankPaise: Paise;
  receiptTotalTotalPaise: Paise;

  /** How many printed rows this block needs, footers included. */
  rowCount: number;
}

export interface RojmelPage {
  /** 1-based, as printed in પાના નંબર. */
  pageNo: number;
  blocks: RojmelBlock[];
}

export interface Rojmel {
  blocks: RojmelBlock[];
  pages: RojmelPage[];
  /** The closing sentence printed after the last block. */
  closingSentenceGu: string;
}

/**
 * Layout constants.
 *
 * The reference book prints two blocks to a page, each padded to eleven rows.
 * A block with more lines than that takes the whole page rather than being
 * split, because a block's footers have to sit with its body to be read.
 */
export const ROWS_PER_BLOCK_MINIMUM = 11;
/**
 * Read off the reference book: its page 3 carries voucher 1 alone - one opening
 * row, the પદર ખર્ચ sub-heading, twenty-one bill lines and three footers, which
 * is twenty-six. Two ordinary eleven-row blocks (twenty-two) still share a page,
 * and three never do.
 */
export const ROWS_PER_PAGE = 26;
/** Opening row + body lines + three footer rows. */
const FOOTER_ROWS = 3;

export interface RojmelOptions {
  /**
   * Whether to print nil blocks for stretches with no transactions.
   *
   * SPEC 11.4 is still open with the client: their own file is inconsistent
   * about this. The default fills every gap, splitting at month ends, which
   * reproduces the shape of the sample pages.
   */
  nilBlocks?: "fill-gaps" | "none";
}

export function buildRojmel(book: YearBook, options: RojmelOptions = {}): Rojmel {
  const fillGaps = (options.nilBlocks ?? "fill-gaps") === "fill-gaps";

  const receiptsByDate = groupBy(book.receipts, (receipt) => receipt.date);
  const chequesByDate = groupBy(book.cheques, (cheque) => cheque.cashbookDate);

  const activeDates = [...new Set([...receiptsByDate.keys(), ...chequesByDate.keys()])].sort();

  const blocks: RojmelBlock[] = [];
  let cash = openingCash(book);
  let bank = openingBank(book);

  const emit = (block: RojmelBlock): void => {
    blocks.push(block);
    cash = block.closingCashPaise;
    bank = block.closingBankPaise;
  };

  /**
   * The nil-block rule, read off the reference book (SPEC 11.4 is still open).
   *
   * The client prints a nil block only AFTER a date that had entries, running
   * to the end of that month - never before the first transaction of a month.
   * Their page 2 goes 04/05, then 05/05 TO 31/05, and simply omits 01/05-03/05.
   * Filling every gap instead produced 26 pages against their 16.
   *
   * The range stops early if the next transaction falls inside it.
   */
  const emitTailGap = (afterDate: string, nextActive: string | undefined): void => {
    if (!fillGaps) return;
    const from = nextDay(afterDate);
    if (from > book.year.endDate) return;

    let to: string = endOfMonth(afterDate);
    if (to > book.year.endDate) to = book.year.endDate;
    if (nextActive !== undefined && nextActive <= to) to = previousDay(nextActive);

    if (from <= to) emit(nilBlock(from, to, cash, bank));
  };

  // The year opens with its own block, even when nothing happened on 1 April.
  const firstDate = book.year.startDate;
  const startHasEntries = activeDates[0] === firstDate;
  if (fillGaps && !startHasEntries) {
    emit(nilBlock(firstDate, firstDate, cash, bank));
    emitTailGap(firstDate, activeDates[0]);
  }

  for (let index = 0; index < activeDates.length; index += 1) {
    const date = activeDates[index]!;
    // One block per voucher: a date with two vouchers prints two blocks, the
    // second opening with the first one's બંધ સિલક. The date's receipts go in
    // its first block.
    const vouchers = voucherGroups(chequesByDate.get(date) ?? []);
    const parts = vouchers.length === 0 ? [[]] : vouchers;
    parts.forEach((cheques, part) => {
      emit(
        activeBlock(
          book,
          date,
          part === 0 ? (receiptsByDate.get(date) ?? []) : [],
          cheques,
          cash,
          bank,
          part === 0 ? date : `${date}#${part + 1}`,
        ),
      );
    });
    emitTailGap(date, activeDates[index + 1]);
  }

  // A year with no transactions at all still prints a book.
  if (blocks.length === 0) {
    for (const range of monthRanges(book.year.startDate, book.year.endDate)) {
      emit(nilBlock(range.from, range.to, cash, bank));
    }
  }

  return {
    blocks,
    pages: paginate(blocks),
    closingSentenceGu: closingSentence(book, add(cash, bank)),
  };
}

// ------------------------------------------------------------------- blocks

function nilBlock(from: string, to: string, cash: Paise, bank: Paise): RojmelBlock {
  const opening: RojmelLine = {
    side: "receipt",
    dateText: dateRangeText(from, to),
    descriptionGu: "શ્રી ઉઘડતી સિલક",
    referenceText: "",
    chequeText: "",
    cashPaise: cash,
    bankPaise: bank,
    totalPaise: add(cash, bank),
    headingOnly: false,
    source: { kind: "opening" },
  };

  const nothing: RojmelLine = {
    side: "payment",
    dateText: dateRangeText(from, to),
    descriptionGu: "કોઈ નાણાંકીય ખર્ચ કરેલ નથી",
    referenceText: "",
    chequeText: "",
    cashPaise: ZERO,
    bankPaise: ZERO,
    totalPaise: ZERO,
    headingOnly: false,
    source: { kind: "none" },
  };

  return finishBlock({
    id: from,
    fromDate: from,
    toDate: to,
    isNil: true,
    openingCashPaise: cash,
    openingBankPaise: bank,
    receiptLines: [opening],
    paymentLines: [nothing],
  });
}

function activeBlock(
  book: YearBook,
  date: string,
  receipts: BookReceipt[],
  cheques: BookCheque[],
  cash: Paise,
  bank: Paise,
  id: string,
): RojmelBlock {
  const nameByCode = new Map(book.heads.map((head) => [head.code, head.nameGu]));

  const receiptLines: RojmelLine[] = [
    {
      side: "receipt",
      dateText: formatDate(date),
      descriptionGu: "શ્રી ઉઘડતી સિલક",
      referenceText: "",
      chequeText: "",
      cashPaise: cash,
      bankPaise: bank,
      totalPaise: add(cash, bank),
      headingOnly: false,
      source: { kind: "opening" },
    },
  ];

  for (const receipt of receipts) {
    const head = nameByCode.get(receipt.headCode) ?? receipt.headCode;
    receiptLines.push({
      side: "receipt",
      dateText: "",
      descriptionGu:
        receipt.headCode === "INTEREST" ? "શ્રી વ્યાજના નાણાં જમા" : `${head} જમા`,
      referenceText: receipt.creditedDate ? formatDate(receipt.creditedDate) : "",
      chequeText: receipt.ddChequeNo ?? "",
      cashPaise: ZERO,
      bankPaise: receipt.amountPaise,
      totalPaise: receipt.amountPaise,
      headingOnly: false,
      source: { kind: "receipt", id: receipt.id },
    });
  }

  const paymentLines: RojmelLine[] = [];

  for (const cheque of [...cheques].sort((a, b) => a.chequeNo - b.chequeNo)) {
    const amount = chequeAmount(cheque);
    const chequeText = `${cheque.chequeNo} ${formatDate(cheque.chequeDate)}`;
    const voucherText =
      cheque.voucherNo === null ? "" : `${cheque.voucherNo} ${formatDate(cheque.chequeDate)}`;

    if (cheque.type === "REIMBURSEMENT") {
      // Bank side: the member secretary withdraws for these heads.
      const heads = [...chequeAllocation(cheque).keys()].map(
        (code) => nameByCode.get(code) ?? code,
      );
      paymentLines.push({
        side: "payment",
        dateText: paymentLines.length === 0 ? formatDate(date) : "",
        descriptionGu: `સભ્ય સચિવ દ્વારા ${joinGu(heads)} ના નાણાં ઉપાડ્યા`,
        referenceText: voucherText,
        chequeText,
        cashPaise: ZERO,
        bankPaise: amount,
        totalPaise: amount,
        headingOnly: false,
        source: { kind: "cheque", chequeNo: cheque.chequeNo },
      });

      paymentLines.push({
        side: "payment",
        dateText: "",
        descriptionGu: "મુ.શિ.એ કરેલ પદર ખર્ચના નાણાં પરત લીધા",
        referenceText: "",
        chequeText: "",
        cashPaise: ZERO,
        bankPaise: ZERO,
        totalPaise: ZERO,
        headingOnly: true,
        source: { kind: "cheque", chequeNo: cheque.chequeNo },
      });

      // Cash side: one line per bill the head teacher had already paid.
      for (const bill of cheque.bills) {
        const net = billNet(bill);
        paymentLines.push({
          side: "payment",
          dateText: "",
          descriptionGu: `${bill.vendorGu}ને બિલ મુજબ`,
          referenceText: bill.billNo
            ? `${bill.billNo} ${formatDateShort(bill.billDate)}`
            : formatDateShort(bill.billDate),
          chequeText: "",
          cashPaise: net,
          bankPaise: ZERO,
          totalPaise: net,
          headingOnly: false,
          source: { kind: "bill", id: bill.id },
        });
      }

      // And the matching receipt-side line: bank money taken into hand.
      receiptLines.push({
        side: "receipt",
        dateText: "",
        descriptionGu: CASH_IN_HAND_GU,
        referenceText: "",
        chequeText: "",
        cashPaise: amount,
        bankPaise: ZERO,
        totalPaise: amount,
        headingOnly: false,
        source: { kind: "cheque", chequeNo: cheque.chequeNo },
      });
    } else if (cheque.type === "DIRECT") {
      const heads = [...chequeAllocation(cheque).keys()].map(
        (code) => nameByCode.get(code) ?? code,
      );
      paymentLines.push({
        side: "payment",
        dateText: paymentLines.length === 0 ? formatDate(date) : "",
        descriptionGu: `${joinGu(heads)}માંથી ચેકથી નાણાં ચુકવ્યા`,
        referenceText: voucherText,
        chequeText,
        cashPaise: ZERO,
        bankPaise: amount,
        totalPaise: amount,
        headingOnly: false,
        source: { kind: "cheque", chequeNo: cheque.chequeNo },
      });
      paymentLines.push({
        side: "payment",
        dateText: "",
        descriptionGu: `${cheque.payeeGu}ને ${paidForGu(cheque.purposeGu)} વા.મુજબ`,
        referenceText: "",
        chequeText: "",
        cashPaise: ZERO,
        bankPaise: ZERO,
        totalPaise: ZERO,
        headingOnly: true,
        source: { kind: "cheque", chequeNo: cheque.chequeNo },
      });
    } else {
      paymentLines.push({
        side: "payment",
        dateText: paymentLines.length === 0 ? formatDate(date) : "",
        descriptionGu: "સી.આર.સી કો.ઓર્ડિનેટરને બચત ગ્રાન્ટ પરત",
        referenceText: voucherText,
        chequeText,
        cashPaise: ZERO,
        bankPaise: amount,
        totalPaise: amount,
        headingOnly: false,
        source: { kind: "cheque", chequeNo: cheque.chequeNo },
      });

      // The form lists which head each returned rupee came from.
      for (const [code, share] of chequeAllocation(cheque)) {
        paymentLines.push({
          side: "payment",
          dateText: "",
          descriptionGu: `${nameByCode.get(code) ?? code} ${formatAmountPlain(share)}`,
          referenceText: "",
          chequeText: "",
          cashPaise: ZERO,
          bankPaise: ZERO,
          totalPaise: ZERO,
          headingOnly: true,
          source: { kind: "cheque", chequeNo: cheque.chequeNo },
        });
      }
    }
  }

  if (paymentLines.length === 0) {
    paymentLines.push({
      side: "payment",
      dateText: formatDate(date),
      descriptionGu: "કોઈ નાણાંકીય ખર્ચ કરેલ નથી",
      referenceText: "",
      chequeText: "",
      cashPaise: ZERO,
      bankPaise: ZERO,
      totalPaise: ZERO,
      headingOnly: false,
      source: { kind: "none" },
    });
  }

  return finishBlock({
    id,
    fromDate: date,
    toDate: date,
    isNil: false,
    openingCashPaise: cash,
    openingBankPaise: bank,
    receiptLines,
    paymentLines,
  });
}

/** Compute the three footer rows and the row count. */
function finishBlock(
  partial: Pick<
    RojmelBlock,
    | "id"
    | "fromDate"
    | "toDate"
    | "isNil"
    | "openingCashPaise"
    | "openingBankPaise"
    | "receiptLines"
    | "paymentLines"
  >,
): RojmelBlock {
  const receiptTotalCashPaise = sum(partial.receiptLines.map((line) => line.cashPaise));
  const receiptTotalBankPaise = sum(partial.receiptLines.map((line) => line.bankPaise));

  const spentCashPaise = sum(partial.paymentLines.map((line) => line.cashPaise));
  const spentBankPaise = sum(partial.paymentLines.map((line) => line.bankPaise));

  const closingCashPaise = paise(receiptTotalCashPaise - spentCashPaise);
  const closingBankPaise = paise(receiptTotalBankPaise - spentBankPaise);

  const bodyRows = Math.max(receiptSideRows(partial.receiptLines).length, partial.paymentLines.length);

  return {
    ...partial,
    spentCashPaise,
    spentBankPaise,
    // Deliberately cash + bank: a reimbursement appears on both sides.
    spentTotalPaise: add(spentCashPaise, spentBankPaise),
    closingCashPaise,
    closingBankPaise,
    closingTotalPaise: add(closingCashPaise, closingBankPaise),
    receiptTotalCashPaise,
    receiptTotalBankPaise,
    receiptTotalTotalPaise: add(receiptTotalCashPaise, receiptTotalBankPaise),
    rowCount: Math.max(ROWS_PER_BLOCK_MINIMUM, bodyRows + FOOTER_ROWS),
  };
}

/**
 * The આવક side of a block, row by row, before padding: the opening balance, a
 * blank row, the receipts, and a blank row after them - the client's book never
 * writes a line straight under a receipt - then the bank-to-hand transfer,
 * which the form prints last (null is a blank row).
 */
export function receiptSideRows(lines: readonly RojmelLine[]): (RojmelLine | null)[] {
  const [opening, ...rest] = lines;
  if (!opening) return [];
  const cashInHand = rest.filter(isCashInHand);
  const receipts = rest.filter((line) => !isCashInHand(line));
  return [opening, ...(receipts.length > 0 ? [null, ...receipts, null] : []), ...cashInHand];
}

/** The bank-to-hand transfer line, which the form prints last on the left. */
export function isCashInHand(line: RojmelLine): boolean {
  return line.descriptionGu === CASH_IN_HAND_GU;
}

const CASH_IN_HAND_GU = "મુખ્ય શિક્ષકે નાણાં ઉપાડી હાથ પર લીધા";

/**
 * A date's cheques, one group per voucher, in cheque-number order. A cheque
 * with no voucher number is a voucher of its own.
 */
function voucherGroups(cheques: readonly BookCheque[]): BookCheque[][] {
  const groups = new Map<string, BookCheque[]>();
  for (const cheque of [...cheques].sort((a, b) => a.chequeNo - b.chequeNo)) {
    const key = cheque.voucherNo === null ? `cheque:${cheque.chequeNo}` : `voucher:${cheque.voucherNo}`;
    const group = groups.get(key);
    if (group) group.push(cheque);
    else groups.set(key, [cheque]);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- pagination

/**
 * Pack blocks onto pages without splitting one.
 *
 * A block's footers have to be read with its body, so a block that does not fit
 * the remaining space starts a new page. This is deterministic, which is what
 * the ledger's page references depend on.
 */
export function paginate(blocks: RojmelBlock[]): RojmelPage[] {
  const pages: RojmelPage[] = [];
  let current: RojmelBlock[] = [];
  let used = 0;

  for (const block of blocks) {
    if (current.length > 0 && used + block.rowCount > ROWS_PER_PAGE) {
      pages.push({ pageNo: pages.length + 1, blocks: current });
      current = [];
      used = 0;
    }
    current.push(block);
    used += block.rowCount;
  }

  if (current.length > 0) pages.push({ pageNo: pages.length + 1, blocks: current });
  return pages;
}

/**
 * Where each entry landed, so the ખાતાવહી can print "રોજમેળ પાનું".
 *
 * This is the function SPEC 6.1 calls `pageOf(entry)`.
 */
export function pageResolver(rojmel: Rojmel): PageResolver {
  const receiptPages = new Map<string, number>();
  const chequePages = new Map<number, number>();

  for (const page of rojmel.pages) {
    for (const block of page.blocks) {
      for (const line of [...block.receiptLines, ...block.paymentLines]) {
        if (line.source.kind === "receipt" && !receiptPages.has(line.source.id)) {
          receiptPages.set(line.source.id, page.pageNo);
        }
        if (line.source.kind === "cheque" && !chequePages.has(line.source.chequeNo)) {
          chequePages.set(line.source.chequeNo, page.pageNo);
        }
      }
    }
  }

  const lastPage = rojmel.pages.length === 0 ? 1 : rojmel.pages[rojmel.pages.length - 1]!.pageNo;

  return {
    receiptPage: (id) => receiptPages.get(id) ?? null,
    chequePage: (chequeNo) => chequePages.get(chequeNo) ?? null,
    openingPage: () => 1,
    closingPage: () => lastPage,
  };
}

// ------------------------------------------------------------------ helpers

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket) bucket.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/** Split [from, to] at month ends, so a nil block never spans two months. */
function monthRanges(from: string, to: string): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = [];
  let cursor = from;
  while (cursor <= to) {
    const monthEnd = endOfMonth(cursor);
    const rangeEnd = monthEnd < to ? monthEnd : to;
    ranges.push({ from: cursor, to: rangeEnd });
    cursor = nextDay(rangeEnd);
  }
  return ranges;
}

function nextDay(date: string): string {
  return addDays(date, 1);
}

function previousDay(date: string): string {
  return addDays(date, -1);
}

/** "01/04/2025" or "02/04/2025 TO 30/04/2025", as the form prints it. */
function dateRangeText(from: string, to: string): string {
  return from === to ? formatDate(from) : `${formatDate(from)} TO ${formatDate(to)}`;
}

/** "a, b અને c" - the form joins the last pair with અને. */
function joinGu(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} અને ${items[items.length - 1]!}`;
}

function formatAmountPlain(amount: Paise): string {
  const rupees = Math.trunc(amount / 100);
  const remainder = Math.abs(amount % 100);
  return remainder === 0 ? String(rupees) : `${rupees}.${String(remainder).padStart(2, "0")}`;
}

function closingSentence(book: YearBook, closing: Paise): string {
  // Printed in Gujarati digits even though the rest of the rojmel is Latin
  // (SPEC 6.1 note 6). The caller converts; this keeps the wording in one place.
  return `તારીખ ${formatDate(book.year.endDate)} ના રોજ ${book.school.nameGu} SMCE ની બંધ સિલક રૂપિયા ${formatAmountPlain(closing)}.૦૦ રહે છે.`;
}
