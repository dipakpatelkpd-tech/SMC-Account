/**
 * Put the right better-sqlite3 binary in place for the runtime about to load it.
 *
 *   node scripts/native-abi.mjs node       # tests, seed, CLI scripts
 *   node scripts/native-abi.mjs electron   # the app
 *
 * Why this exists
 * ---------------
 * better-sqlite3 is a native module, so its compiled binary only works with the
 * runtime it was built for: Node 22 is NODE_MODULE_VERSION 127, Electron 38 is
 * 139. The project needs both - the tests and the seed run under Node, the app
 * runs under Electron.
 *
 * The obvious tools do not do this reliably: `electron-builder install-app-deps`
 * and `@electron/rebuild` both report success while leaving the Node binary in
 * place, because prebuild-install sees a binary already on disk and skips.
 *
 * So each binary is fetched once - the published prebuild, see
 * scripts/native-binaries.mjs - cached under .native-cache/, and switching is a
 * file copy. If a prebuild cannot be downloaded (no network, or a runtime the
 * release does not cover) it falls back to compiling from source, which takes a
 * minute or two.
 *
 * Verifying the result needs care: requiring better-sqlite3 is NOT enough,
 * because it loads its binding lazily and the require succeeds even when the
 * binary is wrong. Only opening a database actually dlopens it - which is what
 * scripts/check-abi.mjs does.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import {
  BINARY,
  CACHE_DIR,
  MODULE_DIR,
  ROOT,
  cachedBinaryPath,
  electronAbi,
  electronVersion,
  fetchPrebuild,
  install,
} from "./native-binaries.mjs";

const target = process.argv[2];
if (target !== "node" && target !== "electron") {
  console.error("usage: node scripts/native-abi.mjs <node|electron>");
  process.exit(1);
}

const wanted = {
  runtime: target,
  abi: target === "node" ? process.versions.modules : electronAbi(),
  platform: process.platform,
  arch: process.arch,
};

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", cwd: ROOT, ...options });
}

/**
 * Compile from source. The npm_config_* variables are the only form node-gyp
 * honours consistently here; the same settings as --runtime/--target flags
 * silently produced a Node binary instead.
 */
function compile() {
  const env = { ...process.env, npm_config_build_from_source: "true" };
  if (target === "electron") {
    const version = electronVersion();
    console.log(`compiling better-sqlite3 for Electron ${version} (a minute or two)…`);
    Object.assign(env, {
      npm_config_runtime: "electron",
      npm_config_target: version,
      npm_config_disturl: "https://electronjs.org/headers",
      npm_config_arch: process.arch,
    });
  } else {
    console.log("compiling better-sqlite3 for Node (a minute or two)…");
  }
  run("npx", ["--yes", "node-gyp", "rebuild"], { cwd: MODULE_DIR, env });
  if (!existsSync(BINARY)) {
    console.error(`the build produced no binary at ${BINARY}`);
    process.exit(1);
  }
  const cached = cachedBinaryPath(wanted);
  mkdirSync(CACHE_DIR, { recursive: true });
  copyFileSync(BINARY, cached);
  console.log(`cached ${target} binary (${statSync(cached).size} bytes)`);
  return cached;
}

let cached = cachedBinaryPath(wanted);
if (!existsSync(cached)) {
  try {
    cached = await fetchPrebuild(wanted);
  } catch (error) {
    console.warn(`no prebuilt binary: ${error instanceof Error ? error.message : error}`);
    cached = compile();
  }
}

if (install(cached)) console.log(`better-sqlite3 switched to the ${target} build`);
