import type { JSX } from "react";
import type { Ledger } from "../../engine/types.js";
import type { FinancialYearDto, SchoolDto } from "../../shared/api.js";
import { formatAmount } from "../../lib/money.js";
import { formatDate } from "../../lib/dates.js";
import { toGujaratiDigits } from "../../lib/gujarati.js";
import { PagedSheets } from "./PagedSheets.js";
import { ROW_KEYS, ledgerRowKeys } from "../../shared/report-layout.js";

/**
 * ખાતાવહી — the ledger, one account per grant head (SPEC 6.2).
 *
 * One account to a landscape sheet. The reference book fits four to a sheet,
 * two across and two down, in 7pt type; at the 14pt the forms now use
 * (docs/DECISIONS.md, "Report font size") an account needs the full width of
 * the sheet for its seven columns. An account with more entries than a sheet
 * holds runs on to the next, repeating its heading, so an entry is never
 * printed without saying whose account it is.
 *
 * The રોજમેળ પાનું column is the reason the cash book had to be paginated
 * first: it prints the rojmel page each entry appears on.
 *
 * Gujarati digits throughout (SPEC §6).
 */

/** Blank rows under the entries, room to write in by hand as the book allows. */
const MINIMUM_BODY_ROWS = 7;

export function KhatavahiPages({
  school,
  year,
  ledgers,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  ledgers: Ledger[];
}): JSX.Element {
  return (
    <>
      {ledgers.map((account) => (
        <Account key={account.headCode} account={account} school={school} year={year} />
      ))}
    </>
  );
}

function Account({
  account,
  school,
  year,
}: {
  account: Ledger;
  school: SchoolDto;
  year: FinancialYearDto;
}): JSX.Element {
  const money = (paise: number): string => toGujaratiDigits(formatAmount(paise));
  const date = (iso: string): string => toGujaratiDigits(formatDate(iso));
  const gu = (text: string): string => toGujaratiDigits(text);

  const yearLabel = gu(`${year.startDate.slice(0, 4)} – ${year.endDate.slice(0, 4)}`);
  const blanks = Math.max(0, MINIMUM_BODY_ROWS - account.rows.length);
  const lastPage = account.rows.at(-1)?.rojmelPage ?? null;
  const keys = ledgerRowKeys(account.headCode, account.rows);

  return (
    <PagedSheets
      landscape
      head={() => (
        <>
          <div className="khatavahi-title" data-part="title">{school.smcLabelGu}</div>
          <div className="account-head">
            <div className="account-kind" data-part="accountKind">સામાન્ય ( જનરલ ) ખાતાવહી</div>
            <div className="account-meta" data-part="accountMeta">
              <span>ખાતાનું નામ –: {account.nameGu}</span>
              <span>વર્ષ –: {yearLabel}</span>
            </div>
          </div>
        </>
      )}
      tableClassName="form khatavahi"
      thead={
        <tr data-row="head">
          <th data-col="date">તારીખ</th>
          <th data-col="page">રોજમેળ પાનું</th>
          <th data-col="detail">વિગત</th>
          <th data-col="credit">જમા</th>
          <th data-col="debit">ઉધાર</th>
          <th data-col="creditBalance">જમા બાકી</th>
          <th data-col="debitBalance">ઉધાર બાકી</th>
        </tr>
      }
      rows={[
        ...account.rows.map((row, index) => ({
          key: keys[index]!,
          cells: (
            <>
              <td data-col="date" className="centre">{date(row.date)}</td>
              <td data-col="page" className="centre">
                {row.rojmelPage === null ? "" : gu(String(row.rojmelPage))}
              </td>
              <td data-col="detail" className="detail">{row.descriptionGu}</td>
              <td data-col="credit" className="figure">{money(row.creditPaise)}</td>
              <td data-col="debit" className="figure">{money(row.debitPaise)}</td>
              <td data-col="creditBalance" className="figure">{money(row.creditBalancePaise)}</td>
              <td data-col="debitBalance" className="figure">{money(row.debitBalancePaise)}</td>
            </>
          ),
        })),
        ...Array.from({ length: blanks }, (_, index) => ({
          key: ROW_KEYS.ledgerBlank(account.headCode, index),
          cells: (
            <>
              <td data-col="date" />
              <td data-col="page" />
              <td data-col="detail" />
              <td data-col="credit" />
              <td data-col="debit" />
              <td data-col="creditBalance" />
              <td data-col="debitBalance" />
            </>
          ),
        })),
      ]}
      lastRows={
        // The closing row carries the column totals, as the form does.
        <tr className="closing-row" data-row={ROW_KEYS.ledgerClosing(account.headCode)}>
          <td data-col="date" className="centre">{date(year.endDate)}</td>
          <td data-col="page" className="centre">{lastPage === null ? "" : gu(String(lastPage))}</td>
          <td data-col="detail" className="detail centre">
            <strong>બંધ સિલક</strong>
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
      }
      everyFoot={<div className="khatavahi-title foot" data-part="footTitle">{school.smcLabelGu}</div>}
    />
  );
}
