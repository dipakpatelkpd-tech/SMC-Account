/**
 * Electron main process.
 *
 * Owns the database, the engine and the account. The renderer never touches
 * any of them - it asks over IPC, which is the same contract a web server would
 * answer (src/shared/api.ts).
 *
 * The shape is Tally's (docs/DECISIONS.md, "Accounts, schools and pen drives"):
 *
 *  - The software is installed on each PC. This PC's own state - who is
 *    signed in, which schools it has opened and where - lives in
 *    app.getPath("userData"), never next to the executable, which is read-only
 *    once installed.
 *  - Each school's books are an encrypted database in a folder the user chose,
 *    usually on a pen drive. AppController (src/server/app-controller.ts) opens
 *    and closes them; this file wires it to IPC, dialogs and windows.
 *  - The account is in the cloud (Supabase), and so is an encrypted backup of
 *    every school.
 */
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import path from "node:path";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AppController } from "../src/server/app-controller.js";
import type { SecretBox } from "../src/server/cloud/account.js";
import { resolveCloudConfig } from "../src/server/cloud/config.js";
import { FakeCloud } from "../src/server/cloud/fake.js";
import { SupabaseCloud } from "../src/server/cloud/supabase.js";
import {
  API_METHODS,
  MUTATING_METHODS,
  SESSION_METHODS,
  channelFor,
  type ApiMethod,
  type BooksApi,
  type ExcelReportId,
  type FolderPurpose,
  type PrintableReportId,
  type SetupInput,
} from "../src/shared/api.js";
import { defaultPdfName, exportReportPdf } from "./pdf.js";
import { buildWorkbook, defaultExcelName, workbookBytes } from "../src/server/excel.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------------------- this PC

const exeDir = app.isPackaged ? path.dirname(app.getPath("exe")) : process.cwd();
const portableDataDir = path.join(exeDir, "data");
const portableDbFile = path.join(portableDataDir, "smc-accounts.db");
const isPortable = existsSync(portableDataDir) || existsSync(path.join(exeDir, "portable.json"));

/**
 * In portable mode, all state lives directly inside the application's folder.
 * In development each "PC" keeps its state inside the project (.dev-data).
 */
if (isPortable) {
  mkdirSync(portableDataDir, { recursive: true });
  app.setPath("userData", portableDataDir);
} else if (!app.isPackaged) {
  const pc = (process.env["SMC_DEV_PC"] ?? "pc1").replace(/[^a-z0-9-]/gi, "");
  app.setPath("userData", path.resolve(process.cwd(), ".dev-data", pc || "pc1"));
}

/**
 * One running copy per PC. Two copies would each think they own the open
 * school's folder, and the lock file could not tell them apart.
 */
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

/** Where the shipped migration files live, packaged or not. */
function migrationsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "prisma", "migrations")
    : path.resolve(process.cwd(), "prisma", "migrations");
}

/**
 * The single unencrypted database kept by versions before schools had their
 * own folders. Offered after login, to be moved into a school folder. In
 * development that is the seeded sample year, offered every time and never
 * renamed.
 */
function legacyBooks(): { file: string; developmentCopy: boolean } {
  return app.isPackaged
    ? { file: path.join(app.getPath("userData"), "smc-accounts.db"), developmentCopy: false }
    : { file: path.resolve(process.cwd(), "prisma", "dev.db"), developmentCopy: true };
}

/**
 * Secrets at rest on this PC - the login session and the cached school keys -
 * sealed by the operating system: DPAPI on Windows, the keychain on macOS,
 * libsecret on Linux. Sealed data opens only for the same user on the same PC.
 */
function osSecretBox(): SecretBox {
  const available = safeStorage.isEncryptionAvailable();
  const backend = process.platform === "linux" ? safeStorage.getSelectedStorageBackend() : "os";
  if (!available || backend === "basic_text") {
    console.warn("safeStorage has no real encryption here; the session is stored unprotected");
  }
  return {
    secure: available && backend !== "basic_text",
    seal: (plain) => (available ? safeStorage.encryptString(plain) : Buffer.from(plain, "utf8")),
    open: (sealed) => (available ? safeStorage.decryptString(sealed) : sealed.toString("utf8")),
  };
}

