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
import { ROWS_PER_BLOCK_MINIMUM, type RojmelBlock, type RojmelLine } from "../engine/rojmel.js";
import { ROW_KEYS } from "./report-layout.js";

export interface RojmelTableRow {
  /** The layout row key: the block, and this row's place in it. */
  key: string;
  left: RojmelLine | null;
  right: RojmelLine | null;
}

/** The bank-to-hand transfer line, which the form prints last on the left. */
export function isCashInHand(line: RojmelLine): boolean {
  return line.descriptionGu === "મુખ્ય શિક્ષકે નાણાં ઉપાડી હાથ પર લીધા";
}

export function rojmelBlockRows(block: RojmelBlock): RojmelTableRow[] {
  // Both sides are padded to the same height so the footers line up; the block
  // as a whole is padded to its minimum so two blocks fill a page evenly.
  const bodyRows = Math.max(
    block.receiptLines.length,
    block.paymentLines.length,
    ROWS_PER_BLOCK_MINIMUM - 3,
  );

  // The reference book bottom-aligns "મુખ્ય શિક્ષકે નાણાં ઉપાડી હાથ પર લીધા" so
  // it sits beside the last bill it paid for, rather than stranded under the
  // opening balance with twenty blank rows beneath it.
  const cashInHand = block.receiptLines.filter(isCashInHand);
  const topLines = block.receiptLines.filter((line) => !isCashInHand(line));

  const leftAt = (index: number): RojmelLine | null => {
    if (index < topLines.length) return topLines[index] ?? null;
    const fromBottom = bodyRows - index;
    if (fromBottom >= 1 && fromBottom <= cashInHand.length) {
      return cashInHand[cashInHand.length - fromBottom] ?? null;
    }
    return null;
  };

  return Array.from({ length: bodyRows }, (_, index) => ({
    key: ROW_KEYS.rojmelRow(block.fromDate, index),
    left: leftAt(index),
    right: block.paymentLines[index] ?? null,
  }));
}
