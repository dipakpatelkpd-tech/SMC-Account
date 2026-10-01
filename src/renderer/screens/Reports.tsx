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
import { PrintDialog } from "./PrintDialog.js";
import { paperOf, resolvePage } from "../../shared/report-layout.js";
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

const STATUTORY_TABS: PrintableReportId[] = ["rojmel", "khatavahi", "annexure10", "annexure9", "patrakD"];
const REGISTER_TABS: PrintableReportId[] = ["grantRegister", "chequeRegister", "billRegister", "vouchers"];
const FIGURE_TABS: FigureTab[] = ["balances", "ledgers"];

function getReportDescription(tab: PrintableReportId): string {
  switch (tab) {
    case "rojmel":
      return "રોજમેળ (કેશ બુક) — શાળાના તમામ આવક અને જાવક વ્યવહારોની દૈનિક ક્રમબદ્ધ નોંધ.";
    case "khatavahi":
      return "ખાતાવહી — ગ્રાન્ટ હેડ મુજબ ખાતાઓની વિગતો, જમા અને ઉધાર વ્યવહારો તથા સિલક.";
    case "annexure10":
      return "પરિશિષ્ટ ૧૦ — ગ્રાન્ટ મુજબ વાર્ષિક હિસાબ પત્રક (ઓપનિંગ બેલેન્સ, મળેલી ગ્રાન્ટ, ખર્ચ અને આખર સિલક).";
    case "annexure9":
      return "પરિશિષ્ટ ૯ — બેંક સાથે મેળવણું (બેંક રિકન્સીલિએશન સ્ટેટમેન્ટ).";
    case "patrakD":
      return "પત્રક – D — ઓડિટ અને વાર્ષિક તપાસ માટેનું વિગતવાર પત્રક.";
    case "grantRegister":
      return "ગ્રાન્ટ રજીસ્ટર — વર્ષ દરમિયાન મળેલ તમામ ગ્રાન્ટ અને તેના ખર્ચની વિગતો.";
    case "chequeRegister":
      return "ચેક રજીસ્ટર — લખાયેલા તમામ ચેક, જેના નામે લખ્યા અને વટાવ્યાની તારીખો.";
    case "billRegister":
      return "બિલ રજીસ્ટર — વાઉચર મુજબના તમામ બિલ, વેપારી અને રકમની નોંધ.";
    case "vouchers":
      return "વાઉચર — ચુકવણીના પ્રિન્ટેડ વાઉચર ફોર્મ્સ.";
  }
}

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
  const [showPreview, setShowPreview] = useState(false);
  // One flag per kind of export, so the two buttons can be told apart while one
  // of them is working.
  const [saving, setSaving] = useState<"pdf" | "excel" | "excel-all" | null>(null);
  const [saved, setSaved] = useState<{ kind: "pdf" | "excel"; path: string } | null>(null);
  // The layout editor replaces the preview while it is open. The exports are
  // hidden meanwhile: they print the SAVED layout, and a half-edited one on
  // screen beside them would say otherwise.
  const [editing, setEditing] = useState(false);
  const [layoutDirty, setLayoutDirty] = useState(false);
  // The print window, over everything while it is open.
  const [printing, setPrinting] = useState(false);
  // Bumped when the print window saved new settings, so the summary reloads.
  const [pageVersion, setPageVersion] = useState(0);
  const pageSummary = usePageSummary(isPrintable(tab) ? tab : null, pageVersion, t);

  /** Leaving the editor, or its report, with changes not saved: ask first. */
  function mayLeaveEditor(): boolean {
    return !editing || !layoutDirty || window.confirm(t.layoutDiscardConfirm);
  }

  function chooseTab(next: Tab): void {
    if (next === tab || !mayLeaveEditor()) return;
    setTab(next);
    setSaved(null);
    setLayoutDirty(false);
    setShowPreview(false);
    setPrinting(false);
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
            <button
              className={showPreview ? "ghost" : "primary"}
              onClick={() => setShowPreview(!showPreview)}
            >
              <span>👁️</span> {showPreview ? t.hidePreview : t.viewPreview}
            </button>
          )}
          {isPrintable(tab) && !editing && (
            <button className="ghost" disabled={saving !== null} onClick={() => setEditing(true)}>
              <span>✏️</span> {t.layoutEdit}
            </button>
          )}
          {editing && <span className="muted">{t.layoutUnsavedExport}</span>}
          {isPrintable(tab) && !editing && (
            <button className="ghost" disabled={saving !== null} onClick={() => setPrinting(true)}>
              <span>🖨️</span> {t.printOpen}
            </button>
          )}
          {isPrintable(tab) && !editing && (
            <button className="ghost" disabled={saving !== null} onClick={() => runExport("pdf")}>
              <span>📄</span> {saving === "pdf" ? t.savingPdf : t.savePdf}
            </button>
          )}
          {isPrintable(tab) && !editing && (
            <button className="ghost" disabled={saving !== null} onClick={() => runExport("excel")}>
              <span>📊</span> {saving === "excel" ? t.savingExcel : t.saveExcel}
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
              <span>📑</span> {saving === "excel-all" ? t.savingExcel : t.saveExcelAll}
            </button>
          )}
        </div>
      </div>

      <div className="tab-category-strip card" style={{ padding: "12px 14px", marginBottom: 18 }}>
        <div className="tab-category-row">
          <span className="tab-category-label">🏛️ {t.groupStatutory}</span>
          <div className="tab-category-buttons">
            {STATUTORY_TABS.map((id) => (
              <button key={id} className={tab === id ? "primary small" : "ghost small"} onClick={() => chooseTab(id)}>
                {labelFor(id, t)}
              </button>
            ))}
          </div>
        </div>

        <div className="tab-category-row" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-subtle)" }}>
          <span className="tab-category-label">📋 {t.groupRegisters}</span>
          <div className="tab-category-buttons">
            {REGISTER_TABS.map((id) => (
              <button key={id} className={tab === id ? "primary small" : "ghost small"} onClick={() => chooseTab(id)}>
                {labelFor(id, t)}
              </button>
            ))}
          </div>
        </div>

        <div className="tab-category-row" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-subtle)" }}>
          <span className="tab-category-label">📊 {t.groupFigures}</span>
          <div className="tab-category-buttons">
            {FIGURE_TABS.map((id) => (
              <button key={id} className={tab === id ? "primary small" : "ghost small"} onClick={() => chooseTab(id)}>
                {labelFor(id, t)}
              </button>
            ))}
          </div>
        </div>
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
          reportLabel={labelFor(tab, t)}
          onDirtyChange={setLayoutDirty}
          onClose={() => {
            setEditing(false);
            setLayoutDirty(false);
          }}
        />
      ) : isPrintable(tab) && printing ? (
        <PrintDialog
          key={tab}
          report={tab}
          reportLabel={labelFor(tab, t)}
          onClose={(changed) => {
            setPrinting(false);
            if (changed) setPageVersion((version) => version + 1);
          }}
        />
      ) : isPrintable(tab) ? (
        showPreview ? (
          <div className="report-preview-section">
            <div className="report-preview-toolbar">
              <div className="report-preview-toolbar-title">
                <span>📄 {labelFor(tab, t)} — {t.viewPreview}</span>
                <span className="report-preview-toolbar-badge">{t.printPreviewNote}</span>
              </div>
              <div className="row-actions">
                <button className="ghost small" onClick={() => setShowPreview(false)}>
                  ✕ {t.hidePreview}
                </button>
                <button className="ghost small" disabled={saving !== null} onClick={() => setEditing(true)}>
                  <span>✏️</span> {t.layoutEdit}
                </button>
                <button className="primary small" disabled={saving !== null} onClick={() => setPrinting(true)}>
                  <span>🖨️</span> {t.printOpen}
                </button>
                <button className="ghost small" disabled={saving !== null} onClick={() => runExport("pdf")}>
                  <span>📄</span> {saving === "pdf" ? t.savingPdf : t.savePdf}
                </button>
                <button className="ghost small" disabled={saving !== null} onClick={() => runExport("excel")}>
                  <span>📊</span> {saving === "excel" ? t.savingExcel : t.saveExcel}
                </button>
              </div>
            </div>
            <div className="report-preview-frame">
              <div className="report-preview-content">
                <PrintRoot key={tab} report={tab} />
              </div>
            </div>
          </div>
        ) : (
          <div className="card report-overview-card">
            <div className="report-overview-header">
              <div className="report-overview-info">
                <div className="report-overview-badge">
                  {STATUTORY_TABS.includes(tab as any) ? `🏛️ ${t.groupStatutory}` : `📋 ${t.groupRegisters}`}
                </div>
                <h3>{labelFor(tab, t)}</h3>
                <p className="report-overview-desc">
                  {getReportDescription(tab)}
                  {pageSummary && ` (${pageSummary})`}
                </p>
                <p className="report-overview-hint muted">
                  {t.previewPrompt}
                </p>
              </div>
              <div className="report-overview-actions">
                <button
                  className="primary"
                  onClick={() => setShowPreview(true)}
                >
                  <span>👁️</span> {t.viewPreview}
                </button>
                <button className="ghost" disabled={saving !== null} onClick={() => setPrinting(true)}>
                  <span>🖨️</span> {t.printOpen}
                </button>
                <button
                  className="ghost"
                  disabled={saving !== null}
                  onClick={() => runExport("pdf")}
                >
                  <span>📄</span> {saving === "pdf" ? t.savingPdf : t.savePdf}
                </button>
                <button
                  className="ghost"
                  disabled={saving !== null}
                  onClick={() => runExport("excel")}
                >
                  <span>📊</span> {saving === "excel" ? t.savingExcel : t.saveExcel}
                </button>
                <button
                  className="ghost"
                  disabled={saving !== null}
                  onClick={() => setEditing(true)}
                >
                  <span>✏️</span> {t.layoutEdit}
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        <Figures tab={tab} />
      )}
    </>
  );
}