function createController(standaloneDb?: string): AppController {
  const config = resolveCloudConfig({
    isPackaged: app.isPackaged && !standaloneDb,
    url: import.meta.env.MAIN_VITE_SUPABASE_URL,
    publishableKey: import.meta.env.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY,
    forceFake: process.env["SMC_CLOUD"] === "fake" || Boolean(standaloneDb),
  });

  let cloud: ConstructorParameters<typeof AppController>[0]["cloud"];
  if (config.kind === "supabase") {
    cloud = {
      backend: new SupabaseCloud({ url: config.url, publishableKey: config.publishableKey }),
      info: { kind: "supabase", note: null },
    };
  } else if (config.kind === "fake") {
    const dir = app.isPackaged
      ? path.join(app.getPath("userData"), "cloud")
      : path.resolve(process.cwd(), ".dev-data", "cloud");
    const outbox = path.join(dir, "outbox.txt");
    mkdirSync(dir, { recursive: true });
    cloud = {
      backend: new FakeCloud({
        dir,
        onCode: (email, code, purpose) => {
          const line = `${new Date().toISOString()}  ${purpose} code for ${email}: ${code}`;
          console.log(`[development cloud] ${line}`);
          appendFileSync(outbox, `${line}\n`);
        },
      }),
      info: {
        kind: "fake",
        note:
          `Development cloud in ${dir} (${config.reason}). ` +
          `Emailed codes are printed in the terminal and in ${outbox}.`,
      },
    };
  } else {
    console.error(`Cannot start: ${config.reason}`);
    cloud = { unavailable: config.reason };
  }

  return new AppController({
    userDataDir: app.getPath("userData"),
    migrationsDir: migrationsDir(),
    cloud,
    secretBox: osSecretBox(),
    appVersion: app.getVersion(),
    platform: process.platform === "win32" ? "win32" : "posix",
    legacyBooks: legacyBooks(),
    standaloneDb,
  });
}

let controller: AppController | null = null;

function requireController(): AppController {
  if (!controller) throw new Error("the application has not started");
  return controller;
}

/** Reload every window so the screens refetch against the year now bound. */
function reloadWindows(): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.reload();
}

// -------------------------------------------------------------- IPC

/** Channels registered so far, so registering twice is harmless. */
const registered = new Set<string>();

function handle(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  if (registered.has(channel)) return;
  ipcMain.handle(channel, listener);
  registered.add(channel);
}

/**
 * An exception would arrive in the renderer as an opaque string, so it is
 * logged here in full and returned in the contract's failure shape.
 */
