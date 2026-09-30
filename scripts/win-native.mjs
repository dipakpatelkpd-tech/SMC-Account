/**
 * Put the WINDOWS better-sqlite3 binary in place, so the installer can be built
 * from this Linux machine.
 *
 *   node scripts/win-native.mjs
 *
 * Why this is needed
 * ------------------
 * better-sqlite3 is a native module: the .node file in node_modules is compiled
 * for one runtime AND one operating system. Everything here is Linux, so
 * packaging as-is would produce a Windows installer carrying a Linux binary, and
 * the app would die on the school's machine the moment it opened the database -
 * the one failure that only shows up after the installer has been handed over.
 *
 * Compiling a Windows binary on Linux would mean a cross-compiler and the
 * Windows SDK. There is no need: the library publishes prebuilt binaries for
 * every Electron ABI and platform (scripts/native-binaries.mjs), so the right one
 * is downloaded and dropped in - the same artefact `npm install` would fetch on
 * a Windows machine.
 *
 * Afterwards node_modules holds a Windows binary and nothing here can run. That
 * repairs itself: `npm run dev` and `npm test` both switch the binary back
 * through scripts/native-abi.mjs, which keeps its own cache.
 */
import { electronAbi, fetchPrebuild, install } from "./native-binaries.mjs";

const wanted = { runtime: "electron", abi: electronAbi(), platform: "win32", arch: "x64" };

let cached;
try {
  cached = await fetchPrebuild(wanted);
} catch (error) {
  console.error(
    `${error instanceof Error ? error.message : error}\n` +
      `Without that file the Windows installer has to be built on a Windows machine.`,
  );
  process.exit(1);
}

install(cached);
console.log(`better-sqlite3 switched to the Windows (Electron ABI ${wanted.abi}, x64) build`);
