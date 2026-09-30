# Building the installer

The school gets one file: `SMC-Accounts-<version>-setup.exe`. They double-click it,
it installs, and the app runs - on every PC they use, installed the same way. Each
school's books live wherever the user put them, usually a pen drive; the PC keeps
only its login and the list of schools it has opened (docs/DECISIONS.md,
"Accounts, schools and pen drives").

**Before building, `.env` must hold the Supabase project's URL and publishable
key** (docs/SUPABASE_SETUP.md, step 6). They are built into the installer; a build
made without them opens on a screen saying so and can log nobody in. Check them
first:

```bash
npm run check:cloud
```

## The short version

```bash
npm run pack:win
```

That is: build the Electron bundles, put the **Windows** better-sqlite3 binary in
place, and run electron-builder. The result lands in `release/`.

On this Linux machine the last step needs **wine**, because the NSIS installer is
a Windows executable that has to be built with Windows tools:

```bash
sudo apt install wine64
```

Without wine everything up to the installer still works, and
`release/win-unpacked/` holds a complete, runnable Windows application folder —
it can be zipped and copied to a Windows machine as-is. Only the single-file
installer needs wine.

## Why there is a separate step for the native binary

better-sqlite3 is a native module: the compiled `.node` file only works for one
runtime **and** one operating system. (Here "better-sqlite3" is the encrypting
fork, better-sqlite3-multiple-ciphers, installed under the same name.) This
project therefore juggles three binaries, all cached under `.native-cache/`:

| Command | Binary | Used by |
| --- | --- | --- |
| `npm run rebuild:node` | Linux, Node ABI 127 | `npm test`, the seed, the CLI scripts |
| `npm run rebuild:electron` | Linux, Electron ABI 139 | `npm run dev` |
| `npm run rebuild:win` | Windows x64, Electron ABI 139 | `npm run pack:win` |

Most of these are automatic: `pretest` and `predev` switch the binary before the
command that needs it, so after packaging for Windows, `npm run dev` and
`npm test` repair themselves.

All three are downloaded rather than compiled — the library publishes a prebuild
for every Node and Electron ABI, the same files `npm install` would fetch on each
machine. See `scripts/native-binaries.mjs`, which also fails loudly if the
Electron version is bumped to one whose ABI it does not know. Cached binaries are
named by package, version, runtime, ABI, platform and architecture; the
`better_sqlite3-*.node` files left in `.native-cache/` from before the switch are
no longer used and can be deleted.

## Verifying a build before it goes out

Packaging problems do not show up in development — the code is identical, only
the way it is loaded changes. Three of them were found exactly this way and are
now fixed (a CommonJS import that only fails inside `app.asar`, a `files` pattern
that deleted `exceljs/lib/doc`, and Prisma's generated client living in
`node_modules/.prisma`, which electron-builder skips unless it is named). So:
**start the packaged app once before handing the installer over.**

The quickest honest check, on this machine, is the Linux package, which loads the
same bundles through the same asar archive:

```bash
npx electron-builder --linux --dir
rm -rf ~/.config/smc-accounts          # pretend this is a new machine
SMOKE_SHOT=/tmp/first-run.png ./release/linux-unpacked/smc-accounts --no-sandbox
```

It should write a screenshot of the **login screen** - or, if the build was made
without the Supabase settings, of the screen saying so. That is the first-run path:
a new PC knows nobody and no school until someone logs in.

On Windows the same check is: install, run, log in (this needs the internet), create
a school on a pen drive, back up, then open the same pen drive on a second PC.
This PC's own state is in `%APPDATA%\smc-accounts\` (the login, sealed by
Windows, and the list of schools it has seen); the books are in
`<pen drive>\SMC Accounts\<DISE code>\`. A copy of the earlier version's single
database found at `%APPDATA%\smc-accounts\smc-accounts.db` is offered, after login,
for moving into a school folder; it is renamed, never deleted.

## What is in the installer

- `SMC Accounts.exe` plus Electron's runtime (~370 MB unpacked, ~120 MB
  compressed — Electron is most of it).
- `resources/app.asar`: the built main, preload and renderer bundles, and the
  production dependencies.
- `resources/app.asar.unpacked/…/better_sqlite3.node`: the native module, which
  has to sit on the real filesystem rather than inside the archive.
- `resources/prisma/migrations/`: the schema, applied to each school's database
  when it is opened.
- The Supabase URL and publishable key, compiled into the main bundle. Nothing
  secret: the publishable key identifies the project, and the database's own rules
  (supabase/migrations/0001_smc_cloud.sql) decide what it may do.

## Still to do

- **No application icon.** electron-builder says `default Electron icon is used`.
  Put a 256×256 `icon.png` (or `icon.ico`) in `build/` and it is picked up
  automatically.
- **The installer is unsigned.** Windows SmartScreen will warn the first few
  people who run it. Signing needs a code-signing certificate; without one, tell
  the school to choose "More info → Run anyway".
- **This project is not under version control.** During one packaging run
  `package.json` was overwritten with a stripped copy (no scripts, no build
  config) and had to be rebuilt by hand. `git init` would make that a one-command
  recovery.
