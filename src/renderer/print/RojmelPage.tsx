import { Fragment } from "react";
import type { CSSProperties, JSX } from "react";
import type { RojmelBlock, RojmelLine, RojmelPage as RojmelPageData } from "../../engine/rojmel.js";
import { ROW_GROUPS, ROW_KEYS, targetKey } from "../../shared/report-layout.js";
import { isGrantCredit, rojmelBlockRows } from "../../shared/rojmel-rows.js";
import { GapRow, LayoutColGroup, useReportLayout } from "./layout-context.js";
import type { SchoolDto } from "../../shared/api.js";
import { formatAmount } from "../../lib/money.js";

/**
 * રોજમેળ - one printed page of the cash book (SPEC 6.1).
 *
 * Legal landscape, two sides. The left half is આવક (receipts), the right half
 * જાવક (payments). Only the આવક side has a date column: on the જાવક side the
 * date is printed with the voucher number. Blocks - one per voucher - are
 * stacked down the page and padded with blank rows so the footers sit where
 * the eye expects them.
 *
 * The column widths (REPORT_COLUMNS.rojmel) follow the client's ROJMED sheet: the payment side gets the
 * wider description and a voucher column wide enough for "1/21 15/3/25" on one
 * line, because that is the side where the long lines are; the receipt side's
 * reference column holds the credited date, so it is as wide as a date.
 *
 * LATIN DIGITS. The rojmel is the one report that does not use Gujarati
 * numerals (SPEC section 6), which is why nothing here goes through
 * toGujaratiDigits - only the closing sentence at the end of the book does.
 */
export function RojmelSheet({
  school,
  page,
  closingSentenceGu,
  isLastPage,
}: {
  school: SchoolDto;
  page: RojmelPageData;
  closingSentenceGu: string;
  isLastPage: boolean;
}): JSX.Element {
  // The આવક box ends where the receipt half of the table does - at the heavy
  // rule down the middle - however the school has set the column widths.
  const widths = useReportLayout()?.widths ?? {};
  const receiptHalf = Object.entries(widths)
    .filter(([id]) => id.startsWith("r."))
    .reduce((sum, [, width]) => sum + width, 0);

  return (
    <div className="sheet landscape" data-spread-blocks="">
      <div className="rojmel-title" data-part="title">{school.smcLabelGu}</div>

      <div
        className="rojmel-band"
        data-part="band"
        style={receiptHalf > 0 ? ({ "--receipt-half": `${receiptHalf}%` } as CSSProperties) : undefined}
      >
        <div className="band-left" data-part="bandLeft">
          <span>આવક</span>
          <span>( Cash Book )</span>
        </div>
        <div className="band-right" data-part="bandRight">
          <span>( કેશ બુક )</span>
          <span>જાવક</span>
        </div>
        <div className="band-page" data-part="bandPage">
          પાના.નંબર <span className="page-no">{page.pageNo}</span>
        </div>
      </div>

      <table className="form rojmel" data-layout="">
        {/* Widths: REPORT_COLUMNS.rojmel, after the client's ROJMED sheet. */}
        <LayoutColGroup />
        <thead>
          <tr data-row={ROW_KEYS.head}>
            <th data-col="r.date" className="col-date">તારીખ</th>
            <th data-col="r.detail" className="col-detail">આવકની વિગત</th>
            <th data-col="r.ref" className="col-ref">પહોંચ નંબર અને તારીખ</th>
            <th data-col="r.cheque" className="col-ref">ચેક નં તારીખ ડી.ડી.નં તારીખ</th>
            <th data-col="r.class" className="col-class">વર્ગીકરણ રજી.નો પાન નં</th>
            <th data-col="r.cash" className="col-money">રોકડ</th>
            <th data-col="r.bank" className="col-money">બેન્ક</th>
            <th data-col="r.total" className="col-money">કુલ રકમ</th>

            <th data-col="p.detail" className="col-detail gutter">જાવક ની વિગત</th>
            <th data-col="p.ref" className="col-ref">વાઉચર નંબર અને તારીખ</th>
            <th data-col="p.cheque" className="col-ref">ચેક નં તારીખ</th>
            <th data-col="p.class" className="col-class">વર્ગીકરણ રજી.નો પાન નં</th>
            <th data-col="p.cash" className="col-money">રોકડ</th>
            <th data-col="p.bank" className="col-money">બેન્ક</th>
            <th data-col="p.total" className="col-money">કુલ રકમ</th>
          </tr>
        </thead>
        <tbody>
          {page.blocks.map((block) => (
            <Block key={block.id} block={block} />
          ))}
        </tbody>
      </table>

      {isLastPage && <p className="rojmel-closing" data-part="closing">{closingSentenceGu}</p>}
    </div>
  );
}

