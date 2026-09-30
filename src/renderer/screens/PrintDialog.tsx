import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { api } from "../api.js";
import type { PrintableReportId } from "../../shared/api.js";
import {
  DEFAULT_PAGE,
  MAX_SCALE_PCT,
  MIN_SCALE_PCT,
  ORIENTATIONS,
  PAPER_SIZES,
  fitScalePct,
  paperOf,
  resolvePage,
  type Orientation,
  type PageSetup,
  type PaperId,
  type ReportLayout,
} from "../../shared/report-layout.js";
import { useLanguage, useStrings, type Strings } from "../i18n/index.js";
import { PrintRoot, type LayoutCheck } from "../print/PrintRoot.js";

/**
 * The print window: the report as it will come out of the printer on the
 * left, and on the right what a print dialog offers - the paper, which way
 * round, the margins and the zoom.
 *
 * The preview is PrintRoot itself, given the settings being chosen, so it is
 * the very page the PDF and the printer get. The settings belong to the
 * report and are kept in the school's books with its layout (ReportLayout's
 * `page`): "Remember" saves them, and printing or saving a PDF from here
 * saves them first, so the report prints the same way next time and on the
 * other PCs the pen drive goes to.
 *
 * A report nobody has set up prints as it always has (DEFAULT_PAGE).
 */

/** How large the preview is drawn: fitted to the window's width, or actual size. */
type PreviewSize = "fit" | "actual";

/** The zooms a print dialog usually lists. */
const SCALE_PRESETS = [50, 60, 70, 75, 80, 90, 100, 110, 125, 150];

