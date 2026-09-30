import type { JSX, ReactNode } from "react";
import type { Annexure9 } from "../../engine/types.js";
import type { FinancialYearDto, SchoolDto } from "../../shared/api.js";
import { formatAmount } from "../../lib/money.js";
import { formatDate } from "../../lib/dates.js";
import { toGujaratiDigits } from "../../lib/gujarati.js";
import { AnnexureBanner } from "./AnnexureBanner.js";
import { GapRow, LayoutColGroup } from "./layout-context.js";
import type { ANNEXURE9_ROWS } from "../../shared/report-layout.js";

/**
 * પરિશિષ્ટ ૯ — bank reconciliation (SPEC 6.8).
 *
 *   ૧ (+) રોજમેળ પ્રમાણે સિલક                       A
 *         ૧ ચેક ઈસ્યુ થયા હોય પરંતુ વટાવેલ ન હોય      B
 *         ૨ બેંક માં જમા નોંધ થઈ હોય પરંતુ…           C
 *         કુલ                                        A + B + C
 *   (–)   બાદ કરવું
 *         ૧ બેંકમાં મોકલવામાં આવેલી રોકડ…             D
 *         ૨ બેંક ખાતામાં ઉધારવામાં આવેલ ચાર્જિસ…      E
 *         કુલ                                        D + E
 *   પાસબુક પ્રમાણે સિલક                              A + B + C − D − E
 *
 * The last line is COMPUTED. The client's own workbook copies A into it, which
 * makes the statement reconcile by construction and tells nobody anything
 * (SPEC 9.9). When the computed figure and the passbook figure the school
 * entered disagree, the form says so rather than hiding it.
 */
export function Annexure9Page({
  school,
  year,
  report,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  report: Annexure9;
}): JSX.Element {
  const money = (paise: number): string => toGujaratiDigits(formatAmount(paise));
  const endDate = toGujaratiDigits(formatDate(year.endDate));

  return (
    <div className="sheet">
      <AnnexureBanner school={school} year={year} numberGu="૯" />

      <div className="annexure-heading" data-part="heading">બેંક સાથે મેળવણું – રીકન્સીલિએશન</div>

      <table className="form reconciliation" data-layout="">
        <LayoutColGroup />
        <tbody>
          <Line k="cashbook" marker="૧ (+)" text={`રોજમેળ પ્રમાણે તા– ${endDate} ની સિલક ઉમેરવી`}>
            {money(report.cashbookBankPaise)}
          </Line>
          <Line k="notCashed" index="૧" text="ચેક ઈસ્યુ થયા હોય પરંતુ વટાવેલ ન હોય">
            {money(report.chequesIssuedNotCashedPaise)}
          </Line>
          <Line k="notInCashbook" index="૨" text="બેંક માં જમા નોંધ થઈ હોય પરંતુ રોજમેળમાં દર્શાવ્યું ન હોય">
            {money(report.creditsInBankNotInCashbookPaise)}
          </Line>
          <Line k="addTotal" className="subtotal" text="કુલ" right>
            {money(report.subtotalPaise)}
          </Line>

          <Line k="deduct" marker="(–)" text="બાદ કરવું" />
          <Line k="notCredited" index="૧" text="બેંકમાં મોકલવામાં આવેલી રોકડ કે ચેક બેંક ખાતામાં જમા ન થઈ હોય">
            {money(report.depositsNotYetCreditedPaise)}
          </Line>
          <Line
            k="charges"
            index="૨"
            text="બેંક ખાતામાં ઉધારવામાં આવેલ ચાર્જિસ પરંતુ તે રોજમેળમાં ઉલ્લેખ થયેલ ન હોય"
          >
            {money(report.bankChargesNotInCashbookPaise)}
          </Line>
          <Line k="deductTotal" className="subtotal" text="કુલ" right>
            {money(report.deductionsPaise)}
          </Line>

          <Line k="passbook" className="grand" text={`પાસબુક / બેંક સ્ટેટમેન્ટ પ્રમાણે તા –: ${endDate} સિલક`}>
            {money(report.computedPassbookPaise)}
          </Line>
        </tbody>
      </table>

      {/*
        SPEC 6.8: warn when the computed passbook balance does not equal the one
        the school read off the passbook. Printed on the form, not just shown on
        screen, so the reviewer sees it too.
      */}
      {!report.matches && (
        <div className="reconciliation-warning">
          ધ્યાન આપો: પાસબુક પ્રમાણે દાખલ કરેલ સિલક{" "}
          <strong>{money(report.enteredPassbookPaise)}</strong> છે, જ્યારે ઉપરની ગણતરી{" "}
          <strong>{money(report.computedPassbookPaise)}</strong> બતાવે છે. તફાવત તપાસો.
        </div>
      )}

      <div className="signatures" data-part="signatures">
        <div>સભ્ય સચિવ</div>
        <div>અધ્યક્ષશ્રી</div>
        <div>સી.આર.સી. કો.ઓર્ડિનેટર</div>
      </div>
    </div>
  );
}

/**
 * One line of the statement: the (+)/(–) marker, the item number, the words and
 * the amount. Keyed by the form's own rows (ANNEXURE9_ROWS), so a school's
 * highlight or spacing stays on "bank charges" whatever the figures are.
 */
function Line({
  k,
  marker = "",
  index = "",
  text,
  right = false,
  className,
  children,
}: {
  k: (typeof ANNEXURE9_ROWS)[number];
  marker?: string;
  index?: string;
  text: string;
  right?: boolean;
  className?: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <>
      <tr className={className} data-row={k}>
        <td data-col="marker" className="marker">
          {marker}
        </td>
        <td data-col="index" className="index">
          {index}
        </td>
        <td data-col="detail" className={right ? "right" : undefined}>
          {text}
        </td>
        <td data-col="amount" className="figure">
          {children}
        </td>
      </tr>
      <GapRow rowKey={k} />
    </>
  );
}
