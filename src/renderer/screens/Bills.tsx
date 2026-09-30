import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { BillDto, BillInput, GrantHeadDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { Money } from "../components/Money.js";
import { DateInput } from "../components/DateInput.js";
import { GrantHeadSelect } from "../components/GrantHeadSelect.js";
import { IssueList } from "../components/IssueList.js";
import { amountToInput, formatDate, tryParseAmount } from "../format.js";
import { useStrings, type Strings } from "../i18n/index.js";
import type { JSX } from "react";

/**
 * બિલ - the expense documents (SPEC 4.4).
 *
 * Grouped by voucher, because that is how they are paid: one cheque settles one
 * voucher's worth of bills. The net amount is shown but never typed - it is
 * gross less deduction, computed here exactly as the reports compute it.
 */
export function Bills({ onChanged }: { onChanged: () => void }): JSX.Element {
  const t = useStrings();
  const [bills, setBills] = useState<BillDto[]>([]);
  const [heads, setHeads] = useState<GrantHeadDto[]>([]);
  const [editing, setEditing] = useState<BillDto | "new" | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [headFilter, setHeadFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid">("all");

  async function reload(): Promise<void> {
    const [nextBills, nextHeads] = await Promise.all([api.listBills(), api.listGrantHeads()]);
    setBills(nextBills);
    setHeads(nextHeads);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function save(input: BillInput, id: number | null): Promise<void> {
    const result = id === null ? await api.createBill(input) : await api.updateBill(id, input);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    setEditing(null);
    await reload();
    onChanged();
  }

  async function remove(bill: BillDto): Promise<void> {
    if (!window.confirm(t.confirmDeleteBill(bill.billNo ?? bill.descriptionGu))) return;
    await api.deleteBill(bill.id);
    await reload();
    onChanged();
  }

  if (loading) return <div className="state">{t.loading}</div>;

  const allVouchers = [...new Set(bills.map((bill) => bill.voucherNo))].sort((a, b) => a - b);
  const total = bills.reduce((sum, bill) => sum + bill.netPaise, 0);

  const filteredBills = bills.filter((bill) => {
    if (headFilter !== "all" && bill.grantHeadId !== headFilter) return false;
    const isPaid = bill.chequeNo !== null;
    if (statusFilter === "paid" && !isPaid) return false;
    if (statusFilter === "unpaid" && isPaid) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    return (
      (bill.billNo && bill.billNo.toLowerCase().includes(q)) ||
      bill.descriptionGu.toLowerCase().includes(q) ||
      bill.vendorGu.toLowerCase().includes(q) ||
      bill.headNameGu.toLowerCase().includes(q) ||
      String(bill.voucherNo).includes(q) ||
      (bill.chequeNo !== null && String(bill.chequeNo).includes(q))
    );
  });

  const vouchers = [...new Set(filteredBills.map((bill) => bill.voucherNo))].sort((a, b) => a - b);
  const filteredTotal = filteredBills.reduce((sum, bill) => sum + bill.netPaise, 0);
  const isFiltered = query.trim() !== "" || headFilter !== "all" || statusFilter !== "all";

  return (
    <>
      <div className="page-head">
        <div>
          <h2>
            {t.billsTitle}
            <span className="page-head-badge">{bills.length}</span>
          </h2>
          <p>{t.billsSubtitle}</p>
        </div>
        <button className="primary" onClick={() => { setEditing("new"); setIssues([]); }}>
          + {t.newBill}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="card">
          <IssueList issues={issues} />
        </div>
      )}

      {editing !== null && (
        <BillForm
          t={t}
          heads={heads}
          bill={editing === "new" ? null : editing}
          nextVoucher={(allVouchers[allVouchers.length - 1] ?? 0) + 1}
          onCancel={() => { setEditing(null); setIssues([]); }}
          onSave={save}
          onHeadCreated={(head) => {
            // Straight into the list, and every figure refreshed with it.
            setHeads((current) => [...current, head]);
            onChanged();
          }}
        />
      )}

      {bills.length > 0 && (
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

          <div className="filter-segments">
            <button
              type="button"
              className={`filter-segment-btn ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              {t.filterAll}
            </button>
            <button
              type="button"
              className={`filter-segment-btn ${statusFilter === "paid" ? "active" : ""}`}
              onClick={() => setStatusFilter("paid")}
            >
              {t.statusPaid}
            </button>
            <button
              type="button"
              className={`filter-segment-btn ${statusFilter === "unpaid" ? "active" : ""}`}
              onClick={() => setStatusFilter("unpaid")}
            >
              {t.statusUnpaid}
            </button>
          </div>

          {isFiltered && (
            <button
              type="button"
              className="ghost small"
              onClick={() => {
                setQuery("");
                setHeadFilter("all");
                setStatusFilter("all");
              }}
            >
              {t.clearFilters}
            </button>
          )}

          <div className="filter-count-badge">
            {isFiltered ? (
              <span>
                {filteredBills.length} / {bills.length} બિલ (<Money paise={filteredTotal} />)
              </span>
            ) : (
              <span>
                {t.billsSummary(bills.length)} <Money paise={total} />
              </span>
            )}
          </div>
        </div>
      )}

      {vouchers.map((voucherNo) => {
        const rows = filteredBills.filter((bill) => bill.voucherNo === voucherNo);
        const voucherTotal = rows.reduce((sum, bill) => sum + bill.netPaise, 0);
        const paidBy = rows.find((bill) => bill.chequeNo !== null)?.chequeNo ?? null;

        return (
          <div className="card" key={voucherNo}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>
                {t.voucher} {voucherNo}{" "}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
                  {paidBy === null ? (
                    <span style={{ color: "var(--warn-line)", marginLeft: 6 }}>● {t.notLinkedToCheque}</span>
                  ) : (
                    <span style={{ color: "var(--credit)", marginLeft: 6 }}>● {t.linkedToCheque(paidBy)}</span>
                  )}
                </span>
              </h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t.billNo}</th>
                    <th>{t.billDate}</th>
                    <th>{t.billDescription}</th>
                    <th>{t.billFrom}</th>
                    <th>{t.grantHead}</th>
                    <th className="num">{t.amount}</th>
                    <th className="num">{t.deduction}</th>
                    <th className="num">{t.netAmountShort}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((bill) => (
                    <tr key={bill.id}>
                      <td className="num">{bill.billNo ?? "—"}</td>
                      <td className="num">{formatDate(bill.billDate)}</td>
                      <td>{bill.descriptionGu}</td>
                      <td>{bill.vendorGu}</td>
                      <td>{bill.headNameGu}</td>
                      <td className="num">
                        <Money paise={bill.amountPaise} />
                      </td>
                      <td className="num">
                        <Money paise={bill.deductionPaise} />
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        <Money paise={bill.netPaise} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="ghost" onClick={() => { setEditing(bill); setIssues([]); }}>
                            {t.edit}
                          </button>
                          <button className="danger" onClick={() => void remove(bill)}>
                            {t.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={7}>{t.voucherTotal(voucherNo)}</td>
                    <td className="num">
                      <Money paise={voucherTotal} />
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {bills.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon">📄</div>
          <h4>{t.noBills}</h4>
          <p>{t.billsSubtitle}</p>
          <button className="primary" onClick={() => { setEditing("new"); setIssues([]); }}>
            + {t.newBill}
          </button>
        </div>
      )}

      {bills.length > 0 && filteredBills.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon">🔍</div>
          <h4>{t.noMatchingRecords}</h4>
          <p>શોધ અથવા ફિલ્ટર સાફ કરીને ફરી પ્રયાસ કરો.</p>
          <button
            className="ghost"
            onClick={() => {
              setQuery("");
              setHeadFilter("all");
              setStatusFilter("all");
            }}
          >
            {t.clearFilters}
          </button>
        </div>
      )}
    </>
  );
}

function BillForm({
  t,
  heads,
  bill,
  nextVoucher,
  onCancel,
  onSave,
  onHeadCreated,
}: {
  t: Strings;
  heads: GrantHeadDto[];
  bill: BillDto | null;
  nextVoucher: number;
  onCancel: () => void;
  onSave: (input: BillInput, id: number | null) => Promise<void>;
  onHeadCreated: (head: GrantHeadDto) => void;
}): JSX.Element {
  const [voucherNo, setVoucherNo] = useState(String(bill?.voucherNo ?? nextVoucher));
  const [billNo, setBillNo] = useState(bill?.billNo ?? "");
  const [billDate, setBillDate] = useState(bill?.billDate ?? "");
  const [description, setDescription] = useState(bill?.descriptionGu ?? "");
  const [vendor, setVendor] = useState(bill?.vendorGu ?? "");
  const [grantHeadId, setGrantHeadId] = useState(bill?.grantHeadId ?? heads[0]?.id ?? 0);
  const [amount, setAmount] = useState(bill ? amountToInput(bill.amountPaise) : "");
  const [deduction, setDeduction] = useState(bill ? amountToInput(bill.deductionPaise) : "0.00");

  const amountPaise = tryParseAmount(amount);
  const deductionPaise = tryParseAmount(deduction) ?? 0;
  const netPaise = amountPaise === null ? null : amountPaise - deductionPaise;

  const valid =
    billDate !== "" &&
    description !== "" &&
    vendor !== "" &&
    amountPaise !== null &&
    amountPaise > 0 &&
    deductionPaise >= 0 &&
    deductionPaise <= amountPaise &&
    Number.isInteger(Number(voucherNo)) &&
    Number(voucherNo) > 0;

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (!valid || amountPaise === null) return;
    void onSave(
      {
        voucherNo: Number(voucherNo),
        // Blank means genuinely no bill number - the direct-payment case.
        billNo: billNo.trim() === "" ? null : billNo.trim(),
        billDate,
        descriptionGu: description,
        vendorGu: vendor,
        grantHeadId,
        amountPaise,
        deductionPaise,
      },
      bill?.id ?? null,
    );
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="form-card-header">
        <h3 className="form-card-title">
          <span>{bill ? "✏️" : "➕"}</span>
          <span>{bill ? t.editBill : t.newBill}</span>
        </h3>
        {netPaise !== null && (
          <div className="calc-chip">
            <span>{t.netPayable}:</span>
            <Money paise={netPaise} />
          </div>
        )}
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="voucher">{t.voucherNo}</label>
          <input
            id="voucher"
            data-no-suggest
            className="num-input"
            inputMode="numeric"
            value={voucherNo}
            onChange={(e) => setVoucherNo(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="billno">{t.billNo}</label>
          {/* Text, never a date: Excel turned "1/2" into a date in the client's
              workbook (SPEC 9.7) and that is the bug this field prevents. */}
          <input
            id="billno"
            data-no-suggest
            value={billNo}
            onChange={(e) => setBillNo(e.target.value)}
            placeholder="1/2"
          />
        </div>
        <div className="field">
          <label htmlFor="billdate">{t.billDate}</label>
          <DateInput id="billdate" value={billDate} onChange={setBillDate} required />
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
          <label htmlFor="desc">{t.billDescription}</label>
          <input id="desc" data-suggest="bill.description" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="vendor">{t.billFrom}</label>
          <input id="vendor" data-suggest="vendor.name" value={vendor} onChange={(e) => setVendor(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="amount">{t.billAmount}</label>
          <input
            id="amount"
            className="num-input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="deduction">{t.deduction}</label>
          <input
            id="deduction"
            className="num-input"
            inputMode="decimal"
            value={deduction}
            onChange={(e) => setDeduction(e.target.value)}
          />
        </div>
        <div className="field">
          <label>{t.netAmount}</label>
          <div className="num" style={{ padding: "7px 0", fontWeight: 600 }}>
            {netPaise === null ? "—" : <Money paise={netPaise} />}
          </div>
        </div>
      </div>
      {amountPaise !== null && deductionPaise > amountPaise && (
        <p style={{ color: "var(--error-line)" }}>{t.deductionTooLarge}</p>
      )}
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