function internalFailure(code: string, messageGu: string, messageEn: string, error: unknown) {
  console.error(`${code}:`, error);
  return {
    ok: false,
    issues: [
      {
        severity: "error",
        code,
        messageGu,
        messageEn,
        detail: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

async function openDialog(options: Electron.OpenDialogOptions): Promise<string | null> {
  const window = parentWindow();
  const chosen = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return chosen.canceled || chosen.filePaths.length === 0 ? null : (chosen.filePaths[0] ?? null);
}

async function saveDialog(options: Electron.SaveDialogOptions): Promise<string | null> {
  // Development only: the smoke walkthrough cannot click a native dialog.
  const scripted = app.isPackaged ? undefined : process.env["SMOKE_SAVE_DIR"];
  if (scripted) return path.join(scripted, path.basename(options.defaultPath ?? "export"));
  const window = parentWindow();
  const chosen = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  return chosen.canceled || !chosen.filePath ? null : chosen.filePath;
}

const FOLDER_TITLES: Record<FolderPurpose, string> = {
  newSchool: "શાળાનો ડેટા ક્યાં સાચવવો? — પેન ડ્રાઈવ અથવા ફોલ્ડર પસંદ કરો",
  openSchool: "શાળાનો ડેટા જ્યાં છે તે પેન ડ્રાઈવ અથવા ફોલ્ડર પસંદ કરો",
  restoreSchool: "બેકઅપમાંથી શાળા ક્યાં પાછી લાવવી? — પેન ડ્રાઈવ અથવા ફોલ્ડર પસંદ કરો",
};

/**
 * The account, the school list, data folders and backups. Answered from the
 * moment the app starts.
 */
function registerSessionApi(): void {
  const answers: Record<(typeof SESSION_METHODS)[number], (...args: never[]) => unknown> = {
    getAppState: () => requireController().getAppState(),
    signIn: (email: string, password: string) => requireController().signIn(email, password),
    signUp: (email: string, password: string) => requireController().signUp(email, password),
    verifySignUp: (email: string, code: string) => requireController().verifySignUp(email, code),
    requestPasswordReset: (email: string) => requireController().requestPasswordReset(email),
    completePasswordReset: (email: string, code: string, password: string) =>
      requireController().completePasswordReset(email, code, password),
    signOut: () => requireController().signOut(),
    listSchools: () => requireController().listSchools(),
    pickFolder: (purpose: FolderPurpose) => {
      // Development only: the smoke walkthrough cannot click a native dialog.
      const scripted = app.isPackaged ? undefined : process.env["SMOKE_PICK_FOLDER"];
      if (scripted) return scripted;
      return openDialog({
        title: FOLDER_TITLES[purpose] ?? FOLDER_TITLES.openSchool,
        properties: ["openDirectory", "createDirectory"],
      });
    },
    inspectFolder: (folder: string) => requireController().inspectFolder(folder),
    createSchool: (folder: string, setup: SetupInput) => requireController().createSchool(folder, setup),
    openSchool: (profileId: string, options?: { folder?: string; force?: boolean }) =>
      requireController().openSchool(profileId, options),
    closeSchool: () => requireController().closeSchool(),
    forgetSchool: (profileId: string) => requireController().forgetSchool(profileId),
    reconnectSchool: () => requireController().reconnectSchool(),
    showDataFolder: async () => {
      const folder = requireController().dataFolder;
      if (folder) await shell.openPath(folder);
    },
    getBackupStatus: () => requireController().getBackupStatus(),
    backupNow: () => requireController().backupNow(),
    listCloudBackups: (profileId: string) => requireController().listCloudBackups(profileId),
    restoreBackup: (backupId: string) => requireController().restoreBackup(backupId),
    restoreSchool: (profileId: string, backupId: string, folder: string) =>
      requireController().restoreSchool(profileId, backupId, folder),
    moveLegacyBooks: (folder: string) => requireController().moveLegacyBooks(folder),
  };

  for (const method of SESSION_METHODS) {
    handle(channelFor(method), async (_event, ...args: unknown[]) => {
      try {
        return await (answers[method] as (...a: unknown[]) => unknown)(...args);
      } catch (error) {
        return internalFailure(
          "internal_error",
          "અણધારી ભૂલ આવી. વિગત માટે લોગ જુઓ.",
          "Something went wrong. See the log for details.",
          error,
        );
      }
    });
  }
}

/** Setup of an empty school database - the one that is open. */
function registerSetupApi(): void {
  handle(channelFor("getSetupState"), async () => {
    const setup = requireController().setup;
    if (!setup) return { needsSetup: true, schoolNameGu: null, yearLabel: null };
    return setup.getSetupState();
  });

  handle(channelFor("completeSetup"), async (_event, input: SetupInput) => {
    try {
      const current = requireController();
      const setup = current.setup;
      if (!setup) throw new Error("no school is open");
      const result = await setup.completeSetup(input);
      if (result.ok) {
        await current.afterSetup();
        current.onBooksChanged();
      }
      return result;
    } catch (error) {
      return internalFailure(
        "setup_failed",
        "સેટઅપ પૂરું થઈ શક્યું નહીં. વિગત માટે લોગ જુઓ.",
        "Setup could not be completed. See the log for details.",
        error,
      );
    }
  });
}

const MUTATING = new Set<ApiMethod>(MUTATING_METHODS);

/**
 * Expose every BooksApi method on its own IPC channel, answered by whichever
 * school is open. With none open - or its pen drive pulled out - they fail
 * cleanly rather than touching anything.
 */
function registerBooksApi(): void {
  // exportPdf is answered here rather than by the service, which has no browser.
  handle(channelFor("exportPdf"), async (_event, report: PrintableReportId) => {
    try {
      return await exportPdf(report, requireController().yearLabel);
    } catch (error) {
      return internalFailure("pdf_failed", "PDF બનાવી શકાયું નહીં.", "The PDF could not be created.", error);
    }
  });

  // The workbook is built from the service's data, but asking where to put it
  // is the desktop app's job.
  handle(channelFor("exportExcel"), async (_event, report: ExcelReportId) => {
    try {
      return await exportExcel(report, requireController().yearLabel);
    } catch (error) {
      return internalFailure(
        "excel_failed",
        "Excel ફાઈલ બનાવી શકાઈ નહીં.",
        "The Excel file could not be created.",
        error,
      );
    }
  });

  // Choosing the old workbook to import: another dialog.
  handle(channelFor("pickLegacyFile"), async () => ({
    ok: true,
    data: await openDialog({
      title: "જૂની Excel ફાઈલ પસંદ કરો",
      properties: ["openFile"],
      filters: [{ name: "Excel", extensions: ["xlsm", "xlsx"] }],
    }),
  }));

  const answeredElsewhere = new Set<string>([
    ...SESSION_METHODS,
    "getSetupState",
    "completeSetup",
    "exportPdf",
    "exportExcel",
    "pickLegacyFile",
  ]);

  for (const method of API_METHODS) {
    if (answeredElsewhere.has(method)) continue;

    handle(channelFor(method), async (_event, ...args: unknown[]) => {
      try {
        const current = requireController();
        const api = current.books;
        if (!api) throw new Error("no school's books are open");
        // Each method is looked up by name; the contract guarantees it exists.
        const fn = api[method as keyof BooksApi] as (...a: unknown[]) => Promise<unknown>;
        const result = await fn.apply(api, args);

        // Every successful write owes the cloud a backup.
        const failed = (result as { ok?: boolean } | null)?.ok === false;
        if (MUTATING.has(method) && !failed) current.onBooksChanged();

        // Both of these change which year the books are: closing creates the
        // next one and opens it, and openYear switches to an existing one. The
        // service is bound to a single year id, so it is rebuilt and the
        // windows reloaded onto the new year.
        if (method === "closeYear" || method === "openYear") {
          const changed = result as { ok: boolean; data?: { id: number; label: string } };
          if (changed.ok && changed.data) {
            current.switchYear(changed.data.id, changed.data.label);
            setImmediate(reloadWindows);
          }
        }

        return result;
      } catch (error) {
        return internalFailure(
          "internal_error",
          "અણધારી ભૂલ આવી. વિગત માટે લોગ જુઓ.",
          "Something went wrong. See the log for details.",
          error,
        );
      }
    });
  }
}

// ---------------------------------------------------------- windows

/** Where the renderer is served from: the dev server, or the built files. */
function rendererLocation(): { url: string | null; file: string | null } {
  const devServer = process.env["ELECTRON_RENDERER_URL"];
  if (devServer) return { url: devServer, file: null };
  return { url: null, file: path.join(HERE, "../renderer/index.html") };
}

function preloadPath(): string {
  return path.join(HERE, "../preload/index.mjs");
}

/**
 * Ask where to save, render the report, write the file.
 *
 * Making a PDF needs a browser, and the browser is here.
 */
async function exportPdf(
  report: PrintableReportId,
  yearLabel: string,
): Promise<{ ok: true; data: string | null } | { ok: false; issues: unknown[] }> {
  const outputPath = await saveDialog({
    title: "PDF સાચવો",
    defaultPath: defaultPdfName(report, yearLabel),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  // Cancelling is a normal outcome, not a failure.
  if (!outputPath) return { ok: true, data: null };

  const { url, file } = rendererLocation();
  const written = await exportReportPdf({
    report,
    outputPath,
    rendererUrl: url,
    rendererFile: file,
    preloadPath: preloadPath(),
  });
  return { ok: true, data: written };
}

/**
 * Ask where to save, build the workbook, write the file. No browser needed -
 * the sheets are built from the same DTOs the screens read.
 */
async function exportExcel(
  report: ExcelReportId,
  yearLabel: string,
): Promise<{ ok: true; data: string | null } | { ok: false; issues: unknown[] }> {
  const api = requireController().books;
  if (!api) throw new Error("no school's books are open");

  const outputPath = await saveDialog({
    title: "Excel ફાઈલ સાચવો",
    defaultPath: defaultExcelName(report, yearLabel),
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (!outputPath) return { ok: true, data: null };

  const workbook = await buildWorkbook(api, report);
  await writeFile(outputPath, await workbookBytes(workbook));
  return { ok: true, data: outputPath };
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "SMC હિસાબ",
    webPreferences: {
      preload: preloadPath(),
      // The renderer gets no Node access. Everything it may do is the explicit
      // list in the preload bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => window.show());

  // Renderer console output goes to the terminal in development. Without this a
  // failed IPC call shows only as a stuck spinner with no trace anywhere.
  if (!app.isPackaged) {
    window.webContents.on("console-message", (event) => {
      if (event.level === "error" || event.level === "warning") {
        console.log(`[renderer ${event.level}] ${event.message}`);
      }
    });
  }
  runSmokeChecks(window);

  // External links open in the real browser, never inside the app shell.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // SMOKE_SCREEN opens straight to one screen, for the capture check.
  const hash = process.env["SMOKE_SCREEN"] ?? "";

  const { url, file } = rendererLocation();
  if (url) {
    void window.loadURL(hash ? `${url}#${hash}` : url);
  } else if (file) {
    void window.loadFile(file, { hash: hash || undefined });
  }
}

/**
 * Checks that need no person watching.
 *
 *   SMOKE_SHOT=<png>     render the window, write a screenshot, quit. Works in a
 *                        packaged build too - docs/PACKAGING.md checks the
 *                        installer's first run with it.
 *   SMOKE_LANG=en|gu     the interface language for it.
 *
 * Development only, because they drive the app or bypass its dialogs:
 *   SMOKE_STEPS=<json>   a list of { run?: <JS for the page>, wait?: <ms>,
 *                        shot?: <png>, log?: true } carried out in order, then
 *                        quit - for walking through the login and school screens.
 *   SMOKE_PICK_FOLDER    answers every folder dialog with this folder.
 *   SMOKE_SAVE_DIR       answers every save dialog with a file in this folder.
 *
 * Screenshots go through the DevTools protocol, which forces a fresh frame;
 * capturePage returns a stale one when the window is not focused (see
 * scripts/shoot.mjs).
 */
function runSmokeChecks(window: BrowserWindow): void {
  const smokeShot = process.env["SMOKE_SHOT"];
  const smokeSteps = app.isPackaged ? undefined : process.env["SMOKE_STEPS"];
  if (!smokeShot && !smokeSteps) return;

  const shoot = async (file: string): Promise<void> => {
    const cdp = window.webContents.debugger;
    if (!cdp.isAttached()) cdp.attach("1.3");
    const { data } = (await cdp.sendCommand("Page.captureScreenshot", { format: "png" })) as {
      data: string;
    };
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`smoke shot written to ${file}`);
  };
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  window.webContents.once("did-finish-load", async () => {
    try {
      const language = process.env["SMOKE_LANG"];
      if (language) {
        await window.webContents.executeJavaScript(
          `localStorage.setItem("smc.language", ${JSON.stringify(language)})`,
        );
        window.webContents.reload();
        await new Promise<void>((resolve) => window.webContents.once("did-finish-load", () => resolve()));
      }
      await pause(2500);
      if (smokeShot) await shoot(smokeShot);
      if (smokeSteps) {
        const steps = JSON.parse(await readFile(smokeSteps, "utf8")) as {
          run?: string;
          wait?: number;
          shot?: string;
          log?: boolean;
        }[];
        for (const step of steps) {
          if (step.run) {
            const result: unknown = await window.webContents.executeJavaScript(step.run, true);
            if (step.log) console.log(`[smoke] ${JSON.stringify(result)}`);
          }
          if (step.wait) await pause(step.wait);
          if (step.shot) await shoot(step.shot);
        }
      }
    } catch (error) {
      console.error("smoke check failed:", error);
    } finally {
      app.quit();
    }
  });
}

// ------------------------------------------------------------ lifecycle

/** How often to check that the open school's pen drive is still there. */
const DATA_CHECK_MS = 3000;
/** How long quitting waits for an owed backup. */
const QUIT_FLUSH_MS = 10_000;

let quitting = false;

if (singleInstance) {
  void app.whenReady().then(async () => {
    try {
      const standaloneDb = existsSync(portableDbFile) ? portableDbFile : undefined;
      controller = createController(standaloneDb);
      if (standaloneDb) {
        await controller.openStandaloneDatabase(standaloneDb);
      }
    } catch (error) {
      console.error("Could not start:", error);
    }
    registerSessionApi();
    registerSetupApi();
    registerBooksApi();

    setInterval(() => controller?.checkDataPresent(), DATA_CHECK_MS);

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

/**
 * Before quitting: send any backup that is owed (for a few seconds at most)
 * and close the school's books cleanly, releasing its lock. What cannot be
 * sent now stays owed in the school folder and goes next time.
 */
app.on("before-quit", (event) => {
  if (quitting || !controller) return;
  event.preventDefault();
  quitting = true;
  void controller
    .shutdown(QUIT_FLUSH_MS)
    .catch((error: unknown) => console.error("closing the school failed:", error))
    .finally(() => app.quit());
});

app.on("window-all-closed", () => {
  // Quit on every platform including macOS: this is a single-window document
  // application, so an invisible running app would only confuse the user.
  app.quit();
});
