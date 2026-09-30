import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { BillDto, BillInput, GrantHeadDto } from "../../shared/api.js";
import type { Issue } from "../../engine/validation.js";
import { Money } from "../components/Money.js";
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

  const vouchers = [...new Set(bills.map((bill) => bill.voucherNo))].sort((a, b) => a - b);
  const total = bills.reduce((sum, bill) => sum + bill.netPaise, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.billsTitle}</h2>
          <p>{t.billsSubtitle}</p>
        </div>
        <button className="primary" onClick={() => { setEditing("new"); setIssues([]); }}>
          {t.newBill}
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
          nextVoucher={(vouchers[vouchers.length - 1] ?? 0) + 1}
          onCancel={() => { setEditing(null); setIssues([]); }}
          onSave={save}
        />
      )}

      {vouchers.map((voucherNo) => {
        const rows = bills.filter((bill) => bill.voucherNo === voucherNo);
        const voucherTotal = rows.reduce((sum, bill) => sum + bill.netPaise, 0);
        const paidBy = rows.find((bill) => bill.chequeNo !== null)?.chequeNo ?? null;

        return (
          <div className="card" key={voucherNo}>
            <h3>
              {t.voucher} {voucherNo}{" "}
              <span className="muted" style={{ fontWeight: 400 }}>
                {paidBy === null ? t.notLinkedToCheque : t.linkedToCheque(paidBy)}
              </span>
            </h3>
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
                    <td className="num">
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
        );
      })}

      {bills.length === 0 && (
        <div className="card">
          <p className="muted">{t.noBills}</p>
        </div>
      )}

      {bills.length > 0 && (
        <p className="muted">
          {t.billsSummary(bills.length)} <Money paise={total} />
        </p>
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
}: {
  t: Strings;
  heads: GrantHeadDto[];
  bill: BillDto | null;
  nextVoucher: number;
  onCancel: () => void;
  onSave: (input: BillInput, id: number | null) => Promise<void>;
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
    <form className="card" onSubmit={submit}>
      <h3>{bill ? t.editBill : t.billsTitle}</h3>
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
          <input
            id="billdate"
            type="date"
            value={billDate}
            onChange={(e) => setBillDate(e.target.value)}
            required
          />
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
