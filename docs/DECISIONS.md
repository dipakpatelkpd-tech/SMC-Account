# Decisions

Choices made with the developer, and the questions still open with the client.
`docs/SPEC.md` stays the source of truth for the domain; this file records what we
settled on where the spec offered a choice.

## Confirmed with the developer

| # | Question | Decision |
|---|---|---|
| Stack | SPEC §10 | **Electron desktop app**: Electron + Vite + React renderer, Prisma 7 + SQLite in the main process. Superseded the original Next.js plan — see "Why Electron" below. |
| §11.1–2 | How many schools, who enters data | **One person, several schools.** An account (email + password) keeps any number of schools; each school's books are their own encrypted database in a folder the user chooses, usually a pen drive. See "Accounts, schools and pen drives". (Was: one school, one user.) |
| Cloud | Keeping the data safe | **Supabase**: the accounts, each school's encryption key, and append-only encrypted backups. The books themselves stay on the pen drive. The first login on each PC needs the internet; after that the app works offline. |
| Encryption | A lost pen drive | **Yes, like TallyVault**: every school's database is encrypted on disk; the key belongs to the account, not the pen drive. |
| Windows | Oldest supported | **Windows 10.** Electron 38 does not run on 7 or 8. |
| Fonts | Report font size | **14 in every PDF and Excel report**; the rojmel PDF uses the client's own rojmel sizes, 11 and 12 (see "Report font size"). |
| §11.5 | Outputs | PDF **and** Excel, chosen per report by the user. |
| §11.7 | Bank accounts | One account in the UI, stored in a `BankAccount` table with FKs from `Receipt` and `Cheque`. The differing branch on the civil grant is free text on the receipt (`bankLabelGu`). |
| §11.9 | Legacy Excel import | Build it — scheduled **after** the reports are green against the sample JSON, so the importer targets a validated model. |
| §11.11 | Deductions (કપાત) | Rare. `amountPaise` and `deductionPaise` (default 0) are stored; net is computed. Validation blocks deduction > amount. |
| §11.4 | Rojmel nil blocks | Default rule, configurable: one block per cash-book date with transactions, plus one nil block covering the rest of that calendar month. Pending the client. |
| §11.3 | Grant heads | School-level master (`GrantHead`), with print order and active flag per year (`GrantHeadYear`). Never hard-coded. |
| §11.6 | Digits | Confirmed from the page images: Rojmel in Latin digits, every other report in Gujarati digits. |
| §11.10 | ખર્ચેલ રકમ | Implement the spec's FIFO rule; it reproduces the sample's grant register exactly. Still to confirm with the client. |
| §11.12 | Signatures | Keep the blank signature columns exactly as the references print them. No extra stamp areas. |
| Layouts | Editable report layout | **Per school, in the books** (travels on the pen drive, in cloud backups). Highlight a **cell, row or column**. **Bundled Gujarati fonts only.** Applies to **PDF and Excel**. See "Report layouts". |

## Why Electron, and why not Next.js

The app was first scoped as a Next.js website. When the developer asked for a
desktop app, the shape changed — and three things got *better*:

1. **PDF generation.** The plan was to drive headless Chromium through Playwright
   for Gujarati conjunct shaping. Electron *is* Chromium:
   `webContents.printToPDF()` does the same job with the same HarfBuzz shaping,
   with no Playwright dependency and no separate browser download. The project's
   largest technical risk was removed rather than added to.
2. **Offline SQLite stopped being a compromise.** No hosting, no internet in a
   rural school, one file the school backs up by copying.
