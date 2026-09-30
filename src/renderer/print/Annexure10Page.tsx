import type { JSX } from "react";
import type { Annexure10 } from "../../engine/types.js";
import type { SchoolDto, FinancialYearDto } from "../../shared/api.js";
import { formatAmount } from "../../lib/money.js";
import { toGujaratiDigits } from "../../lib/gujarati.js";
import { PagedSheets } from "./PagedSheets.js";
import { ROW_KEYS } from "../../shared/report-layout.js";
import { bankShortName } from "./AnnexureBanner.js";

/**
 * પરિશિષ્ટ ૧૦ — the annual grant statement (SPEC 6.9).
 *
 * Reproduces reference/07_annexure_10_grant_summary.pdf: the stacked banner, one
 * row per grant head in print order, a કુલ total row, and the certificate
 * paragraph with the totals written into it.
 *
 * Everything prints in GUJARATI DIGITS, including the amounts and the year -
 * only the Rojmel uses Latin digits (SPEC section 6). The DISE code and bank
 * account number stay Latin because they are identifiers, not quantities, and
 * the original prints them that way.
 *
 * This page is always Gujarati whatever the interface language is set to: it is
 * a statutory form, not application chrome.
 */
export function Annexure10Page({
  school,
  year,
  report,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  report: Annexure10;
}): JSX.Element {
  /** An amount, two decimals, in Gujarati digits. */
  const money = (paise: number): string => toGujaratiDigits(formatAmount(paise));

  /** "2025-26" as the form writes it: ૨૦૨૫ / ૨૦૨૬ */
  const yearLabel = toGujaratiDigits(`${year.startDate.slice(0, 4)} / ${year.endDate.slice(0, 4)}`);

  const [programmeLine1 = "", programmeLine2 = ""] = school.programmeGu.split(/\s*\/\s*|\n/);
  const totals = report.totals;

  /** The year's last day as the heading writes it, "૩૧/૦૩/૨૬" - never a fixed year. */
  const closingDateLabel = toGujaratiDigits(
    `${year.endDate.slice(8, 10)}/${year.endDate.slice(5, 7)}/${year.endDate.slice(2, 4)}`,
  );

  // One portrait sheet at 14pt, as the client prints it; a school with more
  // heads than fit runs on to a second, banner repeated (PagedSheets).
  return (
    <PagedSheets
      landscape={false}
      head={() => (
        <table className="banner" data-part="banner">
          <tbody>
            <tr>
              <td colSpan={4} className="banner-title">
                {programmeLine1}
              </td>
            </tr>
            <tr>
              <td colSpan={4}>{programmeLine2}</td>
            </tr>
            <tr>
              <td colSpan={4}>પરિશિષ્ટ –: ૧૦</td>
            </tr>
            <tr>
              <td colSpan={4}>વર્ષ –: {yearLabel}</td>
            </tr>
            <tr>
              <td className="label">શાળાનું નામ –:</td>
              <td className="value">{school.nameGu}</td>
              <td className="label">ડાયસ કોડ–:</td>
              <td className="value">{school.diseCode}</td>
            </tr>
            <tr>
              <td className="label">કલસ્ટર –:</td>
              <td className="value">{school.clusterGu}</td>
              <td className="label">તાલુકો–:</td>
              <td className="value">{school.talukaGu}</td>
            </tr>
            <tr>
              <td className="label">{bankShortName(school.bankNameGu)} ખાતા નંબર –:</td>
              <td className="value" colSpan={3}>
                {school.bankAccountNo}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      tableClassName="form annexure10"
      thead={
        <tr data-row="head">
          <th data-col="serial">ક્રમ</th>
          <th data-col="head">વિગત</th>
          <th data-col="opening">શરૂની સિલક</th>
          <th data-col="received">વર્ષ દરમ્યાન મળેલ ગ્રાન્ટ</th>
          <th data-col="total">કુલ</th>
          <th data-col="spent">ખર્ચ</th>
          <th data-col="returned">પરત કરેલ ગ્રાન્ટ</th>
          <th data-col="totalOut">કુલ ખર્ચ</th>
          <th data-col="closing">
            <span style={{ whiteSpace: "nowrap" }}>{closingDateLabel}</span> ની બંધ સિલક
          </th>
        </tr>
      }
      rows={report.rows.map((row, index) => ({
        key: ROW_KEYS.grantHead(row.headCode),
        cells: (
          <>
            <td data-col="serial" className="centre">{toGujaratiDigits(String(index + 1))}</td>
            <td data-col="head">{row.nameGu}</td>
            <td data-col="opening" className="figure">{money(row.openingPaise)}</td>
            <td data-col="received" className="figure">{money(row.receivedPaise)}</td>
            <td data-col="total" className="figure">{money(row.totalPaise)}</td>
            <td data-col="spent" className="figure">{money(row.spentPaise)}</td>
            <td data-col="returned" className="figure">{money(row.returnedPaise)}</td>
            <td data-col="totalOut" className="figure">{money(row.totalOutPaise)}</td>
            <td data-col="closing" className="figure">{money(row.closingPaise)}</td>
          </>
        ),
      }))}
      lastRows={
        <tr data-row={ROW_KEYS.total}>
          <td data-col="serial" className="centre" />
          <td data-col="head" className="centre">
            <strong>કુલ</strong>
          </td>
          <td data-col="opening" className="figure">
            <strong>{money(totals.openingPaise)}</strong>
          </td>
          <td data-col="received" className="figure">
            <strong>{money(totals.receivedPaise)}</strong>
          </td>
          <td data-col="total" className="figure">
            <strong>{money(totals.totalPaise)}</strong>
          </td>
          <td data-col="spent" className="figure">
            <strong>{money(totals.spentPaise)}</strong>
          </td>
          <td data-col="returned" className="figure">
            <strong>{money(totals.returnedPaise)}</strong>
          </td>
          <td data-col="totalOut" className="figure">
            <strong>{money(totals.totalOutPaise)}</strong>
          </td>
          <td data-col="closing" className="figure">
            <strong>{money(totals.closingPaise)}</strong>
          </td>
        </tr>
      }
      foot={
        <>
          {/* SPEC 6.9: the certificate, with the totals written into the sentence. */}
          <div className="certificate" data-part="certificate">
            આથી પ્રમાણપત્ર આપવામાં આવે છે કે સમગ્ર શિક્ષા અંતર્ગત વર્ષ {yearLabel} દરમ્યાન
            એસ.એમ.સી.ઈ કક્ષાએ શરૂની સિલક રૂા.{" "}
            <span className="blank">{money(totals.openingPaise)}</span> વર્ષ દરમ્યાન મળેલ ગ્રાન્ટ
            રૂા. <span className="blank">{money(totals.receivedPaise)}</span> કુલ ગ્રાન્ટ રૂા.{" "}
            <span className="blank">{money(totals.totalPaise)}</span> તથા ગ્રાન્ટ પૈકી કુલ ખર્ચ રૂા.{" "}
            <span className="blank">{money(totals.totalOutPaise)}</span> થયેલ છે. અગાઉના વર્ષ સહિત
            ૩૧મી માર્ચના રોજ બચત રૂા. <span className="blank">{money(totals.closingPaise)}</span>{" "}
            એસ.એમ.સી.ઈ કક્ષાએ જમા રહેલ છે. સદર આવક તથા ખર્ચ હિસાબી રેકર્ડ પરથી ખરાઈ કરેલ છે. જે આપ
            સાહેબશ્રીને વિદિત થાય.
          </div>

          {/* Signed by hand, as on the original (SPEC 11.12). */}
          <div className="signatures" data-part="signatures">
            <div>સભ્ય સચિવ</div>
            <div>અધ્યક્ષશ્રી</div>
            <div>સી.આર.સી. કો.ઓર્ડિનેટર</div>
          </div>
        </>
      }
    />
  );
}
