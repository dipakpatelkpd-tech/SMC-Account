/**
 * Creating and upgrading the school's database on startup.
 *
 * Why this file exists
 * --------------------
 * Development has always had a database because `prisma db push` made one here.
 * An installed copy has none: the app starts, looks in the user's data folder,
 * finds nothing, and has no instructions for building a schema. Without this it
 * would fail on first launch on every machine except the one it was built on.
 *
 * Prisma's own `migrate deploy` is a CLI command. Shipping the Prisma CLI inside
 * an Electron app to run it is heavy and fragile, so the migration files are
 * applied directly instead: read the SQL, run it, record that it ran. The files
 * are the ones Prisma generates (`prisma/migrations/<name>/migration.sql`), so
 * the schema stays Prisma's to define - only the applying is ours.
 *
 * Rules this follows, because a school's books are the only copy of their year:
 *
 *  - Each migration runs inside a transaction: it applies completely or not at
 *    all, never halfway.
 *  - Applied migrations are recorded, so a migration never runs twice.
 *  - Migrations run in filename order, which is why they are numbered.
 *  - A failure aborts startup with the real reason rather than opening a window
 *    onto a half-built database.
 *  - Data that a NEWER version of the app has already upgraded is refused, not
 *    opened. The books travel on a pen drive between PCs that may run different
 *    versions; an older copy writing to a schema it does not understand could
 *    damage them, so it asks for the software on that PC to be updated instead.
 */
import Database from "better-sqlite3";
import { readdirSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { openEncrypted } from "../src/server/vault.js";

/** Where the applied-migration log lives. Ours, not Prisma's. */
const LOG_TABLE = "_smc_migrations";

export interface MigrationResult {
  /** True when the database file did not exist before this run. */
  created: boolean;
  applied: string[];
  alreadyApplied: string[];
  /** The newest migration now applied: the data's schema version. */
  schemaVersion: string;
}

export interface MigrationOptions {
  /** The school's encryption key. Every profile database has one. */
  keyHex?: string;
}

/** The data was upgraded by a newer version of the app than this one. */
export class NewerDataError extends Error {
  constructor(readonly unknownMigrations: string[]) {
    super(
      `this data was upgraded by a newer version of SMC Accounts ` +
        `(unknown migration ${unknownMigrations.join(", ")}); update the software on this PC`,
    );
    this.name = "NewerDataError";
  }
}

/** The migrations shipped with this build, in the order they apply. */
export function shippedMigrations(migrationsDir: string): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Bring the database at `databaseFile` up to date with `migrationsDir`.
 *
 * Safe to call on every start: with nothing pending it opens the file, reads the
 * log and closes again.
 */
export function runMigrations(
  databaseFile: string,
  migrationsDir: string,
  options: MigrationOptions = {},
): MigrationResult {
  const created = !existsSync(databaseFile);

  // The parent folder may not exist on a fresh install.
  mkdirSync(path.dirname(databaseFile), { recursive: true });

  if (!existsSync(migrationsDir)) {
    throw new Error(
      `No migrations found at ${migrationsDir}. The application was packaged without them; ` +
        `check the "files" list in package.json's build section.`,
    );
  }

  const database = options.keyHex
    ? openEncrypted(databaseFile, options.keyHex)
    : new Database(databaseFile);

  try {
    // Foreign keys are off by default in SQLite and the schema relies on them.
    database.pragma("foreign_keys = ON");
    if (options.keyHex) {
      // A school's books live on a pen drive. The rollback journal keeps them
      // ONE file whenever no write is in progress, so copying the folder always
      // copies everything, and a drive pulled out mid-write is rolled back on
      // the next open. WAL would leave committed data in a side file that is
      // easy to leave behind. Every commit waits for the drive (FULL).
      database.pragma("journal_mode = DELETE");
      database.pragma("synchronous = FULL");
    } else {
      // The development database: survives an abrupt shutdown far better than
      // the default journal.
      database.pragma("journal_mode = WAL");
    }

    database
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
           name       TEXT PRIMARY KEY,
           appliedAt  TEXT NOT NULL
         )`,
      )
      .run();

    const done = new Set(
      database
        .prepare(`SELECT name FROM ${LOG_TABLE}`)
        .all()
        .map((row) => (row as { name: string }).name),
    );

    const available = shippedMigrations(migrationsDir);

    const unknown = [...done].filter((name) => !available.includes(name)).sort();
    if (unknown.length > 0) throw new NewerDataError(unknown);

    const applied: string[] = [];
    const alreadyApplied: string[] = [];

    for (const name of available) {
      if (done.has(name)) {
        alreadyApplied.push(name);
        continue;
      }

      const file = path.join(migrationsDir, name, "migration.sql");
      if (!existsSync(file)) continue;

      const sql = readFileSync(file, "utf8");

      // All or nothing. A half-applied migration is worse than none.
      const apply = database.transaction(() => {
        database.exec(sql);
        database
          .prepare(`INSERT INTO ${LOG_TABLE} (name, appliedAt) VALUES (?, ?)`)
          .run(name, new Date().toISOString());
      });

      try {
        apply();
        applied.push(name);
      } catch (error) {
        throw new Error(
          `Migration "${name}" failed and was rolled back: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    return { created, applied, alreadyApplied, schemaVersion: available.at(-1) ?? "" };
  } finally {
    database.close();
  }
}

/**
 * Adopt a database that was built with `prisma db push` and so has no log.
 *
 * The development database here is exactly that: its tables exist but nothing
 * recorded how they got there, so a first migration run would try to CREATE
 * TABLE over live data and fail. If the schema is clearly already present, the
 * migrations are marked as applied instead of re-run.
 */
export function adoptExistingSchema(databaseFile: string, migrationsDir: string): boolean {
  if (!existsSync(databaseFile)) return false;

  const database = new Database(databaseFile);
  try {
    const hasSchema = database
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='School'`)
      .get();
    if (!hasSchema) return false;

    const hasLog = database
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(LOG_TABLE);
    if (hasLog) return false;

    database
      .prepare(
        `CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
           name       TEXT PRIMARY KEY,
           appliedAt  TEXT NOT NULL
         )`,
      )
      .run();

    const names = shippedMigrations(migrationsDir);

    const insert = database.prepare(
      `INSERT OR IGNORE INTO ${LOG_TABLE} (name, appliedAt) VALUES (?, ?)`,
    );
    const now = new Date().toISOString();
    for (const name of names) insert.run(name, now);

    return true;
  } finally {
    database.close();
  }
}
