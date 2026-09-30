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

/** Page setup per report, following SPEC section 6. */
export interface PageSetup {
  landscape: boolean;
}

const PAGE_SETUP: Record<string, PageSetup> = {
  // Annexure 9 and 10 are portrait; the rojmel, ledger and registers are not.
  annexure10: { landscape: false },
  rojmel: { landscape: true },
  // The three registers and પત્રક-D are wide tables; the voucher is a portrait
  // sheet per voucher.
  grantRegister: { landscape: true },
  chequeRegister: { landscape: true },
  billRegister: { landscape: true },
  patrakD: { landscape: true },
  vouchers: { landscape: false },
  khatavahi: { landscape: true },
  annexure9: { landscape: false },
};

export interface PdfRequest {
  report: string;
  /** Where to write the file. */
  outputPath: string;
  /** The renderer to load: the dev server URL, or a file path when packaged. */
  rendererUrl: string | null;
  rendererFile: string | null;
  preloadPath: string;
}

/** How long to wait for the report to say it has rendered. */
const READY_TIMEOUT_MS = 15_000;

export async function exportReportPdf(request: PdfRequest): Promise<string> {
  const setup = PAGE_SETUP[request.report] ?? { landscape: false };

  const window = new BrowserWindow({
    show: false,
    // Comfortably larger than a Legal sheet (1268 x 740 px landscape), so the
    // offscreen window never reflows the layout differently from the preview.
    width: setup.landscape ? 1500 : 1000,
    height: setup.landscape ? 1000 : 1500,
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

    const pdf = await window.webContents.printToPDF({
      landscape: setup.landscape,
      // Legal, 8.5 x 14in - the paper the school prints these forms on.
      // preferCSSPageSize below means the stylesheet's @page wins anyway, but
      // stating it here keeps the two from disagreeing silently.
      pageSize: "Legal",
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

export function reportPageSetup(report: string): PageSetup {
  return PAGE_SETUP[report] ?? { landscape: false };
}

export { PAGE_SETUP };