3. **One school, one user (§11.1–2) is a desktop application's exact shape.**
   (Now several schools per account, each in its own folder - still a desktop
   application's shape; see "Accounts, schools and pen drives".)

Next.js was dropped because it is a *server* framework: inside Electron it would
mean either shipping a Node server that boots on launch, or a static export that
loses Server Actions and API routes — in which case data access goes over IPC
anyway and Next.js earns nothing Vite does not. It cost nothing to drop: no
Next.js code had been written.

**A website later stays cheap.** `src/shared/api.ts` defines one `AccountsApi`
interface; the screens and the engine depend only on that. Today it is answered
over IPC by `src/server/accounts-service.ts`, which knows nothing about Electron.
A web version implements the same interface over HTTP, reusing the engine, the
schema and every screen. Everything crossing that boundary is JSON-safe on
purpose — Electron IPC could carry a `Map`, but HTTP cannot.

## Technical choices and why

**Money is an integer of paise.** SPEC §10 allows "integer paise or a decimal type".
Prisma's `Decimal` is float-backed on SQLite, so paise is the only option that is
exact today and stays exact if the database moves to Postgres. All conversion and
formatting goes through `src/lib/money.ts`; nothing else does arithmetic on rupees.

**Dates are ISO `YYYY-MM-DD` strings, not `DateTime`.** They sort chronologically
as text and cannot shift a day across timezones — which matters because an entry
that slides from 31/03 to 01/04 lands in a different financial year. Only
`createdAt`/`updatedAt` are real timestamps. Helpers in `src/lib/dates.ts`.

**No enums.** Prisma cannot declare enums on SQLite, so `Cheque.type` and
`FinancialYear.status` are `String`, with the allowed values and their meaning in
`src/lib/types.ts` and enforcement by Zod.

**Nothing derived is stored.** No `net_amount` on `Bill`, no `amount` on `Cheque`,
no closing balance anywhere. `ChequeAllocation` rows exist only for grant-return
cheques, where the split is typed; for reimbursement and direct cheques the split
is computed from the linked bills.

**A bill links to at most one cheque** (`Bill.chequeId`). This makes "a bill linked
to more than one cheque" (SPEC §7) structurally impossible rather than a rule to
check at validation time.

**`Bill.billNo` is nullable.** The bill behind a direct-payment cheque has a
voucher but no bill number — visible as the blank બિલ નંબર cells in the cheque
register, and stated in SPEC §6.5. Two of the 41 sample bills are like this.

## Interface language (Gujarati / English)

The interface can be switched between Gujarati and English from the Settings
screen. Three boundaries define what that actually means:

1. **The printed reports never change.** Rojmel, Khatavahi, the registers and the
   annexures are statutory forms submitted to the CRC/BRC for audit; an English
   one would be rejected. The settings screen says so, so nobody hunts for a
   switch that should not exist.
2. **The school's own data never changes.** Grant head names, vendor names,
   cheque purposes, bill descriptions and the receipt mode (`ઓનલાઈન`,
   `બેન્ક દ્વારા`) are facts the school typed and the reports print. Translating
   them would be inventing data. English mode is therefore an English shell
   around Gujarati content — honest about what it can and cannot do.
3. **Validation messages are bilingual.** `Issue` carries `messageGu` and
   `messageEn`; the English text defaults to the existing `detail` field, which
   was already written as a readable English sentence, so there is no second
   catalogue to keep in step.

Both dictionaries implement one `Strings` interface (`src/renderer/i18n/`), so a
missing or misspelled translation is a compile error rather than a blank label a
user discovers. The choice lives in `localStorage`, not the database: it belongs
to whoever is sitting at the machine, and the accounting tables stay free of
interface concerns.

Adding a third language means adding one more object implementing `Strings`.

## The Rojmel

The cash book is built in `src/engine/rojmel.ts` and printed by
`src/renderer/print/RojmelPage.tsx`. Three decisions in it were read off the
reference book rather than the spec, because the spec leaves them open:

**Page capacity is 26 rows.** The reference's page 3 carries voucher 1 alone —
one opening row, the પદર ખર્ચ sub-heading, twenty-one bill lines and three
footers. Two ordinary eleven-row blocks still share a page; three never do. A
block is never split, because its footers have to be read with its body.

**Nil blocks come only after a date that had entries**, running to the end of
that month and stopping early if the next transaction falls inside the range.
The client prints `04/05`, then `05/05 TO 31/05`, and simply omits `01/05–03/05`
— they never open a month with a gap block. Filling every gap instead gave 26
pages against their 16; this rule gives 19. **SPEC §11.4 is still open**, and the
rule is a setting (`nilBlocks: "fill-gaps" | "none"`), so the remaining
difference is cheap to close once the client says what they want.

**The bank-to-hand transfer line is bottom-aligned** on the receipt side, beside
the last bill it paid for, which is where the reference puts it rather than
stranded under the opening balance.

Pagination is deterministic, which matters beyond appearance: the ખાતાવહી prints
the rojmel page number of every entry, and `pageResolver()` is what supplies
them. `getLedgers()` now paginates the cash book first for exactly this reason.

## The registers, the voucher and પત્રક-D

All four are computed in `src/engine/registers.ts` and printed by
`src/renderer/print/RegisterPages.tsx`. They are mostly listings, so the parts
worth recording are the ones the hand-typed workbook gets wrong:

**Bill numbers sort by the number after the slash, not as text.** String order
puts `1/10` before `1/2`, which would make the cheque register print
"1/1 થી 1/9" for a cheque covering twenty-one bills. A test pins this.

**A grant return appears in the bill register without being a bill.** It has a
voucher number and an amount but no bill number, and the register lists it so
the voucher numbers run unbroken - 42 rows for the sample year, 41 bills plus
one return.

**પત્રક-D has one row per cheque AND head, not per cheque.** A reimbursement
covering four heads produces four rows; that split is the entire point of the
statement. Its total is everything that left the bank: 42,261.

**Each voucher is checked against the cheque that paid it.** `Voucher.balances`
is false when the bills do not add up to the cheque - the class of error this
product exists to remove.

Every report but the rojmel prints Gujarati digits (SPEC §6). Identifiers - the
DISE code, the bank account number - stay Latin, as on the originals.

## Paper: Legal, not A4

Every form prints on **Legal, 215.9 x 355.6mm (8.5 x 14in)** — the paper the
school actually uses. Confirmed by the developer; SPEC §6 said A4, which was
wrong.

Legal is both wider and taller than A4. Landscape Legal gives 335.6mm of width
against A4's 297 — 21% more room, which the rojmel's sixteen columns and the
registers' twelve use for larger type rather than more rows. The printed area
after the 10mm margins is:

| | width | height | at 96dpi |
|---|---|---|---|
| portrait | 195.9mm | 335.6mm | 740 x 1268 px |
| landscape | 335.6mm | 195.9mm | 1268 x 740 px |

**The page box is set per report, not globally.** `printToPDF` runs with
`preferCSSPageSize`, so the stylesheet's `@page` decides the orientation — not
the `landscape` flag passed to Electron. A single global `@page { size: legal
portrait }` would have printed all seven landscape forms portrait with their
tables cropped down the right-hand side. `PrintRoot` emits the correct rule for
the report it is showing, and `LANDSCAPE_REPORTS` there must stay in step with
`PAGE_SETUP` in `electron/pdf.ts`.

Every sheet of all nine reports is measured against these dimensions in the
browser preview: no report overflows its page in either direction. At the
report sizes (see "Report font size") all nine were measured again, sheet by
sheet, with the same result.

## Installing on a new machine: migrations

Development always had a database because `prisma db push` made one. An
installed copy has none — it starts, looks in the user's data folder, finds
nothing, and needs instructions for building a schema. Without those it fails on
first launch on every machine except the one it was built on.

`prisma/migrations/0001_init/migration.sql` is generated by Prisma
(`npm run db:migration`), shipped through electron-builder's `extraResources`,
and applied at startup by `electron/migrate.ts`. Prisma's own `migrate deploy`
is a CLI command; shipping the CLI inside an Electron app to run it is heavy and
fragile, so the SQL is applied directly. The schema stays Prisma's to define —
only the applying is ours.

Three rules, because a school's books are the only copy of their year:

- **Each migration runs in a transaction**, so it applies completely or not at
  all. A failure is reported and rolled back.
- **Applied migrations are logged** in `_smc_migrations`, so one never runs
  twice. Re-running is a no-op.
- **A migration failure aborts startup** rather than opening a window onto a
  half-built database.

**Adoption.** The development database has the tables but no migration log,
because `db push` records nothing. Running the first migration against it would
try to `CREATE TABLE` over live data and fail, so `adoptExistingSchema()`
detects that case and marks the migrations as applied instead. Verified against
a copy of the real database: 41 bills before, 41 after, nothing re-run.

## First-run setup

(Since schools live in folders, this form runs when a **new school** is created
from the school list, with a "where to keep the data" section added at the top -
see "Accounts, schools and pen drives". What follows still holds for the form
itself.)

A fresh install gets a valid but empty database. `src/renderer/screens/Setup.tsx`
is the one screen that works without a school, and it creates everything the
rest of the application assumes exists: the school, its bank account, the first
financial year, the grant heads and their opening balances.

**The API is split in two.** `SetupApi` holds the only two calls a brand-new
installation can make; `BooksApi` is everything that needs a school and an open
year. The main process registers `SetupApi` from the moment the database opens
and `BooksApi` only once a year exists, so a renderer on a fresh install cannot
call something with no handler behind it. The renderer therefore asks
`getSetupState()` first, before anything else.

**Setup runs in one transaction.** A half-created school — masters but no year,
or heads but no balances — would leave the app in a state no screen knows how to
show and no migration would repair. It also refuses to run twice, which would
otherwise orphan a year of books behind a second invisible school.

**It is one long form, not a wizard.** The school fills it in once with their
papers in front of them; a wizard would hide later fields behind earlier ones
while they hunt for a DISE code. The nine usual grant heads (SPEC §3) are
pre-filled and editable — they are a starting point, not a fixed list. The
language toggle sits at the top, because someone who cannot read Gujarati has to
be able to get through this screen to reach the language setting.

**After setup the application comes to life in the same process** — the main
process builds the books API against the new year and reloads the window, so
nobody has to restart the app.

Tested against a genuinely empty database built from the shipped migrations:
validation refusals leave it empty, a completed setup is readable by
`AccountsService`, and **every report renders with no transactions entered** —
the state a new school is in on day one.

## Accounts, schools and pen drives

The shape is Tally's, chosen by the developer: **the software is installed on
every PC; a school's data is a folder you can carry.** The only things PCs share
are the software and the account.

**A school is a folder.** Creating one asks where to keep its data; the app makes
`SMC Accounts\<DISE code>\` there, holding `profile.json` (which school, which
account - nothing secret), `books.db` (the encrypted books), `backups\` (the last
ten copies, taken each time it opens), `sync.json` (is a cloud backup owed?) and,
while a PC has it open, `books.lock`. See `src/server/profiles/data-folder.ts`.

**A school is found by its id, not its path.** Windows gives a pen drive
whichever letter is free, so the remembered path is only a hint: the app tries
the same path on every other drive, then any `SMC Accounts` folder at a drive's
root (`src/server/profiles/locate.ts`). "Open existing data" points at any folder.

**The lock is advisory.** People pull the pen drive out without closing the app,
so another PC's lock is usually stale: the app says which PC holds it and since
when, and offers "Open anyway". This PC's own lock is always taken over - one
copy of the app runs per PC (`requestSingleInstanceLock`).

**A pulled-out pen drive is noticed within seconds.** The main process checks the
folder every three seconds; when it is gone the books are closed and the screen
says to put the drive back. A write in progress is safe either way: school
databases use SQLite's rollback journal (not WAL, so a closed school is always
one file) with `synchronous = FULL`.

**Books upgraded by a newer version are refused.** A pen drive can travel to a
PC with an older copy of the app, which would otherwise write to a schema it
does not understand. `runMigrations` throws `NewerDataError` when the data has a
migration this build lacks, and the app asks for the software to be updated.

**Creating a school leaves nothing behind when it fails.** The form is validated
first; the folder and database are built and set up; only then is the school
registered, with its key, in the account. Any failure removes the new folder.

**Signing in.** Email and password, the address confirmed with a 6-digit code
(`src/server/cloud/account.ts`). No password is stored anywhere on the PC: the
session the cloud issued is kept, sealed with Electron's `safeStorage` (DPAPI on
Windows) so it opens only for the same Windows user on the same PC. The first
login on a PC therefore needs the internet; later launches do not. A school's key
is fetched from the account the first time a PC opens that school, then cached
the same way. Signing out removes both. A password reset elsewhere ends every
other PC's session at its next contact with the cloud.

**All of this is Electron-free** (`src/server/app-controller.ts`), so
`tests/cloud/` runs whole journeys - two PCs, a pen drive under a new drive
letter, a lost pen drive, another account - with temporary folders and
`FakeCloud`, a stand-in cloud in a folder. `npm run dev` uses the same stand-in
until a Supabase project is configured; a packaged build refuses it.

## Encryption

Each school's `books.db` is encrypted page by page with **ChaCha20-Poly1305**
(SQLite3 Multiple Ciphers). Without the key the file is noise - the SQLite header
is gone - and a tampered page is refused rather than read. `src/server/vault.ts`
holds every use of the cipher.

The key is 32 random bytes per school, never typed and **never written to the
pen drive**. It lives in the account (`profile_keys`, readable only by the owner,
never replaceable) and in each PC's sealed cache. So a finder of the pen drive
has nothing, while the owner opens it on any PC they log in on.

The trade-off, stated plainly: **the Supabase project holds the keys and the
encrypted backups together.** Anyone with the project's dashboard or secret key
could combine them, which is why docs/SUPABASE_SETUP.md insists on two-factor
login for the dashboard and keeps the secret key out of the app. Keys wrapped by
the user's password would close that gap but lose a school's books for good
whenever a head teacher forgets a password - the wrong trade for these users.

## Cloud backup

A backup is a consistent snapshot of the encrypted file (`VACUUM INTO`, which
keeps the cipher and key), uploaded as-is: the cloud never sees a figure. It is
sent a few minutes after the last change (at most every 20 minutes), when a
school is closed or the app quits (for up to ten seconds), and on "Back up now"
(`src/server/backup/cloud-backups.ts`).

**Offline, nothing is lost.** That a backup is owed is written to the school's
own `sync.json`, so it survives restarts and travels with the pen drive: books
changed on an offline PC are backed up by the next PC with internet.

**Backups are append-only**, enforced by the database's row-level security
(`supabase/migrations/0001_smc_cloud.sql`), not by the app: no update or delete
exists for the app's key, so a bug or a stolen password cannot erase the
history. `tests/cloud/supabase-sql.test.ts` runs that file in PGlite (PostgreSQL
in WebAssembly) and tries every rule as the people it must stop.

**Restoring** downloads a backup, checks its SHA-256 and opens it with the key
before anything is replaced; the current books are copied to `backups\` first.
A school whose pen drive was lost is restored into a new folder from the school
list.

## Report font size

**Every PDF and Excel report prints at 14** - the size the school was told its
reports must use, and the size of the client's own Excel registers - **except the
rojmel, which uses the client's own rojmel sizes.** The client's workbook
(`sample/bariyana muvada.xlsx`) was read cell by cell to settle this:

| Sheet | What the client uses |
|---|---|
| CHEK / BIL RAJISTAR, P10E (Annexure 10) | 14 (LMG-Arun, SULEKH) |
| ROJMED (rojmel) | figures and dates **Calibri 11**, Gujarati text **LMG-Arun 12**, long descriptions set down to 9 by hand; nothing at 14 |

So in Excel every cell is 14 (a test reads every cell of the year's workbook
back); in the PDFs `--report-font: 14pt` sets every form but the rojmel, which
has `--rojmel-figure: 11pt` and `--rojmel-text: 12pt` (print.css). Before this the
rojmel printed at 7-7.5pt, visibly smaller than the client's own printout.

**The font is part of the app.** Noto Sans Gujarati (SIL Open Font License) is
bundled through `@fontsource/noto-sans-gujarati` rather than taken from the PC:
Windows has no Noto and would fall back to Shruti, whose different widths would
move every page break. Every PC now prints the same PDF.

**Tables are paged by measurement.** At 14pt a sheet holds far fewer rows, and
how many depends on how often a Gujarati description wraps, so the fixed "22 rows
a sheet" is gone: `src/renderer/print/PagedSheets.tsx` lays each table out
invisibly at the printed size, measures every row, and packs rows onto sheets
that each repeat the heading and column titles; totals and signatures go under
the last rows. The PDF waits until every table is packed.

**Shrink to fit, for the exceptions.** Like Excel's option of the same name
(PrintRoot, `fitCells`): an amount wider than its column - a first lakh-rupee
total - is made smaller in that one cell, never below 9pt; a rojmel description
too long for one line is made smaller down to 7pt (the client sets such lines to
9 by hand), and wraps only beyond that. A row only ever gets shorter by this, so
pages already packed still fit. On the sample year every form but the rojmel
prints with no text below 14pt; in the rojmel about 120 of 1,500 cells shrink. The
widths are read in batches and the sizes written after, a few rounds at most:
shrinking one half-pixel at a time made the browser lay out all nineteen rojmel
sheets over a thousand times, 2.3 seconds per pass, which the layout editor paid
on every change.

**Margins.** Annexure 10 and the rojmel print with 5mm margins instead of 10mm
(PrintRoot, `NARROW_MARGIN_REPORTS`): the client's workbook prints them edge to
edge to get the columns across at full size.

What 14pt does to the sample year (sheets before → now): Annexure 10 1 → 1
(portrait, as P10E), cheque register 1 → 2, bill register 2 → 4, grant register
1 → 3, પત્રક-D 1 → 2, vouchers 7 → 8, Khatavahi 3 → 9 (one account a sheet: its
seven columns need the full width at 14), Annexure 9 1 → 1, rojmel 19 → 19. The
rojmel keeps the engine's 26 rows a page, so the ledger's rojmel page numbers are
unchanged.

**Why the rojmel is not 14.** Sixteen columns at 14 on one Legal sheet leave each
description about five letters a line: measured, 2.6 times the page height. The
client's own rojmel does not attempt it either. If 14 is ever required anyway,
the realistic layout is આવક and જાવક on facing sheets under one page number.

## Report layouts

A school can change how each printed report looks, from **ગોઠવણી બદલો (Edit
layout)** on the Reports screen: drag the line between two columns to change their
widths, click a cell to highlight it (or its whole row or column), change the
font, size and bold, add space after a row, and set the space inside cells and the
row height for the whole report. Choices confirmed with the developer are in the
table at the top.

**Only presentation.** A layout (`src/shared/report-layout.ts`) holds widths,
fonts, sizes, colours, alignment and spacing - never a figure - so "every report
number is computed" still holds. The tests pin the default widths to the numbers
the print pages used to carry inline, and all nine forms were measured in the
browser at their default layout, with the same sheet counts as before and nothing
overflowing.

**Headings are editable too.** The blocks around a table - the title, the
rojmel's "( Cash Book )" band, an annexure's banner, the voucher's details, the
signatures - are *parts* (`REPORT_PARTS`, `data-part` on the page). A part takes
a size, font, bold, colour, alignment and a height; a heading table's height is
per row. On Excel the title part styles the sheet's title row.

**The rojmel's band lines up with its table.** The આવક "( Cash Book )" box is as
wide as the table's receipt half, so its edge meets the heavy rule down the
middle, and follows it when column widths change. Its three pieces - the આવક
box, the જાવક box, the page number - are parts of their own with a width a
school can set in mm; the rest of the band takes what is left.

**Blank, not just "no highlight".** A colour choice of `none` prints a cell,
row, column or heading white even where the form has a colour of its own (the
rojmel's footer rows, the bands, the annexure labels); clearing the choice
returns to the form's colour. `plain` on the whole report drops every colour of
the form's own at once; a school's own highlights still print.

**All text is centred** - amounts, descriptions and labels alike, in every form
(developer's decision, 2026-09-30; print.css). Left, centre or right can be set
per report, column, row, cell or heading. The Excel file is a working file, so it
keeps its own alignment unless one is set in the layout.

**Rojmel blocks spread down the page.** After shrink-to-fit, each rojmel sheet's
spare height is shared among the gaps *between* its blocks (PrintRoot,
`spreadBlocks`), so two blocks fill the sheet evenly instead of leaving the
space at the bottom; on the sample year each two-block sheet ends 4px short of
the paper. A sheet with one block keeps its space. Because it runs on what is
left, a taller heading or larger type simply leaves less to share.

**Where it lives.** One `ReportLayout` row per school and report (migration
`0002_report_layout`), JSON validated by Zod on the way in and out. Per school,
not per year, so a layout carries into the next year with no copying. Saving an
empty layout deletes the row. A stored layout that no longer validates (damaged,
or written by a newer version) prints the default rather than failing.

**How cells are found.** Every form's main table declares its columns once
(`REPORT_COLUMNS`, which also owns the default widths and renders each table's
`<colgroup>`). Every cell carries `data-col`, every row `data-row`. Row keys are
made from what the row is about - `cheque:1234`, `receipt:17`, `bill:3:3/2`, a
rojmel block's date and line - so a highlight stays on its entry when an earlier
one is added. A highlight whose row no longer exists is simply not shown.

**How it is applied.** PrintRoot writes the layout as a stylesheet scoped to the
`#report-layout` id, which outranks every class rule in print.css without
`!important` while the inline sizes shrink-to-fit sets still win over it. Column
rules come before row rules, row before cell. The paged tables measure and pack
their sheets again whenever the layout changes, after waiting for any newly
chosen font to load.

**The PDF is the preview.** The editor renders the draft through the same
PrintRoot; the PDF export loads the saved layout on the same route. The export
buttons are hidden while the editor is open, so a PDF is never made from a draft.

**What cannot fit is said, not cropped.** After each change the editor lists
sheets that no longer fit the paper, and counts cells whose text is wider than
the column. This matters most for the rojmel: its pages hold exactly 26 rows
(the ledger prints its page numbers), so larger type or spacing cannot add a
page - it can only push one past the edge.

**Excel.** The workbook's columns are laid out for sorting and filtering, not as
the form, so each Excel column names the form column it shows. Widths change by
the same proportion, the font and bold carry over, sizes keep their proportion
to the form's default (the rojmel prints at 12, so 13 there is 15 in Excel),
highlights become cell fills, and the space after a row becomes an empty row that
tall. Padding and row heights are left to Excel. A font name in Excel is only a
name: a PC without that font shows Excel's substitute.

**Fonts.** Noto Sans Gujarati (default), Noto Serif Gujarati, Hind Vadodara,
Mukta Vaani, Anek Gujarati, Baloo Bhai 2 and Rasa, all SIL Open Font License, bundled
through `@fontsource` in 400 and 700, for the same reason as the default: a PC
without the font would print with other widths and other page breaks.

**Trying it without Electron.** `npm run print:preview` (or the `print-preview`
entry in `.claude/launch.json`) now stubs enough of the API for the whole
interface, so the editor can be used at `http://localhost:8801/#reports`; layouts
saved there live in the page's memory only.

## Still open with the client

0. **Report sizes.** Confirm with the client that the rojmel at its own
   workbook's sizes (11/12) is what they want, rather than 14 on facing sheets,
   and that the Khatavahi at one account a sheet is acceptable to the auditors.
1. **§11.8 — cash.** Are there real cash transactions beyond the reimbursement
   round-trip? Unknown. Built so either answer works: cash is a real computed
   column everywhere and the model permits standalone cash entries, but the UI
   offers only the round-trip, and non-zero cash at a date raises a warning.
   **Needs a real answer before year-closing is built**, since carrying cash
   forward depends on it.
2. **§11.4 — rojmel pagination.** Must the printed page numbers line up with a
   physical pre-numbered book?
3. **§11.10 — ખર્ચેલ રકમ.** Confirm the FIFO rule.
4. **§11.5 — paper.** Exact paper sizes and margins.
5. Annexure 10's ક્રમ column is Latin-digit in the original while the rest of the
   report is Gujarati. We print Gujarati unless the client wants the quirk kept.
6. **Windows code signing.** An unsigned installer triggers a SmartScreen warning
   on first run. A certificate costs money annually; decide before distribution.
7. **Ledger row wording.** A cheque's row in a ખાતાવહી describes only that head's
   share, built from the bills of that head. The reference varies the suffix
   ("પ્રવેશોત્સવ કીટના ચુકવ્યા વા.મુ" against "સ્વચ્છતા સામાન અને સફાઈકામ પેટે
   ચુકવ્યા વા.મુજબ"); we use one consistent form until the client picks one.

**Prisma 7 with the better-sqlite3 driver adapter.** Prisma's native Rust query
engine is the usual reason Prisma is painful to package in Electron: a
per-platform binary that has to be unpacked from the asar archive at exactly the
right path. Prisma 7's `queryCompiler` preview feature replaces it with a WASM
compiler, so the generated client carries no native binary at all — verified by
checking that `libquery_engine-*.node` no longer exists after generation. The
datasource therefore has no `url`; the connection is made at runtime from a path,
which is also what lets the packaged app put its database in `userData`.

**better-sqlite3 needs its ABI to match whoever loads it.** Node for the tests
and CLI scripts (`NODE_MODULE_VERSION 127`), Electron for the app (139). Each npm
script switches for its own runtime first — `pretest` and friends run
`rebuild:node`, `predev`/`prebuild` run `rebuild:electron`.

This needed a custom script (`scripts/native-abi.mjs`) because the standard tools
do not work: `electron-builder install-app-deps` and `@electron/rebuild` both
report success while leaving the Node binary in place, since `prebuild-install`
skips when a binary already exists. Only a from-source compile against Electron's
headers produces the 139 build, and node-gyp ignores `--runtime`/`--target`
unless they are given as `npm_config_*` environment variables. That compile is
too slow to run before every `npm run dev`, so each binary is built once, cached
under `.native-cache/`, and switching is a copy.

A trap worth recording: `require("better-sqlite3")` is **not** a valid check of
which build is present. The binding loads lazily, so the require succeeds with the
wrong binary; only opening a database reveals it. See `scripts/check-abi.mjs`.

**Where the databases live.** Each school's books are in the folder the user
chose for it (see "Accounts, schools and pen drives"). The PC keeps only its own
state - who is signed in, which schools it has opened, where it last found them -
in `app.getPath("userData")`, because the installed application directory is
read-only (on Windows it is under Program Files). In development that state is
`.dev-data/<pc>/` in the project, so `SMC_DEV_PC=pc2 npm run dev` is a second PC,
and `prisma/dev.db` is the seeded sample year, offered as "books from the earlier
version" to move into a school folder.

**better-sqlite3 is now better-sqlite3-multiple-ciphers**, installed under the
same name through an npm alias (`"better-sqlite3": "npm:better-sqlite3-multiple-ciphers@12.11.1"`),
so Prisma's adapter, the migrations and the tests load it unchanged. It
publishes prebuilt binaries for every Node and Electron ABI, so
`scripts/native-binaries.mjs` downloads them instead of compiling; the compile
path remains only as a fallback. The version is pinned exactly: the binaries are
cached by package, version, runtime, ABI, platform and architecture.

## Known dependency advisories

`npm audit` (September 2026) also reports advisories against **Electron 38
itself** (fixed from Electron 40.10.3 / 41.7.2), and moderate ones in exceljs's
bundled `uuid` and in vitest. Supabase's client adds none. Upgrading Electron is
the one worth doing before distribution; it changes the native ABI, so add the
new major to `abiByMajor` in `scripts/native-binaries.mjs` and check the cipher
library publishes a binary for it.

Three high-severity advisories remain, all one chain: `prisma` → `@prisma/config`
→ `deepmerge-ts`. They affect the Prisma CLI's config loader at development time,
not anything at runtime. The only published fix is a Prisma 8 release candidate,
which is a worse trade than the advisory. Revisit when Prisma 8 ships stable.
