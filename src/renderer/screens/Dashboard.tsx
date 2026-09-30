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
        <Tile variant="bank" label={t.closingBank} paise={yearEnd.bankPaise} />
        <Tile variant="cash" label={t.closingCash} paise={yearEnd.cashPaise} />
        <Tile variant="received" label={t.receivedInYear} paise={annexure10.totals.receivedPaise} />
        <Tile variant="spent" label={t.totalSpent} paise={annexure10.totals.totalOutPaise} />
      </div>

      <div className="card">
        <h3>{t.annexure10Title}</h3>
        <div className="table-wrap" style={{ margin: 0 }}>
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
                  <td style={{ fontWeight: 500 }}>{row.nameGu}</td>
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
                  <td className="num" style={{ fontWeight: 600 }}>
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
      </div>

      <div className="card">
        <h3>
          {t.validation}{" "}
          {errors.length > 0 && (
            <span style={{ color: "var(--error-line)" }}>{t.errorCount(errors.length)}</span>
          )}
        </h3>
        {issues.length === 0 ? (
          <div className="issue success">
            <span>✓</span>
            <div>{t.noIssues}</div>
          </div>
        ) : (
          <IssueList issues={issues} />
        )}
        {counts.unpaidBills > 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            {t.unpaidBillsNote(counts.unpaidBills)}{" "}
            <button className="ghost small" onClick={() => onNavigate("bills")}>
              {t.viewBills}
            </button>
          </p>
        )}
      </div>
    </>
  );
}

function Tile({ label, paise, variant }: { label: string; paise: number; variant?: string }): JSX.Element {
  return (
    <div className={`tile ${variant ? `tile-${variant}` : ""}`}>
      <div className="label">{label}</div>
      <div className="value">
        <Money paise={paise} />
      </div>
    </div>
  );
}
