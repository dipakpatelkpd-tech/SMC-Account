import { Fragment, useContext, useLayoutEffect, useRef } from "react";
import type { JSX } from "react";
import type { Ledger } from "../../engine/types.js";
import type { FinancialYearDto, SchoolDto } from "../../shared/api.js";
import { formatAmount } from "../../lib/money.js";
import { formatDate } from "../../lib/dates.js";
import { toGujaratiDigits } from "../../lib/gujarati.js";
import { PrintLayoutGate } from "./PagedSheets.js";
import { GapRow, LayoutColGroup, layoutFontsReady, useReportLayout, Text } from "./layout-context.js";
import { ROW_GROUPS, ROW_KEYS, ledgerRowKeys } from "../../shared/report-layout.js";
import { arrangeLedgers } from "../../shared/ledger-layout.js";

/**
 * ખાતાવહી — the ledger, one account per grant head (SPEC 6.2).
 *
 * Four accounts to a landscape sheet, two across and two down, as the client's
 * book prints it. Which four share a sheet and which sits on top is chosen by
 * each account's length (shared/ledger-layout.ts), so long and short accounts
 * share a sheet and its two columns come out about equally tall.
 *
 * All four stay on their sheet: an account never runs on to the next one. When
 * the four are taller than the sheet - a long year, or large type - the sheet's
 * grid is made smaller until it fits, the way Excel's "fit to page" does.
 *
 * The રોજમેળ પાનું column is the reason the cash book had to be paginated
 * first: it prints the rojmel page each entry appears on.
 *
 * Gujarati digits throughout (SPEC §6).
 */

/** Blank rows under the entries, room to write in by hand as the book allows. */
const MINIMUM_BODY_ROWS = 7;

/** The smallest a sheet's grid is made to keep its four accounts on it. */
const SMALLEST_FIT = 0.4;

export function KhatavahiPages({
  school,
  year,
  ledgers,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  ledgers: Ledger[];
}): JSX.Element {
  // Size: the rows an account prints - its entries or the blank minimum, and its closing row.
  const sheets = arrangeLedgers(ledgers.map((account) => Math.max(MINIMUM_BODY_ROWS, account.rows.length) + 1));

  return (
    <>
      {sheets.map((columns, index) => (
        <LedgerSheet key={index} school={school}>
          {columns.map((column, side) => (
            <div className="khatavahi-column" key={side}>
              {column.map((accountIndex) => (
                <Account key={ledgers[accountIndex]!.headCode} account={ledgers[accountIndex]!} year={year} />
              ))}
            </div>
          ))}
        </LedgerSheet>
      ))}
    </>
  );
}

/**
 * One sheet: the title, the 2 x 2 grid, the title again at the foot. The grid
 * is measured once laid out and zoomed down if it is taller than the room
 * between the two titles; the PDF waits for that (PrintLayoutGate).
 */
function LedgerSheet({ school, children }: { school: SchoolDto; children: JSX.Element[] }): JSX.Element {
  const gate = useContext(PrintLayoutGate);
  const layout = useReportLayout();
  const sheetRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const version = layout?.version ?? "";

  useLayoutEffect(() => {
    const done = gate?.begin();
    let cancelled = false;
    void layoutFontsReady(layout?.layout).then(() => {
      const sheet = sheetRef.current;
      const grid = gridRef.current;
      if (cancelled || !sheet || !grid) {
        done?.();
        return;
      }
      // Sizes in the sheet's own pixels: offset sizes ignore zoom.
      grid.style.zoom = "";
      grid.style.width = "";
      // The room between the head title and the foot one. The foot title is
      // pushed to the bottom of the sheet (margin-top: auto), so the space it
      // keeps from the grid is its least gap, not what its margin is now.
      const foot = sheet.querySelector<HTMLElement>(":scope > .khatavahi-title.foot");
      const room =
        parseFloat(getComputedStyle(sheet).minHeight) -
        grid.offsetTop -
        (foot ? foot.offsetHeight + FOOT_GAP_PX : 0) -
        2;
      // The largest zoom at which the grid fits. Zooming changes how wide the
      // grid is laid out, and so how its text wraps and how tall it is, so the
      // zoom is found in a few rounds rather than worked out once.
      const tryZoom = (zoom: number): number => {
        grid.style.zoom = zoom === 1 ? "" : String(zoom);
        // A pixel width is zoomed with the grid; a percentage would not be.
        grid.style.width = zoom === 1 ? "" : `${sheet.clientWidth / zoom}px`;
        return grid.offsetHeight * zoom;
      };
      // Halving the range between a zoom that fits and one that does not:
      // eight rounds find it to within half a percent.
      if (tryZoom(1) > room) {
        let fits = SMALLEST_FIT;
        let tooBig = 1;
        for (let round = 0; round < 8; round += 1) {
          const middle = (fits + tooBig) / 2;
          if (tryZoom(middle) <= room) fits = middle;
          else tooBig = middle;
        }
        tryZoom(fits);
      }
      done?.();
    });
    return () => {
      cancelled = true;
      done?.();
    };
    // Re-measured whenever the layout changes: fonts, sizes, widths, heights.
  }, [version]);

  return (
    <div className="sheet landscape khatavahi-sheet" ref={sheetRef}>
      <div className="khatavahi-title" data-part="title">{school.smcLabelGu}</div>
      <div className="khatavahi-grid" ref={gridRef}>
        {children}
      </div>
      <div className="khatavahi-title foot" data-part="footTitle">{school.smcLabelGu}</div>
    </div>
  );
}

