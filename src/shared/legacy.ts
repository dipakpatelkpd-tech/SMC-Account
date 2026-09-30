/**
 * What an old workbook holds, once it has been read.
 *
 * These live in shared/ rather than beside the parser because both sides of the
 * seam need them: the parser fills them in, and the review screen edits them and
 * hands them back. The renderer must never import the parser itself - that would
 * pull ExcelJS and Node's fs into the browser bundle.
 *
 * Every row carries the spreadsheet row it came from and the notes the importer
 * made about it, so a reviewer can always go and look at the original.
 */
import type { Issue } from "../engine/validation.js";
import type { ChequeType } from "../lib/types.js";

export interface LegacyReceiptRow {
  /** The row it came from, so a reviewer can go and look at it. */
  sourceRow: number;
  date: string | null;
  headNameGu: string;
  amountPaise: number;
  receivedFromGu: string;
  allotmentOrderNo: string | null;
  bankLabelGu: string;
  notes: string[];
}

export interface LegacyBillRow {
  sourceRow: number;
  /**
   * The grant head this bill probably belongs to, guessed from its description.
   *
   * The old bill register has no grant-head column at all - the head was only
   * ever implied by the wording ("શાળા સ્વચ્છતા મટીરીયલ્સ"). Our Bill must have
   * one, so it is guessed here and CHOSEN by the reviewer; the importer refuses
   * to write a bill whose head nobody confirmed.
   */
  suggestedHeadName: string | null;
  voucherNo: number | null;
  billNo: string | null;
  billDate: string | null;
  descriptionGu: string;
  vendorGu: string;
  amountPaise: number;
  deductionPaise: number;
  quantityGu: string | null;
  notes: string[];
}

export interface LegacyChequeRow {
  sourceRow: number;
  /** Guessed from the payee and the purpose; confirmed by the reviewer. */
  suggestedType: ChequeType;
  /** For a grant return, the head the money probably went back from. */
  suggestedHeadName: string | null;
  chequeNo: number | null;
  chequeDate: string | null;
  voucherNo: number | null;
  billRangeText: string;
  amountPaise: number;
  payeeGu: string;
  purposeGu: string;
  cashedDate: string | null;
  notes: string[];
}

/**
 * Everything read from the file, with everything uncertain about it.
 *
 * `issues` are about the file as a whole (a missing sheet, a sheet whose columns
 * are not where they should be). Per-row uncertainty lives in each row's `notes`,
 * because that is where a reviewer needs to see it.
 */
export interface LegacyImportPlan {
  filePath: string;
  yearLabel: string;
  receipts: LegacyReceiptRow[];
  bills: LegacyBillRow[];
  cheques: LegacyChequeRow[];
  /** Head names found in the file, in the order they first appear. */
  headNames: string[];
  issues: Issue[];
}

