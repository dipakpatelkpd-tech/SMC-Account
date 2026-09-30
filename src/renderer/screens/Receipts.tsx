import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { GrantHeadDto, ReceiptDto, ReceiptInput } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { Money } from "../components/Money.js";
import { DateInput } from "../components/DateInput.js";
import { GrantHeadSelect } from "../components/GrantHeadSelect.js";
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
  const [query, setQuery] = useState("");
  const [headFilter, setHeadFilter] = useState<number | "all">("all");

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

  const filteredReceipts = receipts.filter((receipt) => {
    if (headFilter !== "all" && receipt.grantHeadId !== headFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    return (
      receipt.headNameGu.toLowerCase().includes(q) ||
      receipt.receivedFromGu.toLowerCase().includes(q) ||
      receipt.modeGu.toLowerCase().includes(q) ||
      receipt.bankLabelGu.toLowerCase().includes(q) ||
      receipt.date.includes(q)
    );
  });

  const filteredTotal = filteredReceipts.reduce((sum, receipt) => sum + receipt.amountPaise, 0);
  const isFiltered = query.trim() !== "" || headFilter !== "all";

  return (
    <>
      <div className="page-head">
        <div>
          <h2>
            {t.receiptsTitle}
            <span className="page-head-badge">{receipts.length}</span>
          </h2>
          <p>{t.receiptsSubtitle}</p>
        </div>
        <button className="primary" onClick={() => { setEditing("new"); setIssues([]); }}>
          + {t.newReceipt}
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
          onHeadCreated={(head) => {
            // Straight into the list, and every figure refreshed with it.
            setHeads((current) => [...current, head]);
            onChanged();
          }}
        />
      )}

      {receipts.length > 0 && (
        <div className="search-filter-bar">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery("")}
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>

          <div className="filter-group">
            <select
              className="filter-select"
              value={headFilter}
              onChange={(e) => setHeadFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">{t.filterAll} ({t.grantHead})</option>
              {heads.map((head) => (
                <option key={head.id} value={head.id}>
                  {head.nameGu}
                </option>
              ))}
            </select>
          </div>

          {isFiltered && (
            <button
              type="button"
              className="ghost small"
              onClick={() => {
                setQuery("");
                setHeadFilter("all");
              }}
            >
              {t.clearFilters}
            </button>
          )}

          <div className="filter-count-badge">
            {isFiltered ? (
              <span>
                {filteredReceipts.length} / {receipts.length} પહોંચ (<Money paise={filteredTotal} />)
              </span>
            ) : (
              <span>
                કુલ આવક: <Money paise={total} />
              </span>
            )}
          </div>
        </div>
      )}

      {filteredReceipts.length > 0 && (
        <div className="card">
          <div className="table-wrap" style={{ margin: 0, border: "none", boxShadow: "none" }}>
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
                {filteredReceipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="num">{formatDate(receipt.date)}</td>
                    <td style={{ fontWeight: 600 }}>{receipt.headNameGu}</td>
                    <td>{receipt.receivedFromGu}</td>
                    <td>{receipt.modeGu}</td>
                    <td>{receipt.bankLabelGu}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
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
                <tr className="total-row">
                  <td colSpan={5}>{t.total}</td>
                  <td className="num">
                    <Money paise={filteredTotal} />
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {receipts.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon">📥</div>
          <h4>{t.noReceipts}</h4>
          <p>{t.receiptsSubtitle}</p>
          <button className="primary" onClick={() => { setEditing("new"); setIssues([]); }}>
            + {t.newReceipt}
          </button>
        </div>
      )}

      {receipts.length > 0 && filteredReceipts.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon">🔍</div>
          <h4>{t.noMatchingRecords}</h4>
          <p>શોધ અથવા ફિલ્ટર સાફ કરીને ફરી પ્રયાસ કરો.</p>
          <button
            className="ghost"
            onClick={() => {
              setQuery("");
              setHeadFilter("all");
            }}
          >
            {t.clearFilters}
          </button>
        </div>
      )}
    </>
  );
}

function ReceiptForm({
  t,
  heads,
  receipt,
  onCancel,
  onSave,
  onHeadCreated,
}: {
  t: Strings;
  heads: GrantHeadDto[];
  receipt: ReceiptDto | null;
  onCancel: () => void;
  onSave: (input: ReceiptInput, id: number | null) => Promise<void>;
  onHeadCreated: (head: GrantHeadDto) => void;
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
    <form className="card form-card" onSubmit={submit}>
      <div className="form-card-header">
        <h3 className="form-card-title">
          <span>{receipt ? "✏️" : "➕"}</span>
          <span>{receipt ? t.editReceipt : t.newReceipt}</span>
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
          <label htmlFor="date">{t.cashbookDate}</label>
          <DateInput id="date" value={date} onChange={setDate} required />
        </div>
        <div className="field">
          <label htmlFor="head">{t.grantHead}</label>
          <GrantHeadSelect
            id="head"
            heads={heads}
            value={grantHeadId}
            onChange={setGrantHeadId}
            onCreated={onHeadCreated}
          />
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
          <DateInput id="credited" value={creditedDate} onChange={setCreditedDate} />
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
