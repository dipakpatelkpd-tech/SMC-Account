import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { OpeningBalanceDto } from "../../shared/api.js";
import { Money } from "../components/Money.js";
import { amountToInput, tryParseAmount } from "../format.js";
import { useStrings } from "../i18n/index.js";
import type { JSX } from "react";

/**
 * ઉઘડતી સિલક - last year's closing, per grant head (SPEC 4.2).
 *
 * Edited in place: there is exactly one row per head and the user is filling in
 * a known list, not creating records, so a form per row would only get in the
 * way. Cash is shown even though it is zero in practice - SPEC 11.8 is still
 * open with the client and hiding the column would presume the answer.
 */
export function OpeningBalances({ onChanged }: { onChanged: () => void }): JSX.Element {
  const t = useStrings();
  const [rows, setRows] = useState<OpeningBalanceDto[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { bank: string; cash: string }>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload(): Promise<void> {
    const next = await api.listOpeningBalances();
    setRows(next);
    setDrafts(
      Object.fromEntries(
        next.map((row) => [
          row.grantHeadId,
          { bank: amountToInput(row.bankPaise), cash: amountToInput(row.cashPaise) },
        ]),
      ),
    );
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function save(row: OpeningBalanceDto): Promise<void> {
    const draft = drafts[row.grantHeadId];
    if (!draft) return;
    const bankPaise = tryParseAmount(draft.bank);
    const cashPaise = tryParseAmount(draft.cash);
    if (bankPaise === null || cashPaise === null) return;

    setSaving(row.grantHeadId);
    await api.saveOpeningBalance({ grantHeadId: row.grantHeadId, bankPaise, cashPaise });
    setSaving(null);
    await reload();
    onChanged();
  }

  if (loading) return <div className="state">{t.loading}</div>;

  const totalBank = rows.reduce((sum, row) => sum + row.bankPaise, 0);
  const totalCash = rows.reduce((sum, row) => sum + row.cashPaise, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.openingTitle}</h2>
          <p>{t.openingSubtitle}</p>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t.grantHead}</th>
              <th className="num">{t.bank}</th>
              <th className="num">{t.cash}</th>
              <th className="num">{t.total}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.grantHeadId] ?? { bank: "0.00", cash: "0.00" };
              const bankPaise = tryParseAmount(draft.bank);
              const cashPaise = tryParseAmount(draft.cash);
              const changed =
                bankPaise !== row.bankPaise || cashPaise !== row.cashPaise;
              const valid = bankPaise !== null && cashPaise !== null;

              return (
                <tr key={row.grantHeadId}>
                  <td>{row.headNameGu}</td>
                  <td>
                    <input
                      className="num-input"
                      inputMode="decimal"
                      style={{ width: 120, textAlign: "right" }}
                      value={draft.bank}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.grantHeadId]: { ...draft, bank: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="num-input"
                      inputMode="decimal"
                      style={{ width: 120, textAlign: "right" }}
                      value={draft.cash}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.grantHeadId]: { ...draft, cash: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="num">
                    {valid ? <Money paise={bankPaise + cashPaise} /> : <span className="muted">—</span>}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="primary"
                        disabled={!changed || !valid || saving === row.grantHeadId}
                        onClick={() => void save(row)}
                      >
                        {saving === row.grantHeadId ? "…" : t.save}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>{t.total}</td>
              <td className="num">
                <Money paise={totalBank} />
              </td>
              <td className="num">
                <Money paise={totalCash} />
              </td>
              <td className="num">
                <Money paise={totalBank + totalCash} />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
