/**
 * Turning a report into a PDF.
 *
 * Electron ships Chromium, so the PDF is produced by the same engine that
 * renders the preview: an offscreen window loads the `#print:<report>` route and
 * `printToPDF` captures it. Two consequences worth stating, because they are the
 * reason this project chose Electron over a Node PDF library:
 *
 *  1. **Gujarati shapes correctly.** Chromium lays out text with HarfBuzz, so
 *     conjuncts (ક્ષ, જ્ઞ, શ્રી), reph (ખર્ચ) and ્ર (પ્રવેશોત્સવ) come out right
 *     with no font surgery. Most Node PDF libraries render Indic text as
 *     disconnected glyphs.
 *  2. **The preview is the artefact.** The same DOM and the same stylesheet
 *     produce both, so proofreading on screen is meaningful.
 *
 * The offscreen window is a plain hidden BrowserWindow rather than `offscreen:
 * true`, because offscreen rendering skips some font and layout work that the
 * printed output depends on.
 */
import { BrowserWindow } from "electron";
import path from "node:path";
import { writeFile } from "node:fs/promises";

import type { ResolvedPage } from "../src/shared/report-layout.js";

export interface PdfRequest {
  report: string;
  /** Where to write the file. */
  outputPath: string;
  /** The renderer to load: the dev server URL, or a file path when packaged. */
  rendererUrl: string | null;
  rendererFile: string | null;
  preloadPath: string;
  /** Paper, orientation and margins, from the report's page setup (resolvePage). */
  page: ResolvedPage;
}

/** How long to wait for the report to say it has rendered. */
const READY_TIMEOUT_MS = 15_000;

export async function exportReportPdf(request: PdfRequest): Promise<string> {
  const window = await renderReport(request);
  try {
    const { page } = request;
    const pdf = await window.webContents.printToPDF({
      landscape: page.landscape,
      // The paper as it stands upright, in inches. preferCSSPageSize below
      // means the stylesheet's @page wins anyway (PrintRoot writes it from
      // the same page setup), but stating it here keeps the two from
      // disagreeing silently.
      pageSize: paperInches(page),
      printBackground: true,
      // The stylesheet owns the margins through @page, so Chromium must not
      // add its own on top.
      margins: { marginType: "none" },
      preferCSSPageSize: true,
    });

    await writeFile(request.outputPath, pdf);
    return request.outputPath;
  } finally {
    window.destroy();
  }
}

export type PrintRequest = Omit<PdfRequest, "outputPath">;

/**
 * Print a report on a printer: the same hidden window as the PDF, then the
 * system's print dialog, where the printer, the copies and the pages are chosen.
 * Resolves true when it was sent to the printer, false when the dialog was
 * cancelled.
 */
export async function printReport(request: PrintRequest): Promise<boolean> {
  const window = await renderReport(request);
  try {
    const { page } = request;
    return await new Promise<boolean>((resolve, reject) => {
      window.webContents.print(
        {
          silent: false,
          printBackground: true,
          landscape: page.landscape,
          // In microns. The stylesheet's @page says the same.
          pageSize: {
            width: Math.round(Math.min(page.paperWidthMm, page.paperHeightMm) * 1000),
            height: Math.round(Math.max(page.paperWidthMm, page.paperHeightMm) * 1000),
          },
          margins: { marginType: "none" },
        },
        (success, failureReason) => {
          // Cancelling the dialog is not a failure.
          if (success || /cancel/i.test(failureReason)) resolve(success);
          else reject(new Error(`printing failed: ${failureReason}`));
        },
      );
    });
  } finally {
    window.destroy();
  }
}

/** The paper as it stands upright, in inches. */
function paperInches(page: ResolvedPage): { width: number; height: number } {
  return {
    width: Math.min(page.paperWidthMm, page.paperHeightMm) / 25.4,
    height: Math.max(page.paperWidthMm, page.paperHeightMm) / 25.4,
  };
}

/** Load the report's print route in a hidden window and wait until it has rendered. */
async function renderReport(request: PrintRequest): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    show: false,
    // Comfortably larger than the sheet, so the hidden window never reflows the
    // layout differently from the preview.
    width: request.page.landscape ? 1600 : 1100,
    height: request.page.landscape ? 1100 : 1600,
    webPreferences: {
      preload: request.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  try {
    const hash = `print:${request.report}`;

    if (request.rendererUrl) {
      await window.loadURL(`${request.rendererUrl}#${hash}`);
    } else if (request.rendererFile) {
      await window.loadFile(request.rendererFile, { hash });
    } else {
      throw new Error("no renderer location given for the PDF export");
    }

    await waitForPrintReady(window);
    return window;
  } catch (error) {
    window.destroy();
    throw error;
  }
}

/**
 * Wait for the print route to set window.__printReady.
 *
 * Polling a flag rather than sleeping a fixed time: a slow query would otherwise
 * produce a PDF of an empty page, which is exactly the sort of silent wrongness
 * this project is meant to remove.
 */
async function waitForPrintReady(window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  for (;;) {
    const ready = await window.webContents.executeJavaScript("window.__printReady === true");
    if (ready === true) return;

    if (Date.now() > deadline) {
      throw new Error(
        "the report did not finish rendering within 15 seconds; nothing was written",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}

/** A sensible default filename, e.g. "parishisht-10-2025-26.pdf". */
export function defaultPdfName(report: string, yearLabel: string): string {
  const names: Record<string, string> = {
    annexure10: "parishisht-10",
    rojmel: "rojmel",
    grantRegister: "grant-register",
    chequeRegister: "cheque-register",
    billRegister: "bill-register",
    vouchers: "vouchers",
    patrakD: "patrak-d",
    khatavahi: "khatavahi",
    annexure9: "parishisht-9",
  };
  return `${names[report] ?? report}-${yearLabel}.pdf`;
}

