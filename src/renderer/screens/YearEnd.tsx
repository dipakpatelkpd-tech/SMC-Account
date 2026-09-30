import { useEffect, useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import type { FinancialYearDto, YearEndPreviewDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { IssueList } from "../components/IssueList.js";
import { Money } from "../components/Money.js";
import { amountToInput, formatDate, tryParseAmount } from "../format.js";
import { useStrings } from "../i18n/index.js";

/**
 * Year closing, and switching between years.
 *
 * Closing is the only action in the app that creates a second year of books, and
 * it is not undoable from any screen, so the whole thing is shown before it
 * happens: every head's closing balance, which becomes next year's opening
 * balance, and anything standing in the way.
 *
 * The refusals come from the service, not from here - a web build would get the
 * same ones. This screen's job is to show them in the school's language and to
 * make the consequence visible before the button is pressed.
 */
export function YearEnd(): JSX.Element {
  const t = useStrings();
  const [preview, setPreview] = useState<YearEndPreviewDto | null>(null);
  const [years, setYears] = useState<FinancialYearDto[]>([]);
  const [nextLabel, setNextLabel] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  // Next year's opening per head, as typed; starts as this year's closing.
  const [openings, setOpenings] = useState<Record<number, string>>({});

  useEffect(() => {
    void (async () => {
      try {
        const [nextPreview, nextYears] = await Promise.all([
          api.getYearEndPreview(),
          api.listFinancialYears(),
        ]);
        setPreview(nextPreview);
        setYears(nextYears);
        setNextLabel(nextPreview.suggestedNextLabel);
        setOpenings(
          Object.fromEntries(nextPreview.rows.map((row) => [row.grantHeadId, amountToInput(row.closingPaise)])),
        );
      } catch (cause) {
        setFailure(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (failure !== null) {
    return (
      <div className="state error">
        <p>{t.couldNotLoad}</p>
        <p className="num">{failure}</p>
      </div>
    );
  }

  if (loading || !preview) return <div className="state">{t.calculating}</div>;

  // What each head will open with, or null where the typed amount is not one.
  const openingOf = (row: YearEndPreviewDto["rows"][number]): number | null => {
    const typed = openings[row.grantHeadId];
    return typed === undefined ? row.closingPaise : tryParseAmount(typed);
  };
  const openingsValid = preview.rows.every((row) => {
    const paise = openingOf(row);
    return paise !== null && paise >= 0;
  });
  const totalOpening = preview.rows.reduce((sum, row) => sum + (openingOf(row) ?? 0), 0);

  const labelValid = /^\d{4}-\d{2}$/.test(nextLabel.trim());
  const labelTaken = preview.existingLabels.includes(nextLabel.trim());
  const closed = preview.year.status !== "OPEN";
  const canClose =
    !closed &&
    labelValid &&
    !labelTaken &&
    preview.blocking.length === 0 &&
    preview.cashPaise === 0 &&
    openingsValid &&
    !busy;

  async function closeYear(): Promise<void> {
    if (!canClose) return;
    if (!window.confirm(t.yearConfirmClose(preview!.year.label, nextLabel.trim()))) return;

    setBusy(true);
    // Only the heads the school changed; the rest carry their closing over.
    const changed = Object.fromEntries(
      preview!.rows
        .filter((row) => openingOf(row) !== row.closingPaise)
        .map((row) => [row.grantHeadId, openingOf(row)!]),
    );
    const result = await api.closeYear({ nextLabel: nextLabel.trim(), openings: changed });
    setBusy(false);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    // The main process rebinds to the new year and reloads the window, so there
    // is nothing to refetch here - the whole app comes back on the new year.
    setIssues([]);
  }

  async function switchTo(year: FinancialYearDto): Promise<void> {
    if (year.id === preview!.year.id || busy) return;
    setBusy(true);
    const result = await api.openYear(year.id);
    setBusy(false);
    if (!result.ok) setIssues(result.issues);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.yearEndTitle}</h2>
          <p>{t.yearEndSubtitle}</p>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <IssueList issues={issues} />
        </div>
      )}

      <section className="card">
        <h3>{t.yearEndClosingSection(preview.year.label, formatDate(preview.year.endDate))}</h3>
        <table>
          <thead>
            <tr>
              <th>{t.grantHead}</th>
              <th className="num">{t.yearEndClosing}</th>
              <th className="num">{t.yearEndNextOpening}</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const paise = openingOf(row);
              const changed = paise !== row.closingPaise;
              return (
                <tr key={row.headCode}>
                  <td>{row.headNameGu}</td>
                  <td className="num">
                    <Money paise={row.closingPaise} />
                  </td>
                  <td className="num">
                    {closed ? (
                      <Money paise={row.closingPaise} />
                    ) : (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                        {changed && paise !== null && (
                          <button
                            type="button"
                            className="ghost small"
                            title={t.yearEndOpeningReset}
                            onClick={() =>
                              setOpenings((current) => ({
                                ...current,
                                [row.grantHeadId]: amountToInput(row.closingPaise),
                              }))
                            }
                          >
                            {t.yearEndOpeningChanged} ↺
                          </button>
                        )}
                        <input
                          className="num-input"
                          inputMode="decimal"
                          style={{
                            width: 130,
                            textAlign: "right",
                            borderColor: paise === null || paise < 0 ? "var(--error-line)" : undefined,
                          }}
                          value={openings[row.grantHeadId] ?? ""}
                          onChange={(event) =>
                            setOpenings((current) => ({ ...current, [row.grantHeadId]: event.target.value }))
                          }
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>{t.total}</td>
              <td className="num">
                <Money paise={preview.totalClosingPaise} />
              </td>
              <td className="num">
                <Money paise={closed ? preview.totalClosingPaise : totalOpening} />
              </td>
            </tr>
          </tbody>
        </table>
        {!closed && <p className="muted">{t.yearEndNextOpeningHint}</p>}
      </section>

      <section className="card">
        <h3>{t.yearEndCloseSection}</h3>

        {closed && (
          <div className="issue warning">
            <div>{t.yearAlreadyClosed(preview.year.label)}</div>
          </div>
        )}

        {preview.blocking.length > 0 && (
          <>
            <div className="issue error">
              <div>{t.yearBlockedByErrors}</div>
            </div>
            <IssueList issues={preview.blocking} />
          </>
        )}

        {preview.cashPaise !== 0 && (
          <div className="issue error">
            <div>{t.yearBlockedByCash}</div>
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label>{t.yearNextLabel}</label>
            <input
              className="num-input"
              data-suggest="year.label"
              value={nextLabel}
              onChange={(event) => setNextLabel(event.target.value)}
            />
            {labelTaken && (
              <span className="muted" style={{ fontSize: 12, color: "var(--error-line)" }}>
                {t.yearLabelTaken}
              </span>
            )}
          </div>
        </div>

        <p className="muted">{t.yearCloseExplainer}</p>

        <div className="form-actions">
          <button className="primary" disabled={!canClose} onClick={() => void closeYear()}>
            {busy ? "…" : t.yearCloseButton}
          </button>
        </div>
      </section>

      <section className="card">
        <h3>{t.yearListSection}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {t.yearListHint}
        </p>
        <table>
          <thead>
            <tr>
              <th>{t.year}</th>
              <th>{t.date}</th>
              <th>{t.yearStatus}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year.id}>
                <td className="num">{year.label}</td>
                <td className="num">
                  {formatDate(year.startDate)} – {formatDate(year.endDate)}
                </td>
                <td>{year.status === "OPEN" ? t.yearOpen : t.yearClosed}</td>
                <td>
                  <div className="row-actions">
                    {year.id === preview.year.id ? (
                      <span className="muted">{t.yearCurrent}</span>
                    ) : (
                      <button className="ghost" disabled={busy} onClick={() => void switchTo(year)}>
                        {t.yearSwitchTo}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
