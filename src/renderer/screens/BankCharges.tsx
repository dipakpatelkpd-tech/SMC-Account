import { useEffect, useState } from "react";
import type { FormEvent, JSX } from "react";
import { api } from "../api.js";
import type { BankChargeDto, BankChargeInput, GrantHeadDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { Money } from "../components/Money.js";
import { DateInput } from "../components/DateInput.js";
import { GrantHeadSelect } from "../components/GrantHeadSelect.js";
import { IssueList } from "../components/IssueList.js";
import { amountToInput, formatDate, tryParseAmount } from "../format.js";
import { useStrings, type Strings } from "../i18n/index.js";

/**
 * બેન્ક ચાર્જ - money the bank took out of the account itself.
 *
 * There is no cheque and no voucher: the bank simply debits the account. The
 * school says which grant head bears it. It prints in the rojmel and in that
 * head's ledger, and nowhere else.
 */
export function BankCharges({ onChanged }: { onChanged: () => void }): JSX.Element {
  const t = useStrings();
  const [charges, setCharges] = useState<BankChargeDto[]>([]);
  const [heads, setHeads] = useState<GrantHeadDto[]>([]);
  const [editing, setEditing] = useState<BankChargeDto | "new" | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload(): Promise<void> {
    const [nextCharges, nextHeads] = await Promise.all([api.listBankCharges(), api.listGrantHeads()]);
    setCharges(nextCharges);
    setHeads(nextHeads);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function save(input: BankChargeInput, id: number | null): Promise<void> {
    const result = id === null ? await api.createBankCharge(input) : await api.updateBankCharge(id, input);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    setEditing(null);
    await reload();
    onChanged();
  }

  async function remove(charge: BankChargeDto): Promise<void> {
    if (!window.confirm(t.confirmDeleteBankCharge(formatDate(charge.date), charge.headNameGu))) return;
    await api.deleteBankCharge(charge.id);
    await reload();
    onChanged();
  }

  if (loading) return <div className="state">{t.loading}</div>;

  const total = charges.reduce((sum, charge) => sum + charge.amountPaise, 0);
  const startNew = (): void => {
    setEditing("new");
    setIssues([]);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>
            {t.bankChargesTitle}
            <span className="page-head-badge">{charges.length}</span>
          </h2>
          <p>{t.bankChargesSubtitle}</p>
        </div>
        <button className="primary" onClick={startNew}>
          {t.newBankCharge}
        </button>
      </div>

      <div className="issue warning">
        <div>{t.bankChargesNote}</div>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <IssueList issues={issues} />
        </div>
      )}

      {editing !== null && (
        <BankChargeForm
          t={t}
          heads={heads}
          charge={editing === "new" ? null : editing}
          onCancel={() => {
            setEditing(null);
            setIssues([]);
          }}
          onSave={save}
          onHeadCreated={(head) => {
            setHeads((current) => [...current, head]);
            onChanged();
          }}
        />
      )}

      {charges.length > 0 ? (
        <div className="card">
          <div className="table-wrap" style={{ margin: 0, border: "none", boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>{t.date}</th>
                  <th>{t.grantHead}</th>
                  <th>{t.colDescription}</th>
                  <th>{t.remarks}</th>
                  <th className="num">{t.amount}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.id}>
                    <td className="num">{formatDate(charge.date)}</td>
                    <td style={{ fontWeight: 600 }}>{charge.headNameGu}</td>
                    <td>{charge.descriptionGu}</td>
                    <td>{charge.remarksGu ?? ""}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      <Money paise={charge.amountPaise} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="ghost"
                          onClick={() => {
                            setEditing(charge);
                            setIssues([]);
                          }}
                        >
                          {t.edit}
                        </button>
                        <button className="danger" onClick={() => void remove(charge)}>
                          {t.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={4}>{t.total}</td>
                  <td className="num">
                    <Money paise={total} />
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        editing === null && (
          <div className="card empty-state">
            <div className="empty-state-icon">🏦</div>
            <h4>{t.noBankCharges}</h4>
            <p>{t.bankChargesSubtitle}</p>
            <button className="primary" onClick={startNew}>
              {t.newBankCharge}
            </button>
          </div>
        )
      )}
    </>
  );
}

function BankChargeForm({
  t,
  heads,
  charge,
  onCancel,
  onSave,
  onHeadCreated,
}: {
  t: Strings;
  heads: GrantHeadDto[];
  charge: BankChargeDto | null;
  onCancel: () => void;
  onSave: (input: BankChargeInput, id: number | null) => Promise<void>;
  onHeadCreated: (head: GrantHeadDto) => void;
}): JSX.Element {
  const [date, setDate] = useState(charge?.date ?? "");
  const [grantHeadId, setGrantHeadId] = useState(charge?.grantHeadId ?? heads[0]?.id ?? 0);
  const [amount, setAmount] = useState(charge ? amountToInput(charge.amountPaise) : "");
  const [description, setDescription] = useState(charge?.descriptionGu ?? t.bankChargeDefaultDescription);
  const [remarks, setRemarks] = useState(charge?.remarksGu ?? "");

  const amountPaise = tryParseAmount(amount);
  const valid =
    date !== "" && grantHeadId > 0 && amountPaise !== null && amountPaise > 0 && description.trim() !== "";

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!valid || amountPaise === null) return;
    void onSave(
      {
        date,
        grantHeadId,
        amountPaise,
        descriptionGu: description.trim(),
        remarksGu: remarks.trim() === "" ? null : remarks.trim(),
      },
      charge?.id ?? null,
    );
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="form-card-header">
        <h3 className="form-card-title">
          <span>{charge ? "✏️" : "➕"}</span>
          <span>{charge ? t.editBankCharge : t.newBankCharge}</span>
        </h3>
        {amountPaise !== null && amountPaise > 0 && (
          <div className="calc-chip">
            <span>{t.amount}:</span>
            <Money paise={amountPaise} />
          </div>
        )}
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="charge-date">{t.cashbookDate}</label>
          <DateInput id="charge-date" value={date} onChange={setDate} required />
        </div>
        <div className="field">
          <label htmlFor="charge-head">{t.grantHead}</label>
          <GrantHeadSelect
            id="charge-head"
            heads={heads}
            value={grantHeadId}
            onChange={setGrantHeadId}
            onCreated={onHeadCreated}
          />
        </div>
        <div className="field">
          <label htmlFor="charge-amount">{t.amount}</label>
          <input
            id="charge-amount"
            className="num-input"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="17.70"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="charge-description">{t.bankChargeDescription}</label>
          <input
            id="charge-description"
            data-suggest="bankCharge.description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="charge-remarks">{t.remarks}</label>
          <input
            id="charge-remarks"
            data-suggest="bankCharge.remarks"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </div>
      </div>
      <div className="form-actions">
        <button className="primary" type="submit" disabled={!valid}>
          {t.save}
        </button>
        <button className="ghost" type="button" onClick={onCancel}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}
