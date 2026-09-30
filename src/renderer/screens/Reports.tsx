import { useEffect, useState } from "react";
import type { JSX } from "react";
import { api } from "../api.js";
import type { DayBalance, Ledger } from "../../engine/types.js";
import { PRINTABLE_REPORTS, type PrintableReportId } from "../../shared/api.js";
import { Money } from "../components/Money.js";
import { formatDate } from "../format.js";
import { useStrings, type Strings } from "../i18n/index.js";
import { PrintRoot } from "../print/PrintRoot.js";
import { LayoutEditor } from "./LayoutEditor.js";
import "../print/print.css";

/**
 * Reports.
 *
 * Two kinds of tab:
 *
 *  - **Printable forms** render `PrintRoot`, the very component the PDF is made
 *    from. The preview is therefore the artefact rather than a picture of it,
 *    so a layout problem shows up here before anyone exports one.
 *  - **Figures** are working views of numbers that have no form of their own
 *    yet: the running balances, the ledgers, and the reconciliation.
 */
type FigureTab = "balances" | "ledgers";
type Tab = PrintableReportId | FigureTab;

const FIGURE_TABS: FigureTab[] = ["balances", "ledgers"];

function labelFor(tab: Tab, t: Strings): string {
  switch (tab) {
    case "rojmel":
      return t.tabRojmel;
    case "khatavahi":
      return t.tabLedgers;
    case "annexure9":
      return t.tabAnnexure9;
    case "grantRegister":
      return t.tabGrantRegisterPrint;
    case "chequeRegister":
      return t.tabChequeRegister;
    case "billRegister":
      return t.tabBillRegister;
    case "vouchers":
      return t.tabVouchers;
    case "patrakD":
      return t.tabPatrakD;
    case "annexure10":
      return t.tabAnnexure10;
    case "balances":
      return t.tabBalances;
    case "ledgers":
      return t.tabLedgers;
  }
}

function isPrintable(tab: Tab): tab is PrintableReportId {
  return (PRINTABLE_REPORTS as readonly string[]).includes(tab);
}

export function Reports(): JSX.Element {
  const t = useStrings();
  const [tab, setTab] = useState<Tab>("rojmel");
  // One flag per kind of export, so the two buttons can be told apart while one
  // of them is working.
  const [saving, setSaving] = useState<"pdf" | "excel" | "excel-all" | null>(null);
  const [saved, setSaved] = useState<{ kind: "pdf" | "excel"; path: string } | null>(null);
  // The layout editor replaces the preview while it is open. The exports are
  // hidden meanwhile: they print the SAVED layout, and a half-edited one on
  // screen beside them would say otherwise.
  const [editing, setEditing] = useState(false);
  const [layoutDirty, setLayoutDirty] = useState(false);

  /** Leaving the editor, or its report, with changes not saved: ask first. */
  function mayLeaveEditor(): boolean {
    return !editing || !layoutDirty || window.confirm(t.layoutDiscardConfirm);
  }

  function chooseTab(next: Tab): void {
    if (next === tab || !mayLeaveEditor()) return;
    setTab(next);
    setSaved(null);
    setLayoutDirty(false);
    if (!isPrintable(next)) setEditing(false);
  }

  /** Both exports end the same way: a path to report, or a cancelled dialog. */
  function runExport(which: "pdf" | "excel" | "excel-all"): void {
    setSaving(which);
    setSaved(null);
    const work =
      which === "pdf"
        ? api.exportPdf(tab as PrintableReportId)
        : api.exportExcel(which === "excel-all" ? "all" : (tab as PrintableReportId));
    void work
      .then((result) => {
        if (result.ok && result.data) {
          setSaved({ kind: which === "pdf" ? "pdf" : "excel", path: result.data });
        }
      })
      .finally(() => setSaving(null));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>{t.reportsTitle}</h2>
          <p>
            {editing ? t.layoutEditNote : isPrintable(tab) ? t.printPreviewNote : t.reportsSubtitle}
          </p>
        </div>
        <div className="row-actions">
          {isPrintable(tab) && !editing && (
            <button className="ghost" disabled={saving !== null} onClick={() => setEditing(true)}>
              {t.layoutEdit}
            </button>
          )}
          {editing && <span className="muted">{t.layoutUnsavedExport}</span>}
          {isPrintable(tab) && !editing && (
            <button className="primary" disabled={saving !== null} onClick={() => runExport("pdf")}>
              {saving === "pdf" ? t.savingPdf : t.savePdf}
            </button>
          )}
          {isPrintable(tab) && !editing && (
            <button className="ghost" disabled={saving !== null} onClick={() => runExport("excel")}>
              {saving === "excel" ? t.savingExcel : t.saveExcel}
            </button>
          )}
          {/* The whole year in one workbook, whichever tab is open - this is the
              file a BRC asks for when they want to check the figures. */}
          {!editing && (
            <button
              className="ghost"
              disabled={saving !== null}
              onClick={() => runExport("excel-all")}
            >
              {saving === "excel-all" ? t.savingExcel : t.saveExcelAll}
            </button>
          )}
        </div>
      </div>

      <div className="tab-bar">
        <span className="tab-group">{t.groupPrintable}</span>
        {PRINTABLE_REPORTS.map((id) => (
          <button key={id} className={tab === id ? "primary" : "ghost"} onClick={() => chooseTab(id)}>
            {labelFor(id, t)}
          </button>
        ))}

        <span className="tab-group">{t.groupFigures}</span>
        {FIGURE_TABS.map((id) => (
          <button key={id} className={tab === id ? "primary" : "ghost"} onClick={() => chooseTab(id)}>
            {labelFor(id, t)}
          </button>
        ))}
      </div>

      {saved !== null && (
        <div className="issue warning">
          <div>{saved.kind === "pdf" ? t.pdfSaved(saved.path) : t.excelSaved(saved.path)}</div>
        </div>
      )}

      {isPrintable(tab) && editing ? (
        <LayoutEditor
          key={tab}
          report={tab}
          onDirtyChange={setLayoutDirty}
          onClose={() => {
            setEditing(false);
            setLayoutDirty(false);
          }}
        />
      ) : isPrintable(tab) ? (
        // Keyed by tab so switching reports remounts and refetches cleanly.
        <PrintRoot key={tab} report={tab} />
      ) : (
        <Figures tab={tab} />
      )}
    </>
  );
}

