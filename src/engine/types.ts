/**
 * The in-memory shape every report is computed from.
 *
 * A YearBook is one school-year's facts as plain data - no Prisma types, no
 * database handles, no async. That is what makes every report in this folder a
 * pure function: the same book always produces the same numbers, and the tests
 * can build a book straight from the sample JSON without a database at all.
 *
 * Two things build a YearBook: src/engine/load.ts from the database, and
 * tests/fixtures/sample-book.ts from reference/sample_data_2025-26.json. A test
 * asserts the two agree.
 */
import type { Paise } from "../lib/money.js";
import type { ChequeType } from "../lib/types.js";

export interface BookSchool {
  nameGu: string;
  smcLabelGu: string;
  diseCode: string;
  clusterGu: string;
  talukaGu: string;
  districtGu: string;
  programmeGu: string;
  memberSecretaryGu: string;
  memberSecretaryShortGu: string;
  memberSecretaryMobile: string | null;
  bankNameGu: string;
  bankBranchGu: string;
  bankAccountNo: string;
}

export interface BookYear {
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

/** A grant head as the reports see it, already in print order. */
export interface BookHead {
  code: string;
  nameGu: string;
  reportOrder: number;
}

export interface BookOpening {
  bankPaise: Paise;
  cashPaise: Paise;
}

export interface BookReceipt {
  id: string;
  /** Cash-book date: the date this receipt enters the rojmel. */
  date: string;
  headCode: string;
  amountPaise: Paise;
  receivedFromGu: string;
  modeGu: string;
  bankLabelGu: string;
  ddChequeNo: string | null;
  ddChequeDate: string | null;
  allotmentOrderNo: string | null;
  allotmentOrderDate: string | null;
  depositedDate: string | null;
  creditedDate: string | null;
  remarksGu: string | null;
}

export interface BookBill {
  id: string;
  voucherNo: number;
  /** Null for the bill behind a direct-payment cheque (SPEC 6.5). Always text. */
  billNo: string | null;
  billDate: string;
  descriptionGu: string;
  vendorGu: string;
  headCode: string;
  amountPaise: Paise;
  deductionPaise: Paise;
  quantityGu: string | null;
  remarksGu: string | null;
  /** The cheque that paid this bill, or null while it is still unpaid. */
  chequeNo: number | null;
}

export interface BookCheque {
  chequeNo: number;
  chequeDate: string;
  /** The date the cheque enters the rojmel; may differ from chequeDate. */
  cashbookDate: string;
  cashedDate: string | null;
  voucherNo: number | null;
  payeeGu: string;
  purposeGu: string;
  type: ChequeType;
  remarksGu: string | null;
  /** The bills this cheque pays. Empty for a grant return. */
  bills: BookBill[];
  /**
   * The per-head split typed by the user. Only a grant return has these; for the
   * other two types the split is computed from `bills` and this array is empty.
   */
  typedAllocation: { headCode: string; amountPaise: Paise }[];
}

export interface BookReconciliation {
  /** B - cheques issued but not yet encashed. */
  chequesIssuedNotCashedPaise: Paise;
  /** C - credited by the bank but not yet in the cash book. */
  creditsInBankNotInCashbookPaise: Paise;
  /** D - sent to the bank but not yet credited. */
  depositsNotYetCreditedPaise: Paise;
  /** E - charges debited by the bank but not yet in the cash book. */
  bankChargesNotInCashbookPaise: Paise;
  /** What the passbook actually says on 31 March. */
  passbookBalancePaise: Paise;
}

export interface YearBook {
  school: BookSchool;
  year: BookYear;
  /** In print order. */
  heads: BookHead[];
  /** Keyed by head code; a head with no row opens at zero. */
  opening: Map<string, BookOpening>;
  receipts: BookReceipt[];
  bills: BookBill[];
  cheques: BookCheque[];
  reconciliation: BookReconciliation | null;
}

// --------------------------------------------------------------- report rows

/** One row of પરિશિષ્ટ ૧૦, and the shape of its total row. */
export interface Annexure10Row {
  headCode: string;
  nameGu: string;
  openingPaise: Paise;
  receivedPaise: Paise;
  totalPaise: Paise;
  spentPaise: Paise;
  returnedPaise: Paise;
  totalOutPaise: Paise;
  closingPaise: Paise;
}

export interface Annexure10 {
  rows: Annexure10Row[];
  totals: Omit<Annexure10Row, "headCode" | "nameGu">;
}

/** The cash and bank position after every transaction of one cash-book date. */
export interface DayBalance {
  date: string;
  bankPaise: Paise;
  cashPaise: Paise;
  totalPaise: Paise;
}

/** One row of a ખાતાવહી (ledger) - see SPEC 6.2. */
export interface LedgerRow {
  date: string;
  /** Rojmel page this entry appears on; null until the cash book is paginated. */
  rojmelPage: number | null;
  descriptionGu: string;
  creditPaise: Paise;
  debitPaise: Paise;
  /** Running balance, printed in જમા બાકી when >= 0 and ઉધાર બાકી when < 0. */
  creditBalancePaise: Paise;
  debitBalancePaise: Paise;
}

export interface Ledger {
  headCode: string;
  nameGu: string;
  rows: LedgerRow[];
  totalCreditPaise: Paise;
  totalDebitPaise: Paise;
  /** Σ credits − Σ debits. */
  closingPaise: Paise;
}

/** One row of the ગ્રાન્ટ રજીસ્ટર - one receipt, plus how much of it was spent. */
export interface GrantRegisterRow {
  receipt: BookReceipt;
  headNameGu: string;
  /** ખર્ચેલ રકમ - the part of this receipt consumed by spending (SPEC 6.3). */
  spentPaise: Paise;
  /** બચત રહેલ ગ્રાન્ટ = amount − spent. */
  savingPaise: Paise;
}

/** પરિશિષ્ટ ૯ - the bank reconciliation, in the order the form prints it. */
export interface Annexure9 {
  /** A - bank balance per the cash book on 31 March. */
  cashbookBankPaise: Paise;
  chequesIssuedNotCashedPaise: Paise;
  creditsInBankNotInCashbookPaise: Paise;
  /** A + B + C. */
  subtotalPaise: Paise;
  depositsNotYetCreditedPaise: Paise;
  bankChargesNotInCashbookPaise: Paise;
  /** D + E. */
  deductionsPaise: Paise;
  /** A + B + C − D − E - what the passbook should say. */
  computedPassbookPaise: Paise;
  /** What the user entered off the passbook. */
  enteredPassbookPaise: Paise;
  /** True when the two agree. The client's Excel just copies A here; we do not. */
  matches: boolean;
  /**
   * B as the cheques themselves say it is: issued on or before 31 March and not
   * encashed by then (SPEC 4.6). Not printed - it is offered on the input screen
   * beside the typed figure so a disagreement with the passbook is visible
   * rather than silently overridden.
   */
  suggestedUnencashedPaise: Paise;
}
