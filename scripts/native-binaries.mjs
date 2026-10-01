/**
 * Finding the right better-sqlite3 binary for a runtime, shared by
 * scripts/native-abi.mjs (this machine) and scripts/win-native.mjs (Windows).
 *
 * `better-sqlite3` in this project is an npm alias for
 * better-sqlite3-multiple-ciphers: the same library and API, built with
 * SQLite3 Multiple Ciphers so each school's database can be encrypted on disk
 * (see docs/DECISIONS.md, "Encryption"). Everything that loads it - Prisma's
 * adapter, the migrations, the tests - still imports "better-sqlite3".
 *
 * The fork publishes a prebuilt binary for every Node and Electron ABI on every
 * platform, so a binary is DOWNLOADED rather than compiled: seconds instead of
 * minutes, and the same artefact `npm install` would fetch on that machine.
 *
 * Cached binaries are named after the package, its version, the runtime, the
 * ABI, the platform and the architecture. Changing any one of them - a version
 * bump, or the switch from plain better-sqlite3 to the cipher fork - therefore
 * can never pick up a stale binary built for something else.
 */
import { createWriteStream, existsSync, mkdirSync, copyFileSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const ROOT = path.resolve(import.meta.dirname, "..");
export const MODULE_DIR = path.join(ROOT, "node_modules", "better-sqlite3");
export const BINARY = path.join(MODULE_DIR, "build", "Release", "better_sqlite3.node");
export const CACHE_DIR = path.join(ROOT, ".native-cache");

/** The package actually installed under node_modules/better-sqlite3. */
export function installedModule() {
  const pkg = JSON.parse(readFileSync(path.join(MODULE_DIR, "package.json"), "utf8"));
  const repository = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? "";
  const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(repository);
  if (!match) throw new Error(`cannot find the GitHub repository of ${pkg.name} in its package.json`);
  return { name: pkg.name, version: pkg.version, repo: match[1] };
}

/** Electron's NODE_MODULE_VERSION - the number the prebuilds are named after. */
export function electronAbi() {
  const major = Number(require("electron/package.json").version.split(".")[0]);
  // Only the versions this project might be on. An unknown major is a hard error
  // rather than a guess: a wrong ABI produces an app that fails on the school's
  // machine and nowhere else.
  const abiByMajor = { 36: "136", 37: "137", 38: "139", 39: "141" };
  const abi = abiByMajor[major];
  if (!abi) {
    throw new Error(
      `Unknown Electron major ${major}. Add its NODE_MODULE_VERSION to abiByMajor in ` +
        `scripts/native-binaries.mjs - "process.versions.modules" inside the app prints it.`,
    );
  }
  return abi;
}

export function electronVersion() {
  return require("electron/package.json").version;
}

/** Where the cached binary for one runtime/platform lives. */
export function cachedBinaryPath({ runtime, abi, platform, arch }) {
  const { name, version } = installedModule();
  return path.join(CACHE_DIR, `${name}-${version}-${runtime}-v${abi}-${platform}-${arch}.node`);
}

/**
 * Download the published prebuild into the cache, unless it is already there.
 * Returns the cached path. Throws when the release has no such file.
 */
export async function fetchPrebuild({ runtime, abi, platform, arch }) {
  const cached = cachedBinaryPath({ runtime, abi, platform, arch });
  if (existsSync(cached)) return cached;

  const { name, version, repo } = installedModule();
  const file = `${name}-v${version}-${runtime}-v${abi}-${platform}-${arch}`;
  const url = `https://github.com/${repo}/releases/download/v${version}/${file}.tar.gz`;

  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`downloading ${file}.tar.gz…`);

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(
      `Could not download the prebuilt binary (${response.status} ${response.statusText}).\n  ${url}`,
    );
  }

  const temporary = path.join(CACHE_DIR, `${file}.tar.gz`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));

  // The tarball holds build/Release/better_sqlite3.node.
  const unpacked = path.join(CACHE_DIR, file);
  rmSync(unpacked, { recursive: true, force: true });
  mkdirSync(unpacked, { recursive: true });
  try {
    // Relative paths from inside the cache: a Windows path such as C:\... would
    // be read by GNU tar (Git for Windows) as a remote host.
    execFileSync("tar", ["-xzf", `${file}.tar.gz`, "-C", file], { stdio: "inherit", cwd: CACHE_DIR });
    const extracted = path.join(unpacked, "build", "Release", "better_sqlite3.node");
    if (!existsSync(extracted)) {
      throw new Error(`${file}.tar.gz did not contain build/Release/better_sqlite3.node`);
    }
    copyFileSync(extracted, cached);
  } finally {
    rmSync(temporary, { force: true });
    rmSync(unpacked, { recursive: true, force: true });
  }
  return cached;
}

/** Put a cached binary in place, skipping the copy when it is already there. */
export function install(cached) {
  mkdirSync(path.dirname(BINARY), { recursive: true });
  if (existsSync(BINARY) && readFileSync(BINARY).equals(readFileSync(cached))) return false;
  copyFileSync(cached, BINARY);
  return true;
}
