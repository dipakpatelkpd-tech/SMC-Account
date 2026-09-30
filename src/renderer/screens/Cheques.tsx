import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { BillDto, ChequeDto, ChequeInput, GrantHeadDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import type { ChequeType } from "../../lib/types.js";
import { Money } from "../components/Money.js";
import { IssueList } from "../components/IssueList.js";
import { chequeTypeLabels, amountToInput, formatDate, tryParseAmount } from "../format.js";
import { useStrings, type Strings } from "../i18n/index.js";
import type { JSX } from "react";

/**
 * ચેક - the only way money leaves the bank (SPEC 4.5).
 *
 * The important rule lives in this screen's shape: for a reimbursement or a
 * direct payment the user picks BILLS and the per-head split is computed and
 * shown read-only. Only a grant return offers typed amounts, because it has no
 * bills to compute from. There is no way to type an allocation that disagrees
 * with the bills, which is the class of error SPEC section 9 is full of.
 */
export function Cheques({ onChanged }: { onChanged: () => void }): JSX.Element {
  const t = useStrings();
  const typeLabels = chequeTypeLabels(t);
  const [cheques, setCheques] = useState<ChequeDto[]>([]);
  const [bills, setBills] = useState<BillDto[]>([]);
  const [heads, setHeads] = useState<GrantHeadDto[]>([]);
  const [editing, setEditing] = useState<ChequeDto | "new" | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload(): Promise<void> {
    const [nextCheques, nextBills, nextHeads] = await Promise.all([
      api.listCheques(),
      api.listBills(),
      api.listGrantHeads(),
    ]);
    setCheques(nextCheques);
    setBills(nextBills);
    setHeads(nextHeads);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function save(input: ChequeInput, id: number | null): Promise<void> {
    const result = id === null ? await api.createCheque(input) : await api.updateCheque(id, input);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    setEditing(null);
    await reload();
    onChanged();
  }

  async function remove(cheque: ChequeDto): Promise<void> {
    if (!window.confirm(t.confirmDeleteCheque(cheque.chequeNo))) return;
    await api.deleteCheque(cheque.id);
    await reload();
    onChanged();
  }

  if (loading) return <div className="state">{t.loading}</div>;

  const total = cheques.reduce((sum, cheque) => sum + cheque.amountPaise, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.chequesTitle}</h2>
          <p>{t.chequesSubtitle}</p>
        </div>
        <button className="primary" onClick={() => { setEditing("new"); setIssues([]); }}>
          {t.newCheque}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <IssueList issues={issues} />
        </div>
      )}

      {editing !== null && (
        <ChequeForm
          t={t}
          heads={heads}
          bills={bills}
          cheque={editing === "new" ? null : editing}
          nextChequeNo={Math.max(0, ...cheques.map((cheque) => cheque.chequeNo)) + 1}
          onCancel={() => { setEditing(null); setIssues([]); }}
          onSave={save}
        />
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th className="num">{t.chequeNo}</th>
              <th>{t.chequeDate}</th>
              <th>{t.cashbookDate}</th>
              <th>{t.chequeType}</th>
              <th>{t.payee}</th>
              <th>{t.allocation}</th>
              <th className="num">{t.amount}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cheques.map((cheque) => (
              <tr key={cheque.id}>
                <td className="num">{cheque.chequeNo}</td>
                <td className="num">{formatDate(cheque.chequeDate)}</td>
                <td className="num">{formatDate(cheque.cashbookDate)}</td>
                <td>{typeLabels[cheque.type] ?? cheque.type}</td>
                <td>{cheque.payeeGu}</td>
                <td>
                  {cheque.allocation.map((row) => (
                    <div key={row.headCode} style={{ fontSize: 13 }}>
                      {row.headNameGu} <Money paise={row.amountPaise} />
                    </div>
                  ))}
                </td>
                <td className="num">
                  <Money paise={cheque.amountPaise} />
                </td>
                <td>
                  <div className="row-actions">
                    <button className="ghost" onClick={() => { setEditing(cheque); setIssues([]); }}>
                      {t.edit}
                    </button>
                    <button className="danger" onClick={() => void remove(cheque)}>
                      {t.delete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {cheques.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  {t.noCheques}
                </td>
              </tr>
            )}
            {cheques.length > 0 && (
              <tr className="total-row">
                <td colSpan={6}>{t.total}</td>
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

function ChequeForm({
  t,
  heads,
  bills,
  cheque,
  nextChequeNo,
  onCancel,
  onSave,
}: {
  t: Strings;
  heads: GrantHeadDto[];
  bills: BillDto[];
  cheque: ChequeDto | null;
  nextChequeNo: number;
  onCancel: () => void;
  onSave: (input: ChequeInput, id: number | null) => Promise<void>;
}): JSX.Element {
  const [chequeNo, setChequeNo] = useState(String(cheque?.chequeNo ?? nextChequeNo));
  const [chequeDate, setChequeDate] = useState(cheque?.chequeDate ?? "");
  const [cashbookDate, setCashbookDate] = useState(cheque?.cashbookDate ?? "");
  const [cashedDate, setCashedDate] = useState(cheque?.cashedDate ?? "");
  const [voucherNo, setVoucherNo] = useState(cheque?.voucherNo?.toString() ?? "");
  const [payee, setPayee] = useState(cheque?.payeeGu ?? "");
  const [purpose, setPurpose] = useState(cheque?.purposeGu ?? "");
  const [type, setType] = useState<ChequeType>(cheque?.type ?? "REIMBURSEMENT");

  const [billIds, setBillIds] = useState<number[]>(
    cheque === null ? [] : bills.filter((bill) => bill.chequeId === cheque.id).map((bill) => bill.id),
  );
  const [typed, setTyped] = useState<Record<number, string>>(() => {
    if (cheque === null || cheque.type !== "GRANT_RETURN") return {};
    return Object.fromEntries(
      cheque.allocation.map((row) => [row.grantHeadId, amountToInput(row.amountPaise)]),
    );
  });

  const computed = type !== "GRANT_RETURN";

  // Bills this cheque may claim: unpaid ones, plus the ones it already holds.
  const available = bills.filter(
    (bill) => bill.chequeId === null || (cheque !== null && bill.chequeId === cheque.id),
  );

  const selected = bills.filter((bill) => billIds.includes(bill.id));

  // The split, computed exactly as the engine computes it.
  const allocation = new Map<number, number>();
  if (computed) {
    for (const bill of selected) {
      allocation.set(bill.grantHeadId, (allocation.get(bill.grantHeadId) ?? 0) + bill.netPaise);
    }
  } else {
    for (const [headId, text] of Object.entries(typed)) {
      const paise = tryParseAmount(text);
      if (paise !== null && paise > 0) allocation.set(Number(headId), paise);
    }
  }
  const amountPaise = [...allocation.values()].reduce((sum, value) => sum + value, 0);

  const valid =
    chequeDate !== "" &&
    cashbookDate !== "" &&
    payee !== "" &&
    purpose !== "" &&
    Number(chequeNo) > 0 &&
    amountPaise > 0 &&
    (computed ? selected.length > 0 : allocation.size > 0);

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (!valid) return;
    void onSave(
      {
        chequeNo: Number(chequeNo),
        chequeDate,
        cashbookDate,
        cashedDate: cashedDate === "" ? null : cashedDate,
        voucherNo: voucherNo === "" ? null : Number(voucherNo),
        payeeGu: payee,
        purposeGu: purpose,
        type,
        billIds: computed ? billIds : [],
        typedAllocation: computed
          ? []
          : [...allocation.entries()].map(([grantHeadId, paise]) => ({
              grantHeadId,
              amountPaise: paise,
            })),
      },
      cheque?.id ?? null,
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>{cheque ? t.editCheque(cheque.chequeNo) : t.chequesTitle}</h3>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="type">{t.chequeType}</label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as ChequeType)}
          >
            {(Object.keys(chequeTypeLabels(t)) as ChequeType[]).map((value) => (
              <option key={value} value={value}>
                {chequeTypeLabels(t)[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="chequeno">{t.chequeNo}</label>
          <input
            id="chequeno"
            data-no-suggest
            className="num-input"
            inputMode="numeric"
            value={chequeNo}
            onChange={(e) => setChequeNo(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="voucher">{t.voucherNo}</label>
          <input
            id="voucher"
            data-no-suggest
            className="num-input"
            inputMode="numeric"
            value={voucherNo}
            onChange={(e) => setVoucherNo(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cdate">{t.chequeDate}</label>
          <input
            id="cdate"
            type="date"
            value={chequeDate}
            onChange={(e) => setChequeDate(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="cbdate">{t.cashbookDate}</label>
          <input
            id="cbdate"
            type="date"
            value={cashbookDate}
            onChange={(e) => setCashbookDate(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="cashed">{t.cashedDate}</label>
          <input
            id="cashed"
            type="date"
            value={cashedDate}
            onChange={(e) => setCashedDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="payee">{t.payee}</label>
          <input id="payee" data-suggest="vendor.name" value={payee} onChange={(e) => setPayee(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="purpose">{t.chequePurpose}</label>
          <input id="purpose" data-suggest="cheque.purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
        </div>
      </div>

      {computed ? (
        <>
          <h3 style={{ marginTop: 14 }}>{t.whichBillsPaid}</h3>
          {available.length === 0 ? (
            <p className="muted">{t.noBillsAvailable}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>{t.billNo}</th>
                  <th>{t.billDate}</th>
                  <th>{t.billDescription}</th>
                  <th>{t.grantHead}</th>
                  <th className="num">{t.netAmount}</th>
                </tr>
              </thead>
              <tbody>
                {available.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={billIds.includes(bill.id)}
                        onChange={(e) =>
                          setBillIds((current) =>
                            e.target.checked
                              ? [...current, bill.id]
                              : current.filter((id) => id !== bill.id),
                          )
                        }
                      />
                    </td>
                    <td className="num">{bill.billNo ?? "—"}</td>
                    <td className="num">{formatDate(bill.billDate)}</td>
                    <td>{bill.descriptionGu}</td>
                    <td>{bill.headNameGu}</td>
                    <td className="num">
                      <Money paise={bill.netPaise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <h3 style={{ marginTop: 14 }}>{t.whichHeadsReturned}</h3>
          <div className="form-grid">
            {heads.map((head) => (
              <div className="field" key={head.id}>
                <label htmlFor={`head-${head.id}`}>{head.nameGu}</label>
                <input
                  id={`head-${head.id}`}
                  className="num-input"
                  inputMode="decimal"
                  value={typed[head.id] ?? ""}
                  placeholder="0.00"
                  onChange={(e) =>
                    setTyped((current) => ({ ...current, [head.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card" style={{ background: "var(--canvas)", marginTop: 14 }}>
        <h3>{t.computedChequeAmount}</h3>
        <table>
          <tbody>
            {[...allocation.entries()].map(([headId, paise]) => (
              <tr key={headId}>
                <td>{heads.find((head) => head.id === headId)?.nameGu ?? headId}</td>
                <td className="num">
                  <Money paise={paise} />
                </td>
              </tr>
            ))}
            <tr className="total-row">
              <td>{t.totalChequeAmount}</td>
              <td className="num">
                <Money paise={amountPaise} />
              </td>
            </tr>
          </tbody>
        </table>
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