function Block({ block }: { block: RojmelBlock }): JSX.Element {
  const footer = (which: "spent" | "closing" | "grand"): string => ROW_KEYS.rojmelFooter(block.id, which);
  // A row the school gave a height keeps it; the others grow to fill the sheet
  // (PrintRoot, spreadBlocks).
  const layout = useReportLayout()?.layout;
  const heightSet = (row: string, group: string): boolean =>
    layout !== undefined &&
    (layout.rowHeightMm !== undefined ||
      layout.styles[targetKey({ kind: "row", row })]?.heightMm !== undefined ||
      layout.styles[targetKey({ kind: "row", row: group })]?.heightMm !== undefined);

  return (
    <>
      {rojmelBlockRows(block).map((row, index) => (
        <Fragment key={row.key}>
          <tr
            data-row={row.key}
            data-row-group={ROW_GROUPS.rojmelRow(index)}
            data-fixed-height={heightSet(row.key, ROW_GROUPS.rojmelRow(index)) ? "" : undefined}
          >
            <Half side="r" line={row.left} />
            <Half side="p" line={row.right} />
          </tr>
          <GapRow rowKey={row.key} group={ROW_GROUPS.rojmelRow(index)} />
        </Fragment>
      ))}

      {/* શ્રી ખર્ચખાતે - what left the block, per column. */}
      <tr className="footer-row spent" data-row={footer("spent")}
        data-row-group={ROW_GROUPS.rojmelFooter("spent")}
        data-fixed-height={heightSet(footer("spent"), ROW_GROUPS.rojmelFooter("spent")) ? "" : undefined}
      >
        <Blank side="r" />
        <td data-col="p.detail" className="gutter label">શ્રી ખર્ચખાતે</td>
        <td data-col="p.ref" />
        <td data-col="p.cheque" />
        <td data-col="p.class" />
        <td data-col="p.cash" className="figure">{formatAmount(block.spentCashPaise)}</td>
        <td data-col="p.bank" className="figure">{formatAmount(block.spentBankPaise)}</td>
        <td data-col="p.total" className="figure">{formatAmount(block.spentTotalPaise)}</td>
      </tr>
      <GapRow rowKey={footer("spent")} group={ROW_GROUPS.rojmelFooter("spent")} />

      {/* શ્રી બંધ સિલક - the left half carries the receipt totals. */}
      <tr className="footer-row closing" data-row={footer("closing")}
        data-row-group={ROW_GROUPS.rojmelFooter("closing")}
        data-fixed-height={heightSet(footer("closing"), ROW_GROUPS.rojmelFooter("closing")) ? "" : undefined}
      >
        <td data-col="r.date" />
        <td data-col="r.detail" />
        <td data-col="r.ref" />
        <td data-col="r.cheque" />
        <td data-col="r.class" />
        <td data-col="r.cash" className="figure">{formatAmount(block.receiptTotalCashPaise)}</td>
        <td data-col="r.bank" className="figure">{formatAmount(block.receiptTotalBankPaise)}</td>
        <td data-col="r.total" className="figure">{formatAmount(block.receiptTotalTotalPaise)}</td>

        <td data-col="p.detail" className="gutter label">શ્રી બંધ સિલક</td>
        <td data-col="p.ref" />
        <td data-col="p.cheque" />
        <td data-col="p.class" />
        <td data-col="p.cash" className="figure">{formatAmount(block.closingCashPaise)}</td>
        <td data-col="p.bank" className="figure">{formatAmount(block.closingBankPaise)}</td>
        <td data-col="p.total" className="figure">{formatAmount(block.closingTotalPaise)}</td>
      </tr>
      <GapRow rowKey={footer("closing")} group={ROW_GROUPS.rojmelFooter("closing")} />

      {/* શ્રી કુલ - must equal the receipt totals on the left. */}
      <tr className="footer-row grand" data-row={footer("grand")}
        data-row-group={ROW_GROUPS.rojmelFooter("grand")}
        data-fixed-height={heightSet(footer("grand"), ROW_GROUPS.rojmelFooter("grand")) ? "" : undefined}
      >
        <Blank side="r" />
        <td data-col="p.detail" className="gutter label">શ્રી કુલ</td>
        <td data-col="p.ref" />
        <td data-col="p.cheque" />
        <td data-col="p.class" />
        <td data-col="p.cash" className="figure">
          {formatAmount(block.spentCashPaise + block.closingCashPaise)}
        </td>
        <td data-col="p.bank" className="figure">
          {formatAmount(block.spentBankPaise + block.closingBankPaise)}
        </td>
        <td data-col="p.total" className="figure">
          {formatAmount(
            block.spentCashPaise + block.closingCashPaise + block.spentBankPaise + block.closingBankPaise,
          )}
        </td>
      </tr>
      <GapRow rowKey={footer("grand")} group={ROW_GROUPS.rojmelFooter("grand")} />

      <tr className="block-gap">
        <td colSpan={15} />
      </tr>
    </>
  );
}

