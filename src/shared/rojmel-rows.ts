/**
 * Where each line of a rojmel block is printed.
 *
 * The printed cash book sets a block's receipt lines and payment lines side by
 * side, one table row each, and pads both to the same height so the footers
 * line up. Which receipt line lands on which row is a layout decision, not a
 * calculation, but two places need the same answer: the print page, and the
 * Excel export, which has to find "row 7 of the 4 May block" to carry a
 * highlight the school put there. So it is worked out once, here.
 */
import {
  ROWS_PER_BLOCK_MINIMUM,
  isCashInHand,
  receiptSideRows,
  type RojmelBlock,
  type RojmelLine,
} from "../engine/rojmel.js";
import { ROW_KEYS } from "./report-layout.js";

export { isCashInHand };

export interface RojmelTableRow {
  /** The layout row key: the block, and this row's place in it. */
  key: string;
  left: RojmelLine | null;
  right: RojmelLine | null;
}

export function rojmelBlockRows(block: RojmelBlock): RojmelTableRow[] {
  // The આવક side with its blank rows: opening, blank, receipts, blank, and the
  // bank-to-hand transfer (engine/rojmel.ts, receiptSideRows).
  const left = receiptSideRows(block.receiptLines);
  const cashInHand = left.filter((line): line is RojmelLine => line !== null && isCashInHand(line));
  const top = left.slice(0, left.length - cashInHand.length);

  // Both sides are padded to the same height so the footers line up; the block
  // as a whole is padded to its minimum so two blocks fill a page evenly.
  const bodyRows = Math.max(left.length, block.paymentLines.length, ROWS_PER_BLOCK_MINIMUM - 3);

  // The reference book bottom-aligns "મુખ્ય શિક્ષકે નાણાં ઉપાડી હાથ પર લીધા" so
  // it sits beside the last bill it paid for, rather than stranded under the
  // opening balance with twenty blank rows beneath it.
  const leftAt = (index: number): RojmelLine | null => {
    if (index < top.length) return top[index] ?? null;
    const fromBottom = bodyRows - index;
    if (fromBottom >= 1 && fromBottom <= cashInHand.length) {
      return cashInHand[cashInHand.length - fromBottom] ?? null;
    }
    return null;
  };

  return Array.from({ length: bodyRows }, (_, index) => ({
    key: ROW_KEYS.rojmelRow(block.id, index),
    left: leftAt(index),
    right: block.paymentLines[index] ?? null,
  }));
}
