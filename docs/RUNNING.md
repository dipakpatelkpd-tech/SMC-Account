# Running the app in development

```bash
npm install
npm run db:reset     # create and seed prisma/dev.db with the sample year
npm run dev
```

## Accounts, schools and pen drives in development

Without a Supabase project in `.env`, `npm run dev` uses a **development cloud**:
a folder, `.dev-data/cloud/`, that behaves like the real one (accounts with
emailed codes, one account's schools hidden from another, append-only backups).
The login screen says so in a yellow note. The codes the real service would email
are printed in the terminal and appended to `.dev-data/cloud/outbox.txt`.
`SMC_CLOUD=fake` forces it even when `.env` has a project.

Everything the development app keeps is under `.dev-data/`:

| Path | What |
|---|---|
| `.dev-data/cloud/` | the development cloud |
| `.dev-data/pc1/` | this "PC": login, schools it has opened (`SMC_DEV_PC=pc2 npm run dev` is a second PC) |
| any folder you pick | a school's data folder - make e.g. `.dev-data/pendrive/` and choose it, or use a real USB stick |

After logging in, the seeded sample year (`prisma/dev.db`) is offered as "books
from the earlier version": **Move the books** copies it, encrypted, into a school
folder you choose. The original is never changed in development.

`rm -rf .dev-data` starts again from nothing.

Once the Supabase project exists (docs/SUPABASE_SETUP.md), putting its two values
into `.env` makes `npm run dev` use it instead.

### Scripted walkthroughs

`SMOKE_STEPS=<file.json>` runs a list of `{ "run": "<JS in the page>", "wait": ms,
"shot": "<png>" }` steps after the window loads, then quits - used to walk
through login, a new school and the pen drive being pulled out without anybody at
the keyboard. `SMOKE_PICK_FOLDER=<dir>` answers every folder dialog with that
folder, because a script cannot click a native dialog. Both work only in
development.

## Linux: "The SUID sandbox helper binary was found, but is not configured correctly"

Ubuntu 23.10 and later set `kernel.apparmor_restrict_unprivileged_userns=1`, which
blocks Chromium's namespace sandbox. Electron then falls back to the SUID sandbox
helper — and the copy npm installs is owned by the current user with mode 755,
not `root:root` mode 4755, so Electron aborts rather than run unsandboxed.

Fix it once per Electron install:

```bash
npm run fix:sandbox
```

That is `chown root:root` plus `chmod 4755` on
`node_modules/electron/dist/chrome-sandbox`, and it needs sudo. **Repeat it
whenever npm reinstalls Electron** (a fresh `npm install`, or changing the
Electron version), because the ownership is reset each time.

This affects Linux development only. Windows and macOS builds do not use this
mechanism, and the packaged Windows installer is unaffected.

If you would rather not use sudo, `npm run dev:nosandbox` starts the app with
Chromium's sandbox switched off. Prefer the real fix: the sandbox is the barrier
that keeps a compromised renderer away from the rest of the machine. The risk is
smaller here than in a browser — the renderer loads only local files, with
`contextIsolation` on, `nodeIntegration` off and a CSP that blocks remote code —
but it is a real protection to give up, so treat it as a temporary workaround.

## Native modules: better-sqlite3 and the two ABIs

`better-sqlite3` is a native module, so its compiled binary only works with the
runtime that loads it: **Node 22 is NODE_MODULE_VERSION 127, Electron 38 is 139**.
This project needs both — the tests, seed and CLI scripts run under Node, the app
runs under Electron.

The npm scripts handle the switch themselves. `pretest`, `predb:seed`,
`preverify:seed` and `preshow:reports` switch to the Node build; `predev` and
`prebuild` switch to the Electron build. After the first build of each, switching
is a file copy and takes about a third of a second.

```bash
npm run rebuild:node       # for tests and CLI scripts
npm run rebuild:electron   # for the app
npm run check:abi          # what is the binary built for, relative to Node?
```

### Why this needed a custom script

`electron-builder install-app-deps` and `@electron/rebuild` both **report success
while doing nothing**. They delegate to `prebuild-install`, which finds a binary
already on disk and skips. Deleting the binary first does not help — it restores
the same cached *Node* prebuild, with the original timestamp. Only a real
from-source compile against Electron's headers produces the 139 binary, and the
`--runtime`/`--target` flags are silently ignored unless passed as `npm_config_*`
environment variables.

Because that compile takes a minute or two, `scripts/native-abi.mjs` builds each
binary once, caches it under `.native-cache/`, and switches by copying.

### Checking the build is what you think it is

Requiring the module proves nothing: better-sqlite3 loads its binding lazily, so
`require("better-sqlite3")` succeeds even when the binary is for the wrong
runtime. Only opening a database actually loads it, which is what
`scripts/check-abi.mjs` does. `npm run check:abi` runs under Node, so it reports
`WRONG BUILD: binary is ABI 139` when the Electron build is in place — that is
the correct answer, not a failure.

## Working on the printed reports

The report layouts are reproductions of government forms, so they are laid out in
millimetres and have to fit an exact sheet. Iterating on them inside Electron is
slow, so:

```bash
npm run print:preview     # builds, then serves the print routes on :8801
```

That copies the built renderer, injects a stub `window.accounts` holding a real
dashboard payload from the database, and serves it to an ordinary browser. It is
the same markup, stylesheet and numbers as the app, so a measurement taken there
holds in the PDF. Open `http://localhost:8801/#print:annexure10`.

Two things to check on any new report, because the browser will not complain
about either:

- **Width.** `table.scrollWidth` must not exceed `.sheet` `clientWidth`, or
  columns spill off the page.
- **Height.** `.sheet` `scrollHeight` must stay within 1047px (277mm) for
  portrait, or the report silently runs onto a second page.

Note that `src/renderer/styles.css` applies to these pages too, and some of its
rules are wrong for a form — `thead th { white-space: nowrap }` made long
Gujarati headings overflow into the next column instead of wrapping. The print
stylesheet overrides what it needs; expect to add more overrides as reports are
added.

## Screenshotting the running app

```bash
npx electron . --remote-debugging-port=9222 &
npm run shoot -- reports shot.png          # or a language: ... shot.png en
```

Do not use Electron's `webContents.capturePage()` for this. It returns the last
COMPOSITED frame, and an unfocused window stops compositing — so it hands back
the first frame it ever painted. That produced screenshots of a loading spinner
for an app that was fully rendered and working. `scripts/shoot.mjs` drives the
Chrome DevTools Protocol instead, which forces a fresh frame.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app with hot reload |
| `npm test` | Run the 99 engine and report tests |
| `npm run verify:seed` | Check the database reproduces `expected_results` |
| `npm run show:reports` | Print every computed report to the terminal |
| `npm run db:reset` | Rebuild and reseed the development database |
| `npm run print:preview` | Serve the print layouts in a browser |
| `npm run pack:win` | Build the Windows installer |
