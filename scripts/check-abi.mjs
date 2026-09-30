/**
 * Which runtime is better-sqlite3's native binary built for?
 *
 * Requiring the module is NOT a valid check - better-sqlite3 loads its .node
 * binding lazily, so the require succeeds even when the binary is for the wrong
 * runtime. Only opening a database actually dlopens it.
 */
import Database from "better-sqlite3";

try {
  new Database(":memory:").close();
  console.log(`OK: usable by this runtime (NODE_MODULE_VERSION ${process.versions.modules})`);
  process.exit(0);
} catch (error) {
  const match = /NODE_MODULE_VERSION (\d+)\. This version of \w+\.js requires\s+NODE_MODULE_VERSION (\d+)/s.exec(
    String(error.message),
  );
  console.log(
    match
      ? `WRONG BUILD: binary is ABI ${match[1]}, this runtime needs ${match[2]}`
      : `FAILED: ${String(error.message).slice(0, 120)}`,
  );
  process.exit(1);
}