/**
 * One half of a row: the receipt side ("r") or, across the gutter, the payment
 * side ("p"). Cells are named `r.detail`, `p.cash` and so on (REPORT_COLUMNS).
 */
function Half({ side, line }: { side: "r" | "p"; line: RojmelLine | null }): JSX.Element {
  if (!line) return <Blank side={side} />;
  const gutter = side === "p" ? " gutter" : "";
  // A grant (or interest) received is coloured from its words to its amounts,
  // so the money coming in stands out on the page; nothing else is.
  const credit = isGrantCredit(line) ? " grant-credit" : "";

  return (
    <>
      {side === "r" && (
        <td data-col="r.date" className="col-date">
          {line.dateText}
        </td>
      )}
      <td
        data-col={`${side}.detail`}
        className={(line.headingOnly ? "detail heading" : "detail") + gutter + credit}
      >
        {line.descriptionGu}
      </td>
      <td data-col={`${side}.ref`} className={"ref" + credit}>
        {side === "p" ? <VoucherRef text={line.referenceText} /> : line.referenceText}
      </td>
      <td data-col={`${side}.cheque`} className={"ref" + credit}>
        {line.chequeText}
      </td>
      <td data-col={`${side}.class`} className={credit.trim() || undefined} />
      <td data-col={`${side}.cash`} className={"figure" + credit}>
        {line.headingOnly ? "" : formatAmount(line.cashPaise)}
      </td>
      <td data-col={`${side}.bank`} className={"figure" + credit}>
        {line.headingOnly ? "" : formatAmount(line.bankPaise)}
      </td>
      <td data-col={`${side}.total`} className={"figure" + credit}>
        {line.headingOnly ? "" : formatAmount(line.totalPaise)}
      </td>
    </>
  );
}

/**
 * "1/3 11/07/24": the voucher number stands out, the date beside it does not -
 * so a sub-voucher (1/1, 1/2 ...) is found at a glance.
 */
function VoucherRef({ text }: { text: string }): JSX.Element {
  const space = text.indexOf(" ");
  if (space <= 0) return <strong className="voucher-no">{text}</strong>;
  return (
    <>
      <strong className="voucher-no">{text.slice(0, space)}</strong>
      {text.slice(space)}
    </>
  );
}

/** The empty cells of one side of a row that prints nothing. */
function Blank({ side }: { side: "r" | "p" }): JSX.Element {
  return (
    <>
      {side === "r" && <td data-col="r.date" />}
      <td data-col={`${side}.detail`} className={side === "p" ? "gutter" : undefined} />
      <td data-col={`${side}.ref`} />
      <td data-col={`${side}.cheque`} />
      <td data-col={`${side}.class`} />
      <td data-col={`${side}.cash`} />
      <td data-col={`${side}.bank`} />
      <td data-col={`${side}.total`} />
    </>
  );
}
