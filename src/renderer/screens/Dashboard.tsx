import type { DashboardDto } from "../../shared/api.js";
import type { ScreenId } from "../App.js";
import { Money } from "../components/Money.js";
import { IssueList } from "../components/IssueList.js";
import { formatDate } from "../format.js";
import { useStrings } from "../i18n/index.js";
import type { JSX } from "react";

/**
 * The year at a glance: પરિશિષ્ટ ૧૦ as it currently stands, the closing balance,
 * and anything validation has to say.
 *
 * Every figure comes from the engine, so what the user sees here is exactly what
 * the printed annexure will say - there is no second calculation to disagree.
 */
export function Dashboard({
  data,
  onNavigate,
}: {
  data: DashboardDto;
  onNavigate: (screen: ScreenId) => void;
}): JSX.Element {
  const t = useStrings();
  const { annexure10, yearEnd, counts, issues, year, school } = data;
  const errors = issues.filter((issue) => issue.severity === "error");

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{school.nameGu}</h2>
          <p>
            {school.clusterGu} · {school.talukaGu} · {t.diseCode} {school.diseCode}
          </p>
        </div>
        <p className="num">
          {formatDate(year.startDate)} – {formatDate(year.endDate)}
        </p>
      </div>

      <div className="tiles">
        <Tile label={t.closingBank} paise={yearEnd.bankPaise} />
        <Tile label={t.closingCash} paise={yearEnd.cashPaise} />
        <Tile label={t.receivedInYear} paise={annexure10.totals.receivedPaise} />
        <Tile label={t.totalSpent} paise={annexure10.totals.totalOutPaise} />
      </div>

      <div className="card">
        <h3>{t.annexure10Title}</h3>
        <table>
          <thead>
            <tr>
              <th>{t.colParticulars}</th>
              <th className="num">{t.colOpening}</th>
              <th className="num">{t.colReceived}</th>
              <th className="num">{t.colTotal}</th>
              <th className="num">{t.colSpent}</th>
              <th className="num">{t.colReturned}</th>
              <th className="num">{t.colTotalOut}</th>
              <th className="num">{t.colClosing}</th>
            </tr>
          </thead>
          <tbody>
            {annexure10.rows.map((row) => (
              <tr key={row.headCode}>
                <td>{row.nameGu}</td>
                <td className="num">
                  <Money paise={row.openingPaise} />
                </td>
                <td className="num">
                  <Money paise={row.receivedPaise} />
                </td>
                <td className="num">
                  <Money paise={row.totalPaise} />
                </td>
                <td className="num">
                  <Money paise={row.spentPaise} />
                </td>
                <td className="num">
                  <Money paise={row.returnedPaise} />
                </td>
                <td className="num">
                  <Money paise={row.totalOutPaise} />
                </td>
                <td className="num">
                  <Money paise={row.closingPaise} />
                </td>
              </tr>
            ))}
            <tr className="total-row">
              <td>{t.total}</td>
              <td className="num">
                <Money paise={annexure10.totals.openingPaise} />
              </td>
              <td className="num">
                <Money paise={annexure10.totals.receivedPaise} />
              </td>
              <td className="num">
                <Money paise={annexure10.totals.totalPaise} />
              </td>
              <td className="num">
                <Money paise={annexure10.totals.spentPaise} />
              </td>
              <td className="num">
                <Money paise={annexure10.totals.returnedPaise} />
              </td>
              <td className="num">
                <Money paise={annexure10.totals.totalOutPaise} />
              </td>
              <td className="num">
                <Money paise={annexure10.totals.closingPaise} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>
          {t.validation}{" "}
          {errors.length > 0 && (
            <span style={{ color: "var(--error-line)" }}>{t.errorCount(errors.length)}</span>
          )}
        </h3>
        <IssueList issues={issues} />
        {counts.unpaidBills > 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            {t.unpaidBillsNote(counts.unpaidBills)}{" "}
            <button className="ghost" onClick={() => onNavigate("bills")}>
              {t.viewBills}
            </button>
          </p>
        )}
      </div>
    </>
  );
}

function Tile({ label, paise }: { label: string; paise: number }): JSX.Element {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">
        <Money paise={paise} />
      </div>
    </div>
  );
}