export function PrintDialog({
  report,
  reportLabel,
  onClose,
}: {
  report: PrintableReportId;
  reportLabel: string;
  onClose: (changed: boolean) => void;
}): JSX.Element {
  const t = useStrings();
  const { language } = useLanguage();
  const [saved, setSaved] = useState<ReportLayout | null>(null);
  const [page, setPage] = useState<PageSetup>({});
  const [busy, setBusy] = useState<"save" | "print" | "pdf" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [check, setCheck] = useState<LayoutCheck>({ sheets: [], cells: 0 });
  const [sheetCount, setSheetCount] = useState(0);
  const [previewSize, setPreviewSize] = useState<PreviewSize>("fit");
  const [frameWidth, setFrameWidth] = useState(0);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    void api
      .getReportLayout(report)
      .then((layout) => {
        setSaved(layout);
        setPage(layout.page ?? {});
      })
      .catch((cause: unknown) => setFailure(cause instanceof Error ? cause.message : String(cause)));
  }, [report]);

  const savedPage = saved?.page ?? {};
  const dirty = saved !== null && JSON.stringify(cleanPage(report, page)) !== JSON.stringify(cleanPage(report, savedPage));

  /** Close, asking first when there are settings not saved. */
  const close = useCallback(() => {
    if (dirty && !window.confirm(t.printDiscardConfirm)) return;
    onClose(changed);
  }, [dirty, changed, onClose, t]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // The preview: the saved layout, with the page being chosen.
  const previewLayout = useMemo<ReportLayout | null>(
    () => (saved ? withPage(report, saved, page) : null),
    [report, saved, page],
  );
  const resolved = resolvePage(report, page);

  const updateCheck = useCallback((next: LayoutCheck) => {
    setCheck((current) =>
      current.cells === next.cells && current.sheets.join() === next.sheets.join() ? current : next,
    );
    setSheetCount(document.querySelectorAll(".print-dialog .print-root > .sheet:not([aria-hidden])").length);
  }, []);

  // Fit the preview to the width of its frame: the sheet with its margin drawn round it.
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setFrameWidth(element.clientWidth));
    observer.observe(element);
    setFrameWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  const paperPx = (resolved.paperWidthMm * 96) / 25.4;
  const previewZoom =
    previewSize === "actual" || frameWidth === 0 ? 1 : Math.min(1, (frameWidth - 48) / (paperPx + 16));

  /** Save the page setup into the report's layout; true when it worked. */
  async function remember(): Promise<boolean> {
    // The layout as it is now in the books, so a change made in the layout
    // editor since this window opened is kept.
    const current = await api.getReportLayout(report);
    const result = await api.saveReportLayout(report, withPage(report, current, page));
    if (!result.ok) {
      const text = result.issues.map((issue) => (language === "en" ? issue.messageEn : issue.messageGu));
      setMessage({ kind: "error", text: text.join(" ") });
      return false;
    }
    setSaved(result.data);
    setPage(result.data.page ?? {});
    setChanged(true);
    return true;
  }

  async function run(which: "save" | "print" | "pdf"): Promise<void> {
    setBusy(which);
    setMessage(null);
    try {
      if ((dirty || which === "save") && !(await remember())) return;
      if (which === "save") {
        setMessage({ kind: "ok", text: t.printSaved });
      } else if (which === "print") {
        const result = await api.printReport(report);
        if (result.ok && result.data) setMessage({ kind: "ok", text: t.printSent });
        if (!result.ok) {
          const text = result.issues.map((issue) => (language === "en" ? issue.messageEn : issue.messageGu));
          setMessage({ kind: "error", text: text.join(" ") });
        }
      } else {
        const result = await api.exportPdf(report);
        if (result.ok && result.data) setMessage({ kind: "ok", text: t.pdfSaved(result.data) });
        if (!result.ok) {
          const text = result.issues.map((issue) => (language === "en" ? issue.messageEn : issue.messageGu));
          setMessage({ kind: "error", text: text.join(" ") });
        }
      }
    } finally {
      setBusy(null);
    }
  }

  const set = (patch: PageSetup): void => {
    setPage((current) => cleanPage(report, { ...current, ...patch }));
    setMessage(null);
  };

  const defaults = DEFAULT_PAGE[report];
  const defaultText = `${paperLabel(defaults.paper, t)} · ${
    defaults.orientation === "landscape" ? t.printLandscape : t.printPortrait
  } · ${defaults.marginMm} ${t.mm} · 100%`;
  const scalePct = Math.round(resolved.scale * 100);

  return (
    <div className="print-dialog" role="dialog" aria-modal="true" aria-label={t.printTitle(reportLabel)}>
      <div className="print-dialog-preview" ref={frameRef}>
        {failure !== null ? (
          <div className="state error">
            <p>{t.couldNotLoad}</p>
            <p className="num">{failure}</p>
          </div>
        ) : previewLayout ? (
          <div className="print-dialog-sheets" style={{ zoom: previewZoom } as CSSProperties}>
            <PrintRoot report={report} layout={previewLayout} onChecked={updateCheck} />
          </div>
        ) : (
          <div className="state">{t.loading}</div>
        )}
      </div>

      <aside className="print-dialog-panel">
        <div className="print-dialog-head">
          <h2>{t.printTitle(reportLabel)}</h2>
          <span className="muted">{sheetCount > 0 ? t.printSheets(sheetCount) : "…"}</span>
        </div>

        <div className="field">
          <label htmlFor="print-paper">{t.printPaper}</label>
          <select
            id="print-paper"
            value={resolved.paper}
            onChange={(event) => set({ paper: event.target.value as PaperId })}
          >
            {PAPER_SIZES.map((paper) => (
              <option key={paper.id} value={paper.id}>
                {paper.labelGu} ({t.printPaperSizeMm(paper.shortMm, paper.longMm)})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>{t.printOrientation}</label>
          <div className="segmented">
            {ORIENTATIONS.map((orientation: Orientation) => (
              <button
                key={orientation}
                className={
                  (resolved.landscape ? "landscape" : "portrait") === orientation ? "primary small" : "ghost small"
                }
                onClick={() => set({ orientation })}
              >
                <span className={`orientation-icon ${orientation}`} aria-hidden />
                {orientation === "landscape" ? t.printLandscape : t.printPortrait}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="print-scale">{t.printScale}</label>
          <div className="print-scale">
            <button
              className="ghost small"
              aria-label="−"
              onClick={() => set({ scalePct: Math.max(MIN_SCALE_PCT, scalePct - 5) })}
            >
              −
            </button>
            <NumberBox
              id="print-scale"
              list="print-scale-presets"
              value={scalePct}
              min={MIN_SCALE_PCT}
              max={MAX_SCALE_PCT}
              whole
              onChange={(value) => set({ scalePct: value })}
            />
            <datalist id="print-scale-presets">
              {SCALE_PRESETS.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
            <button
              className="ghost small"
              aria-label="+"
              onClick={() => set({ scalePct: Math.min(MAX_SCALE_PCT, scalePct + 5) })}
            >
              +
            </button>
            <button className="ghost small" onClick={() => set({ scalePct: fitScalePct(report, page) })}>
              {t.printFit}
            </button>
          </div>
          <input
            type="range"
            min={MIN_SCALE_PCT}
            max={MAX_SCALE_PCT}
            step={1}
            value={scalePct}
            onChange={(event) => set({ scalePct: Number(event.target.value) })}
          />
        </div>

        <div className="field">
          <label htmlFor="print-margin">{t.printMargin}</label>
          <div className="print-scale">
            <button
              className="ghost small"
              aria-label="−"
              onClick={() => set({ marginMm: Math.max(0, resolved.marginMm - 1) })}
            >
              −
            </button>
            <NumberBox
              id="print-margin"
              value={resolved.marginMm}
              min={0}
              max={30}
              onChange={(value) => set({ marginMm: value })}
            />
            <button
              className="ghost small"
              aria-label="+"
              onClick={() => set({ marginMm: Math.min(30, resolved.marginMm + 1) })}
            >
              +
            </button>
          </div>
        </div>

        <p className="layout-hint">{t.printDefaultIs(defaultText)}</p>
        <button className="ghost small" disabled={Object.keys(page).length === 0} onClick={() => setPage({})}>
          {t.printReset}
        </button>

        {check.sheets.length > 0 && (
          <div className="issue error">{t.layoutOverflow(check.sheets.join(", "))}</div>
        )}
        {message && <div className={`issue ${message.kind === "ok" ? "warning" : "error"}`}>{message.text}</div>}
        {dirty && <p className="layout-hint">{t.printUnsavedNote}</p>}

        <div className="print-dialog-actions">
          <button className="primary" disabled={busy !== null || saved === null} onClick={() => void run("print")}>
            🖨️ {busy === "print" ? t.printing : t.printNow}
          </button>
          <button className="ghost" disabled={busy !== null || saved === null} onClick={() => void run("pdf")}>
            📄 {busy === "pdf" ? t.savingPdf : t.savePdf}
          </button>
          <button
            className="ghost"
            disabled={busy !== null || saved === null || !dirty}
            onClick={() => void run("save")}
          >
            {busy === "save" ? t.printSaving : t.printSave}
          </button>
          <button className="ghost" onClick={close}>
            {t.printClose}
          </button>
        </div>

        <div className="print-dialog-view">
          <div className="segmented">
            <button
              className={previewSize === "fit" ? "primary small" : "ghost small"}
              onClick={() => setPreviewSize("fit")}
            >
              ⤢
            </button>
            <button
              className={previewSize === "actual" ? "primary small" : "ghost small"}
              onClick={() => setPreviewSize("actual")}
            >
              100%
            </button>
          </div>
        </div>
        <p className="layout-hint">{t.printRememberNote}</p>
      </aside>
    </div>
  );
}

/**
 * Only what differs from the report's default is kept, so "back to default"
 * really is the default - and a report nobody changed stores nothing.
 */
export function cleanPage(report: PrintableReportId, page: PageSetup): PageSetup {
  const base = DEFAULT_PAGE[report];
  const out: PageSetup = {};
  if (page.paper !== undefined && page.paper !== base.paper) out.paper = page.paper;
  if (page.orientation !== undefined && page.orientation !== base.orientation) out.orientation = page.orientation;
  if (page.scalePct !== undefined && page.scalePct !== 100) out.scalePct = page.scalePct;
  if (page.marginMm !== undefined && page.marginMm !== base.marginMm) out.marginMm = page.marginMm;
  return out;
}

function withPage(report: PrintableReportId, layout: ReportLayout, page: PageSetup): ReportLayout {
  const next: ReportLayout = { ...layout };
  const kept = cleanPage(report, page);
  if (Object.keys(kept).length === 0) delete next.page;
  else next.page = kept;
  return next;
}

/** A number typed freely and taken when the box is left or Enter is pressed. */
function NumberBox({
  id,
  list,
  value,
  min,
  max,
  whole = false,
  onChange,
}: {
  id: string;
  list?: string;
  value: number;
  min: number;
  max: number;
  whole?: boolean;
  onChange: (value: number) => void;
}): JSX.Element {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (raw: string): void => {
    const parsed = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, whole ? Math.round(parsed) : Math.round(parsed * 10) / 10));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <input
      id={id}
      className="num-input"
      list={list}
      inputMode={whole ? "numeric" : "decimal"}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        // A preset picked from the list is taken at once.
        if (list && SCALE_PRESETS.includes(Number(event.target.value))) commit(event.target.value);
      }}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
      }}
    />
  );
}

function paperLabel(id: PaperId, t: Strings): string {
  const paper = paperOf(id);
  return `${paper.labelGu} (${t.printPaperSizeMm(paper.shortMm, paper.longMm)})`;
}
