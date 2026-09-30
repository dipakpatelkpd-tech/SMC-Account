/** Prove a fresh database is built correctly by the shipped migrations. */
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations, shippedMigrations } from "../electron/migrate.ts";

const tmp = path.join(process.cwd(), ".migration-test.db");
rmSync(tmp, { force: true });
rmSync(tmp + "-wal", { force: true });
rmSync(tmp + "-shm", { force: true });

const migrations = path.join(process.cwd(), "prisma", "migrations");

const first = runMigrations(tmp, migrations);
console.log(`  first run : created=${first.created} applied=[${first.applied.join(", ")}]`);

const db = new Database(tmp);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
db.close();
console.log(`  tables    : ${tables.length} -> ${tables.join(", ")}`);

const second = runMigrations(tmp, migrations);
console.log(`  second run: applied=[${second.applied.join(", ")}] alreadyApplied=${second.alreadyApplied.length}`);

rmSync(tmp, { force: true });
rmSync(tmp + "-wal", { force: true });
rmSync(tmp + "-shm", { force: true });

const ok = first.created && first.applied.length === shippedMigrations(migrations).length && second.applied.length === 0 && tables.length >= 11;
console.log(ok ? "\n  PASS: fresh database built, and re-running is a no-op" : "\n  FAIL");
process.exit(ok ? 0 : 1);
