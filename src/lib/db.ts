/**
 * The database connection.
 *
 * Prisma 7 with the better-sqlite3 driver adapter. The adapter matters for more
 * than tidiness: it removes Prisma's native Rust query engine, which is the usual
 * reason Prisma is painful to package inside Electron - a per-platform binary
 * that has to be unpacked from the asar archive at the right path. With the
 * adapter there is no such binary; better-sqlite3 is the only native piece, and
 * electron-rebuild handles that.
 *
 * The connection is therefore made at RUNTIME from a path, not from a build-time
 * DATABASE_URL. In the packaged app the database lives in the user's data
 * directory, because the application bundle itself is read-only once installed.
 */
import { createRequire } from "node:module";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import type Database from "better-sqlite3";
import { unlock } from "../server/vault.js";

/**
 * @prisma/client is CommonJS, and it is loaded through require() on purpose.
 *
 * `import { PrismaClient } from "@prisma/client"` works in development and in
 * the tests, and then fails in the PACKAGED app with "Named export
 * \'PrismaClient\' not found": the main bundle is ESM, and Node\'s ESM loader
 * cannot see a CommonJS module\'s named exports once that module is being read
 * out of an asar archive. It is the kind of bug that only exists after the
 * installer has been built, which is exactly why the packaged app is worth
 * starting once before shipping it.
 *
 * require() has no such problem, in or out of asar. The type comes from the
 * type-only import above, so nothing is lost.
 */
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: new (options?: unknown) => PrismaClientType;
};

type PrismaClient = PrismaClientType;

/** Where the database file lives for a given run. */
export interface DatabaseLocation {
  /** Absolute path to the SQLite file. */
  file: string;
  /**
   * The school's encryption key (src/server/vault.ts). Every school database
   * opened by the app has one; only the development database and the tests'
   * scratch databases are plain.
   */
  keyHex?: string;
}

/**
 * Resolve the database path.
 *
 * In Electron the main process passes the user-data path explicitly. Outside it
 * - tests, the seed, the CLI scripts - DATABASE_URL applies, defaulting to the
 * development database in prisma/.
 */
export function resolveDatabaseFile(explicitPath?: string): string {
  if (explicitPath) return explicitPath;

  const url = process.env["DATABASE_URL"];
  if (url) return url.startsWith("file:") ? url.slice("file:".length) : url;

  return "prisma/dev.db";
}

export function createPrismaClient(location?: Partial<DatabaseLocation>): PrismaClient {
  const plain = new PrismaBetterSqlite3({
    url: `file:${resolveDatabaseFile(location?.file)}`,
  });
  const adapter = location?.keyHex ? unlocking(plain, location.keyHex) : plain;

  return new PrismaClient({
    adapter,
    log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * The adapter, with the key applied to each connection before Prisma uses it.
 *
 * Prisma's better-sqlite3 adapter opens the file itself and offers no hook for
 * a key. Its connection is reachable as `client` on the adapter it returns,
 * though, and SQLite reads nothing from the file until the first statement - so
 * unlocking straight after connect() means no page is ever read without the key.
 * Everything else is the stock adapter.
 */
function unlocking(inner: PrismaBetterSqlite3, keyHex: string): PrismaBetterSqlite3 {
  return {
    provider: inner.provider,
    adapterName: inner.adapterName,
    async connect() {
      const adapter = await inner.connect();
      const client = (adapter as unknown as { client?: Database.Database }).client;
      if (!client) throw new Error("the Prisma SQLite adapter no longer exposes its connection");
      unlock(client, keyHex);
      // The books live on a pen drive that can be pulled out at any moment:
      // every commit waits until it is really on the drive.
      client.pragma("synchronous = FULL");
      return adapter;
    },
    connectToShadowDb: () => inner.connectToShadowDb(),
  } as PrismaBetterSqlite3;
}

/**
 * A process-wide client for the CLI scripts and tests.
 *
 * The Electron main process does NOT use this - it calls createPrismaClient with
 * the user-data path once, at startup, and owns that instance.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
