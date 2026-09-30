import type { JSX } from "react";
import type { FinancialYearDto, SchoolDto } from "../../shared/api.js";
import { toGujaratiDigits } from "../../lib/gujarati.js";

/**
 * The stacked heading both annexures carry (SPEC 6.8 and 6.9).
 *
 * Programme lines, the annexure number, the year, then the school and bank
 * identification rows. Shared so the two forms cannot drift apart - they are
 * meant to look like the same document with a different number on it.
 */
export function AnnexureBanner({
  school,
  year,
  numberGu,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  /** "૯" or "૧૦". */
  numberGu: string;
}): JSX.Element {
  const yearLabel = toGujaratiDigits(
    `${year.startDate.slice(0, 4)} / ${year.endDate.slice(0, 4)}`,
  );
  const [line1 = "", line2 = ""] = school.programmeGu.split(/\s*\/\s*|\n/);

  return (
    <table className="banner" data-part="banner">
      <tbody>
        <tr>
          <td colSpan={4} className="banner-title">
            {line1}
          </td>
        </tr>
        <tr>
          <td colSpan={4}>{line2}</td>
        </tr>
        <tr>
          <td colSpan={4}>પરિશિષ્ટ –: {numberGu}</td>
        </tr>
        <tr>
          <td colSpan={4}>વર્ષ –: {yearLabel}</td>
        </tr>
        <tr>
          <td className="label">શાળાનું નામ –:</td>
          <td className="value">{school.nameGu}</td>
          <td className="label">ડાયસ કોડ–:</td>
          {/* An identifier, not a quantity - Latin digits, as on the original. */}
          <td className="value">{school.diseCode}</td>
        </tr>
        <tr>
          <td className="label">કલસ્ટર –:</td>
          <td className="value">{school.clusterGu}</td>
          <td className="label">તાલુકો–:</td>
          <td className="value">{school.talukaGu}</td>
        </tr>
        <tr>
          <td className="label">BOB ખાતા નંબર –:</td>
          <td className="value" colSpan={3}>
            {school.bankAccountNo}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
