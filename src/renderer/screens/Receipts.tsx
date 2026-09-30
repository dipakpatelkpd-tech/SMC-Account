import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { GrantHeadDto, ReceiptDto, ReceiptInput } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { Money } from "../components/Money.js";
import { IssueList } from "../components/IssueList.js";
import { amountToInput, formatDate, tryParseAmount } from "../format.js";
import { useStrings, type Strings } from "../i18n/index.js";
import type { JSX } from "react";

/** ગ્રાન્ટ આવક - money into the bank. One row per receipt (SPEC 4.3). */
export function Receipts({ onChanged }: { onChanged: () => void }): JSX.Element {
  const t = useStrings();
  const [receipts, setReceipts] = useState<ReceiptDto[]>([]);
  const [heads, setHeads] = useState<GrantHeadDto[]>([]);
  const [editing, setEditing] = useState<ReceiptDto | "new" | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload(): Promise<void> {
    const [nextReceipts, nextHeads] = await Promise.all([api.listReceipts(), api.listGrantHeads()]);
    setReceipts(nextReceipts);
    setHeads(nextHeads);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function save(input: ReceiptInput, id: number | null): Promise<void> {
    const result = id === null ? await api.createReceipt(input) : await api.updateReceipt(id, input);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    setEditing(null);
    await reload();
    onChanged();
  }

  async function remove(receipt: ReceiptDto): Promise<void> {
    const confirmed = window.confirm(
      t.confirmDeleteReceipt(formatDate(receipt.date), receipt.headNameGu),
    );
    if (!confirmed) return;
    await api.deleteReceipt(receipt.id);
    await reload();
    onChanged();
  }

  if (loading) return <div className="state">{t.loading}</div>;

  const total = receipts.reduce((sum, receipt) => sum + receipt.amountPaise, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.receiptsTitle}</h2>
          <p>{t.receiptsSubtitle}</p>
        </div>
        <button className="primary" onClick={() => { setEditing("new"); setIssues([]); }}>
          {t.newReceipt}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <IssueList issues={issues} />
        </div>
      )}

      {editing !== null && (
        <ReceiptForm
          t={t}
          heads={heads}
          receipt={editing === "new" ? null : editing}
          onCancel={() => { setEditing(null); setIssues([]); }}
          onSave={save}
        />
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t.date}</th>
              <th>{t.grantHead}</th>
              <th>{t.receivedFrom}</th>
              <th>{t.mode}</th>
              <th>{t.bank}</th>
              <th className="num">{t.amount}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td className="num">{formatDate(receipt.date)}</td>
                <td>{receipt.headNameGu}</td>
                <td>{receipt.receivedFromGu}</td>
                <td>{receipt.modeGu}</td>
                <td>{receipt.bankLabelGu}</td>
                <td className="num">
                  <Money paise={receipt.amountPaise} />
                </td>
                <td>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => { setEditing(receipt); setIssues([]); }}>
                      {t.edit}
                    </button>
                    <button className="danger" onClick={() => void remove(receipt)}>
                      {t.delete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {receipts.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  {t.noReceipts}
                </td>
              </tr>
            )}
            {receipts.length > 0 && (
              <tr className="total-row">
                <td colSpan={5}>{t.total}</td>
                <td className="num">
                  <Money paise={total} />
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReceiptForm({
  t,
  heads,
  receipt,
  onCancel,
  onSave,
}: {
  t: Strings;
  heads: GrantHeadDto[];
  receipt: ReceiptDto | null;
  onCancel: () => void;
  onSave: (input: ReceiptInput, id: number | null) => Promise<void>;
}): JSX.Element {
  const [date, setDate] = useState(receipt?.date ?? "");
  const [grantHeadId, setGrantHeadId] = useState(receipt?.grantHeadId ?? heads[0]?.id ?? 0);
  const [amount, setAmount] = useState(receipt ? amountToInput(receipt.amountPaise) : "");
  const [receivedFrom, setReceivedFrom] = useState(receipt?.receivedFromGu ?? "SSA");
  const [mode, setMode] = useState(receipt?.modeGu ?? "ઓનલાઈન");
  const [bankLabel, setBankLabel] = useState(receipt?.bankLabelGu ?? "");
  const [creditedDate, setCreditedDate] = useState(receipt?.creditedDate ?? "");
  const [remarks, setRemarks] = useState(receipt?.remarksGu ?? "");

  const amountPaise = tryParseAmount(amount);
  const valid = date !== "" && grantHeadId > 0 && amountPaise !== null && amountPaise > 0;

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (!valid || amountPaise === null) return;
    void onSave(
      {
        date,
        grantHeadId,
        amountPaise,
        receivedFromGu: receivedFrom,
        modeGu: mode,
        bankLabelGu: bankLabel,
        // The grant register prints both a deposited and a credited date; the
        // school records one, so the other follows it unless told otherwise.
        creditedDate: creditedDate === "" ? date : creditedDate,
        depositedDate: creditedDate === "" ? date : creditedDate,
        remarksGu: remarks === "" ? null : remarks,
      },
      receipt?.id ?? null,
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>{receipt ? t.editReceipt : t.receiptsTitle}</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="date">{t.cashbookDate}</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="head">{t.grantHead}</label>
          <select id="head" value={grantHeadId} onChange={(e) => setGrantHeadId(Number(e.target.value))}>
            {heads.map((head) => (
              <option key={head.id} value={head.id}>
                {head.nameGu}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="amount">{t.amount}</label>
          <input
            id="amount"
            className="num-input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1500.00"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="from">{t.receivedFrom}</label>
          <input id="from" data-suggest="receipt.from" value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="mode">{t.mode}</label>
          <input id="mode" value={mode} onChange={(e) => setMode(e.target.value)} list="modes" />
          <datalist id="modes">
            <option value="ઓનલાઈન" />
            <option value="બેન્ક દ્વારા" />
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="bank">{t.bankName}</label>
          <input id="bank" data-suggest="bank.name" value={bankLabel} onChange={(e) => setBankLabel(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="credited">{t.creditedDate}</label>
          <input
            id="credited"
            type="date"
            value={creditedDate}
            onChange={(e) => setCreditedDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="remarks">{t.remarks}</label>
          <input id="remarks" data-suggest="receipt.remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
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
