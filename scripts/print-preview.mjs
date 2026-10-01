/**
 * Serve the print routes in an ordinary browser, for laying out the forms.
 *
 *   node scripts/print-preview.mjs        # builds, then serves on :8801
 *
 * Iterating on print CSS inside Electron is slow: every change needs a rebuild,
 * a relaunch and a screenshot whose timing is unreliable. The print pages only
 * need a Chromium and some data, so this copies the built renderer, injects a
 * stub `window.accounts` holding a real dashboard payload from the database, and
 * serves it. Measurements taken here (does the table fit the sheet?) hold in the
 * real app, because it is the same markup, the same stylesheet and the same
 * numbers.
 *
 * The app's Content-Security-Policy forbids inline script, which is correct for
 * the real window and only in the way here, so the copy drops it. Nothing in
 * this script touches what ships.
 *
 * The stub also answers enough of the rest of the API for the whole interface to
 * open on a school - so the Reports screen and its layout editor can be tried
 * at http://localhost:8801/#reports. Layouts saved there live in the page's
 * memory only; the database is never written.
 */
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPrismaClient } from "../src/lib/db.js";
import { AccountsService } from "../src/server/accounts-service.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILT = path.join(ROOT, "out", "renderer");
const PREVIEW = path.join(ROOT, ".preview");
const PORT = Number(process.env["PREVIEW_PORT"] ?? 8801);

console.log("building the renderer…");
execFileSync("npx", ["electron-vite", "build"], { cwd: ROOT, stdio: "ignore" });
if (!existsSync(BUILT)) throw new Error(`no build at ${BUILT}`);

// This script runs under Node and reads the database, so better-sqlite3 has to
// be the Node build. Ordering matters: it must come AFTER the build, because a
// build run through npm flips the binary back to Electron's ABI.
console.log("switching better-sqlite3 to the Node build…");
execFileSync("node", [path.join(ROOT, "scripts", "native-abi.mjs"), "node"], {
  cwd: ROOT,
  stdio: "ignore",
});

console.log("reading the year from the database…");
const prisma = createPrismaClient();
const year = await prisma.financialYear.findFirst({ orderBy: { label: "desc" } });
if (!year) throw new Error("no financial year; run npm run db:seed");
const service = new AccountsService(prisma, year.id);
const dashboard = await service.getDashboard();
const rojmel = await service.getRojmel();
const grantRegister = await service.getGrantRegister();
const chequeRegister = await service.getChequeRegister();
const billRegister = await service.getBillRegister();
const voucherList = await service.getVouchers();
const patrak = await service.getPatrakD();
const ledgers = await service.getLedgers();
const annexure9 = await service.getAnnexure9();
const balances = await service.getBalances();
const school = await service.getSchool();
const layouts = Object.fromEntries(
  await Promise.all(
    ["rojmel", "khatavahi", "grantRegister", "chequeRegister", "billRegister", "vouchers", "patrakD", "annexure9", "annexure10"].map(
      async (report) => [report, await service.getReportLayout(report)],
    ),
  ),
);
await prisma.$disconnect();

const openState = {
  phase: "open",
  cloud: { kind: "fake", note: "print preview" },
  user: { id: "preview", email: "preview@localhost" },
  school: { profileId: "preview", schoolNameGu: school.nameGu, diseCode: school.diseCode, folder: "(preview)" },
  needsSetup: false,
};

rmSync(PREVIEW, { recursive: true, force: true });
cpSync(BUILT, PREVIEW, { recursive: true });

const indexPath = path.join(PREVIEW, "index.html");
let html = readFileSync(indexPath, "utf8");
html = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, "");
html = html.replace(
  "</head>",
  `<script>const layouts=${JSON.stringify(layouts)};window.accounts={` +
    `getDashboard:()=>Promise.resolve(${JSON.stringify(dashboard)}),` +
    `getRojmel:()=>Promise.resolve(${JSON.stringify(rojmel)}),` +
    `getGrantRegister:()=>Promise.resolve(${JSON.stringify(grantRegister)}),` +
    `getChequeRegister:()=>Promise.resolve(${JSON.stringify(chequeRegister)}),` +
    `getBillRegister:()=>Promise.resolve(${JSON.stringify(billRegister)}),` +
    `getVouchers:()=>Promise.resolve(${JSON.stringify(voucherList)}),` +
    `getPatrakD:()=>Promise.resolve(${JSON.stringify(patrak)}),` +
    `getLedgers:()=>Promise.resolve(${JSON.stringify(ledgers)}),` +
    `getAnnexure9:()=>Promise.resolve(${JSON.stringify(annexure9)}),` +
    `getBalances:()=>Promise.resolve(${JSON.stringify(balances)}),` +
    `getAppState:()=>Promise.resolve(${JSON.stringify(openState)}),` +
    `getSetupState:()=>Promise.resolve({needsSetup:false,schoolNameGu:null,yearLabel:null}),` +
    `getBackupStatus:()=>Promise.resolve({state:"upToDate",pendingSince:null,lastBackupAt:null,lastBackupDevice:null,lastError:null}),` +
    `getReportLayout:(r)=>Promise.resolve(structuredClone(layouts[r])),` +
    `saveReportLayout:(r,l)=>{layouts[r]=structuredClone(l);return Promise.resolve({ok:true,data:structuredClone(l)})},` +
    `exportPdf:()=>Promise.resolve({ok:true,data:null}),` +
    `printReport:()=>Promise.resolve({ok:true,data:false}),` +
    `listBankCharges:()=>Promise.resolve([]),` +
    `exportExcel:()=>Promise.resolve({ok:true,data:null})` +
    `};</script></head>`,
);
writeFileSync(indexPath, html);

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

createServer((request, response) => {
  const name = (request.url ?? "/").split("?")[0].split("#")[0];
  const file = path.join(PREVIEW, name === "/" ? "index.html" : name);
  if (!file.startsWith(PREVIEW) || !existsSync(file)) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
}).listen(PORT, () => {
  console.log(`\n  http://localhost:${PORT}/#print:annexure10\n`);
});