/** "A4 (210 × 297 મિમી), આડો, 100%": how the report prints now. */
function usePageSummary(report: PrintableReportId | null, version: number, t: Strings): string | null {
  const [summary, setSummary] = useState<string | null>(null);
  useEffect(() => {
    setSummary(null);
    if (!report) return;
    let current = true;
    void api
      .getReportLayout(report)
      .then((layout) => {
        if (!current) return;
        const page = resolvePage(report, layout.page);
        const paper = paperOf(page.paper);
        setSummary(
          `${paper.labelGu} ${t.printPaperSizeMm(paper.shortMm, paper.longMm)}, ${
            page.landscape ? t.printLandscape : t.printPortrait
          }, ${Math.round(page.scale * 100)}%`,
        );
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [report, version, t]);
  return summary;
}

/** The number-only views: the running balances and the ledgers. */
function Figures({ tab }: { tab: FigureTab }): JSX.Element {
  const t = useStrings();
  const [balances, setBalances] = useState<DayBalance[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [selectedHead, setSelectedHead] = useState<string>("all");

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

  const filteredLedgers = selectedHead === "all"
    ? ledgers
    : ledgers.filter((acc) => acc.headCode === selectedHead);

  return (
    <>
      <div className="search-filter-bar" style={{ marginBottom: 16 }}>
        <div className="filter-group">
          <label style={{ fontSize: 13, fontWeight: 600, marginRight: 8, color: "var(--ink)" }}>
            ખાતું પસંદ કરો:
          </label>
          <select
            className="filter-select"
            value={selectedHead}
            onChange={(e) => setSelectedHead(e.target.value)}
          >
            <option value="all">બધા ખાતા ({ledgers.length})</option>
            {ledgers.map((acc) => (
              <option key={acc.headCode} value={acc.headCode}>
                {acc.nameGu}
              </option>
            ))}
          </select>
        </div>
        {selectedHead !== "all" && (
          <button
            type="button"
            className="ghost small"
            onClick={() => setSelectedHead("all")}
          >
            {t.clearFilters}
          </button>
        )}
      </div>

      {filteredLedgers.map((account) => (
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