/** The number-only views: the running balances and the ledgers. */
function Figures({ tab }: { tab: FigureTab }): JSX.Element {
  const t = useStrings();
  const [balances, setBalances] = useState<DayBalance[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [nextBalances, nextLedgers] = await Promise.all([
          api.getBalances(),
          api.getLedgers(),
        ]);
        setBalances(nextBalances);
        setLedgers(nextLedgers);
      } catch (cause) {
        // Without this the screen spins forever on a failed call, showing a
        // spinner and no clue - which is exactly what happened once.
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

  if (loading) return <div className="state">{t.calculating}</div>;

  if (tab === "balances") {
    return (
      <div className="card">
        <h3>{t.balancesTitle}</h3>
        <table>
          <thead>
            <tr>
              <th>{t.date}</th>
              <th className="num">{t.cash}</th>
              <th className="num">{t.bank}</th>
              <th className="num">{t.total}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) => (
              <tr key={balance.date}>
                <td className="num">{formatDate(balance.date)}</td>
                <td className="num">
                  <Money paise={balance.cashPaise} />
                </td>
                <td className="num">
                  <Money paise={balance.bankPaise} />
                </td>
                <td className="num">
                  <Money paise={balance.totalPaise} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {ledgers.map((account) => (
        <div className="card" key={account.headCode}>
          <h3>{account.nameGu}</h3>
          <table>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th className="num">રોજમેળ પાનું</th>
                <th>{t.colDescription}</th>
                <th className="num">{t.colCredit}</th>
                <th className="num">{t.colDebit}</th>
                <th className="num">{t.colCreditBalance}</th>
                <th className="num">{t.colDebitBalance}</th>
              </tr>
            </thead>
            <tbody>
              {account.rows.map((row, index) => (
                <tr key={index}>
                  <td className="num">{formatDate(row.date)}</td>
                  {/* Filled in now that the cash book is paginated. */}
                  <td className="num">{row.rojmelPage ?? ""}</td>
                  <td>{row.descriptionGu}</td>
                  <td className="num credit">
                    <Money paise={row.creditPaise} />
                  </td>
                  <td className="num debit">
                    <Money paise={row.debitPaise} />
                  </td>
                  <td className="num">
                    <Money paise={row.creditBalancePaise} />
                  </td>
                  <td className="num">
                    <Money paise={row.debitBalancePaise} />
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={3}>{t.colClosing}</td>
                <td className="num">
                  <Money paise={account.totalCreditPaise} />
                </td>
                <td className="num">
                  <Money paise={account.totalDebitPaise} />
                </td>
                <td className="num">
                  <Money paise={account.closingPaise} />
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
