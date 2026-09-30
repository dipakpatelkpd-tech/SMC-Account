import { useEffect, useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import type { Annexure9 } from "../../engine/types.js";
import { Money } from "../components/Money.js";
import { IssueList } from "../components/IssueList.js";
import type { Issue } from "../../engine/validation.js";
import { amountToInput, tryParseAmount } from "../format.js";
import { useStrings } from "../i18n/index.js";

/**
 * પરિશિષ્ટ ૯ - entering the bank reconciliation (SPEC 4.6, 6.8).
 *
 * Five figures the school reads off the passbook at year end. Everything else on
 * the form is computed: A comes from the cash book, the subtotal and the
 * deductions are sums, and the passbook figure is A + B + C − D − E.
 *
 * The typed passbook balance is the check, not an input to the answer. If the
 * two disagree the difference is shown rather than hidden - the client's Excel
 * copies A into the passbook line so that it always reconciles, which is the one
 * thing this form exists to catch (SPEC 9.9).
 *
 * B can also be worked out from the cheques themselves, so the computed figure
 * is offered beside the field with a button to accept it. It is offered, never
 * forced: a cheque the bank cleared without it being recorded here would make
 * the computed figure the wrong one.
 */
type FieldKey =
  | "chequesIssuedNotCashedPaise"
  | "creditsInBankNotInCashbookPaise"
  | "depositsNotYetCreditedPaise"
  | "bankChargesNotInCashbookPaise"
  | "passbookBalancePaise";

type Draft = Record<FieldKey, string>;

const BLANK: Draft = {
  chequesIssuedNotCashedPaise: "0.00",
  creditsInBankNotInCashbookPaise: "0.00",
  depositsNotYetCreditedPaise: "0.00",
  bankChargesNotInCashbookPaise: "0.00",
  passbookBalancePaise: "0.00",
};

export function Reconciliation({ onChanged }: { onChanged: () => void }): JSX.Element {
  const t = useStrings();
  const [report, setReport] = useState<Annexure9 | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [stored, setStored] = useState<Draft>(BLANK);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  async function reload(): Promise<void> {
    try {
      const [annexure9, saved] = await Promise.all([api.getAnnexure9(), api.getReconciliation()]);
      const next: Draft = saved
        ? {
            chequesIssuedNotCashedPaise: amountToInput(saved.chequesIssuedNotCashedPaise),
            creditsInBankNotInCashbookPaise: amountToInput(saved.creditsInBankNotInCashbookPaise),
            depositsNotYetCreditedPaise: amountToInput(saved.depositsNotYetCreditedPaise),
            bankChargesNotInCashbookPaise: amountToInput(saved.bankChargesNotInCashbookPaise),
            passbookBalancePaise: amountToInput(saved.passbookBalancePaise),
          }
        : BLANK;
      setReport(annexure9);
      setDraft(next);
      setStored(next);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (failure !== null) {
    return (
      <div className="state error">
        <p>{t.couldNotLoad}</p>
        <p className="num">{failure}</p>
      </div>
    );
  }

  if (loading || !report) return <div className="state">{t.calculating}</div>;

  const values = {
    chequesIssuedNotCashedPaise: tryParseAmount(draft.chequesIssuedNotCashedPaise),
    creditsInBankNotInCashbookPaise: tryParseAmount(draft.creditsInBankNotInCashbookPaise),
    depositsNotYetCreditedPaise: tryParseAmount(draft.depositsNotYetCreditedPaise),
    bankChargesNotInCashbookPaise: tryParseAmount(draft.bankChargesNotInCashbookPaise),
    passbookBalancePaise: tryParseAmount(draft.passbookBalancePaise),
  };

  const valid = Object.values(values).every((value) => value !== null);
  const changed = (Object.keys(BLANK) as FieldKey[]).some((key) => draft[key] !== stored[key]);

  // Recomputed from what is on screen, not from what was last saved, so the
  // passbook line moves as the figures are typed.
  const subtotal =
    report.cashbookBankPaise +
    (values.chequesIssuedNotCashedPaise ?? 0) +
    (values.creditsInBankNotInCashbookPaise ?? 0);
  const deductions =
    (values.depositsNotYetCreditedPaise ?? 0) + (values.bankChargesNotInCashbookPaise ?? 0);
  const computed = subtotal - deductions;
  const difference = (values.passbookBalancePaise ?? 0) - computed;

  async function save(): Promise<void> {
    if (!valid || saving) return;
    setSaving(true);
    const result = await api.saveReconciliation({
      chequesIssuedNotCashedPaise: values.chequesIssuedNotCashedPaise ?? 0,
      creditsInBankNotInCashbookPaise: values.creditsInBankNotInCashbookPaise ?? 0,
      depositsNotYetCreditedPaise: values.depositsNotYetCreditedPaise ?? 0,
      bankChargesNotInCashbookPaise: values.bankChargesNotInCashbookPaise ?? 0,
      passbookBalancePaise: values.passbookBalancePaise ?? 0,
    });
    setSaving(false);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    await reload();
    onChanged();
  }

  function set(key: FieldKey, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.reconciliationTitle}</h2>
          <p>{t.reconciliationSubtitle}</p>
        </div>
        <button className="primary" disabled={!valid || !changed || saving} onClick={() => void save()}>
          {saving ? "…" : t.save}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <IssueList issues={issues} />
        </div>
      )}

      <div className="card">
        <table>
          <tbody>
            <tr>
              <td>{t.recCashbook}</td>
              <td className="num">
                <Money paise={report.cashbookBankPaise} />
              </td>
              <td className="muted">{t.recCashbookNote}</td>
            </tr>

            <AmountRow
              label={t.recUncashed}
              value={draft.chequesIssuedNotCashedPaise}
              onChange={(value) => set("chequesIssuedNotCashedPaise", value)}
              note={
                <span className="muted">
                  {t.recFromCheques}{" "}
                  <strong className="num">
                    <Money paise={report.suggestedUnencashedPaise} />
                  </strong>
                  {values.chequesIssuedNotCashedPaise !== report.suggestedUnencashedPaise && (
                    <>
                      {" "}
                      <button
                        className="ghost"
                        type="button"
                        onClick={() =>
                          set(
                            "chequesIssuedNotCashedPaise",
                            amountToInput(report.suggestedUnencashedPaise),
                          )
                        }
                      >
                        {t.recUseComputed}
                      </button>
                    </>
                  )}
                </span>
              }
            />

            <AmountRow
              label={t.recCreditsNotInBook}
              value={draft.creditsInBankNotInCashbookPaise}
              onChange={(value) => set("creditsInBankNotInCashbookPaise", value)}
            />

            <tr className="total-row">
              <td>{t.recSubtotal}</td>
              <td className="num">
                <Money paise={subtotal} />
              </td>
              <td />
            </tr>

            <AmountRow
              label={t.recDepositsNotCredited}
              value={draft.depositsNotYetCreditedPaise}
              onChange={(value) => set("depositsNotYetCreditedPaise", value)}
            />

            <AmountRow
              label={t.recBankCharges}
              value={draft.bankChargesNotInCashbookPaise}
              onChange={(value) => set("bankChargesNotInCashbookPaise", value)}
            />

            <tr className="total-row">
              <td>{t.recComputedPassbook}</td>
              <td className="num">
                <Money paise={computed} />
              </td>
              <td className="muted">{t.recComputedNote}</td>
            </tr>

            <AmountRow
              label={t.recEnteredPassbook}
              value={draft.passbookBalancePaise}
              onChange={(value) => set("passbookBalancePaise", value)}
              note={<span className="muted">{t.recEnteredNote}</span>}
            />
          </tbody>
        </table>

        {valid && (
          <div className={difference === 0 ? "issue" : "issue error"} style={{ marginTop: 12 }}>
            <div>
              {difference === 0 ? (
                t.recAgrees
              ) : (
                <>
                  {t.recMismatch} {t.recDifference}{" "}
                  <strong className="num">
                    <Money paise={Math.abs(difference)} />
                  </strong>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function AmountRow({
  label,
  value,
  onChange,
  note,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  note?: JSX.Element;
}): JSX.Element {
  const valid = tryParseAmount(value) !== null;
  return (
    <tr>
      <td>{label}</td>
      <td className="num">
        <input
          className="num-input"
          inputMode="decimal"
          style={{
            width: 140,
            textAlign: "right",
            borderColor: valid ? undefined : "var(--error-line)",
          }}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </td>
      <td>{note}</td>
    </tr>
  );
}