/** The least space above the foot title: 2.5mm, as print.css gives it. */
const FOOT_GAP_PX = (2.5 * 96) / 25.4;

function Account({ account, year }: { account: Ledger; year: FinancialYearDto }): JSX.Element {
  const money = (paise: number): string => toGujaratiDigits(formatAmount(paise));
  const date = (iso: string): string => toGujaratiDigits(formatDate(iso));
  const gu = (text: string): string => toGujaratiDigits(text);

  const yearLabel = gu(`${year.startDate.slice(0, 4)} – ${year.endDate.slice(0, 4)}`);
  const blanks = Math.max(0, MINIMUM_BODY_ROWS - account.rows.length);
  const lastPage = account.rows.at(-1)?.rojmelPage ?? null;
  const keys = ledgerRowKeys(account.headCode, account.rows);
  const closingKey = ROW_KEYS.ledgerClosing(account.headCode);

  return (
    <div className="khatavahi-account">
      <div className="account-head">
        <div className="account-kind" data-part="accountKind">
          <Text id="khatavahi.kind">સામાન્ય ( જનરલ ) ખાતાવહી</Text>
        </div>
        <div className="account-meta" data-part="accountMeta">
          <span>
            <Text id="khatavahi.account">ખાતાનું નામ –:</Text> {account.nameGu}
          </span>
          <span>
            <Text id="khatavahi.year">વર્ષ –:</Text> {yearLabel}
          </span>
        </div>
      </div>
      <table className="form khatavahi" data-layout="">
        <LayoutColGroup />
        <thead>
          <tr data-row="head">
            <th data-col="date"><Text id="col:date">તારીખ</Text></th>
            <th data-col="page"><Text id="col:page">રોજમેળ પાનું</Text></th>
            <th data-col="detail"><Text id="col:detail">વિગત</Text></th>
            <th data-col="credit"><Text id="col:credit">જમા</Text></th>
            <th data-col="debit"><Text id="col:debit">ઉધાર</Text></th>
            <th data-col="creditBalance"><Text id="col:creditBalance">જમા બાકી</Text></th>
            <th data-col="debitBalance"><Text id="col:debitBalance">ઉધાર બાકી</Text></th>
          </tr>
        </thead>
        <tbody>
          {account.rows.map((row, index) => (
            <Fragment key={keys[index]}>
              <tr data-row={keys[index]} data-row-group={ROW_GROUPS.ledgerRow(index)}>
                <td data-col="date" className="centre">{date(row.date)}</td>
                <td data-col="page" className="centre">
                  {row.rojmelPage === null ? "" : gu(String(row.rojmelPage))}
                </td>
                <td data-col="detail" className="detail">{row.descriptionGu}</td>
                <td data-col="credit" className="figure">{money(row.creditPaise)}</td>
                <td data-col="debit" className="figure">{money(row.debitPaise)}</td>
                <td data-col="creditBalance" className="figure">{money(row.creditBalancePaise)}</td>
                <td data-col="debitBalance" className="figure">{money(row.debitBalancePaise)}</td>
              </tr>
              <GapRow rowKey={keys[index]!} group={ROW_GROUPS.ledgerRow(index)} />
            </Fragment>
          ))}
          {Array.from({ length: blanks }, (_, index) => {
            const key = ROW_KEYS.ledgerBlank(account.headCode, index);
            const group = ROW_GROUPS.ledgerRow(account.rows.length + index);
            return (
              <Fragment key={key}>
                <tr data-row={key} data-row-group={group}>
                  <td data-col="date" />
                  <td data-col="page" />
                  <td data-col="detail" />
                  <td data-col="credit" />
                  <td data-col="debit" />
                  <td data-col="creditBalance" />
                  <td data-col="debitBalance" />
                </tr>
                <GapRow rowKey={key} group={group} />
              </Fragment>
            );
          })}
          {/* The closing row carries the column totals, as the form does. */}
          <tr className="closing-row" data-row={closingKey} data-row-group={ROW_GROUPS.ledgerClosing}>
            <td data-col="date" className="centre">{date(year.endDate)}</td>
            <td data-col="page" className="centre">{lastPage === null ? "" : gu(String(lastPage))}</td>
            <td data-col="detail" className="detail centre">
              <strong><Text id="khatavahi.closing">બંધ સિલક</Text></strong>
            </td>
            <td data-col="credit" className="figure">{money(account.totalCreditPaise)}</td>
            <td data-col="debit" className="figure">{money(account.totalDebitPaise)}</td>
            <td data-col="creditBalance" className="figure">
              {money(account.closingPaise >= 0 ? account.closingPaise : 0)}
            </td>
            <td data-col="debitBalance" className="figure">
              {money(account.closingPaise < 0 ? -account.closingPaise : 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
