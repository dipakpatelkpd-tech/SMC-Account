/**
 * The encryption of a school's books on disk.
 *
 * These are the promises the pen-drive design rests on: without the key the
 * file is unreadable - not merely "hard to read" - every copy the app makes of
 * it stays encrypted, and the application reads it through Prisma exactly as
 * before once the key is given.
 */
import { afterAll, describe, expect, it } from "vitest";
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "../../electron/migrate.js";
import { createPrismaClient } from "../../src/lib/db.js";
import {
  assertKeyHex,
  encryptCopy,
  generateKeyHex,
  isPlainDatabase,
  keyFingerprint,
  openEncrypted,
  snapshotInto,
  VaultError,
} from "../../src/server/vault.js";
import { AccountsService } from "../../src/server/accounts-service.js";
import { DEV_DB, MIGRATIONS, cleanUpTemp, tempDir } from "./helpers.js";

afterAll(cleanUpTemp);

function encryptedDatabase(): { file: string; key: string } {
  const file = path.join(tempDir("vault"), "books.db");
  const key = generateKeyHex();
  const database = openEncrypted(file, key);
  database.exec("CREATE TABLE note (text TEXT); INSERT INTO note VALUES ('બેટાવાડાના મુવાડા 12998')");
  database.close();
  return { file, key };
}

describe("keys", () => {
  it("are 256 random bits in lowercase hex", () => {
    const key = generateKeyHex();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(generateKeyHex()).not.toBe(key);
  });

  it("refuse anything that could smuggle SQL into the PRAGMA", () => {
    expect(() => assertKeyHex("x'; DROP TABLE School; --")).toThrow(VaultError);
    expect(() => assertKeyHex("AB".repeat(32))).toThrow(VaultError);
  });

  it("have a fingerprint that depends on the school and does not contain the key", () => {
    const key = generateKeyHex();
    const a = keyFingerprint(key, "11111111-1111-4111-8111-111111111111");
    const b = keyFingerprint(key, "22222222-2222-4222-8222-222222222222");
    expect(a).not.toBe(b);
    expect(key).not.toContain(a);
  });
});

describe("an encrypted database", () => {
  it("has no readable header and none of its contents in the file", () => {
    const { file } = encryptedDatabase();
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 15).toString("latin1")).not.toBe("SQLite format 3");
    expect(bytes.includes(Buffer.from("12998"))).toBe(false);
    expect(bytes.includes(Buffer.from("મુવાડા"))).toBe(false);
  });

  it("opens with its key", () => {
    const { file, key } = encryptedDatabase();
    const database = openEncrypted(file, key);
    expect(database.prepare("SELECT text FROM note").get()).toEqual({ text: "બેટાવાડાના મુવાડા 12998" });
    database.close();
  });

  it("refuses a wrong key as a VaultError, not a crash later", () => {
    const { file } = encryptedDatabase();
    expect(() => openEncrypted(file, generateKeyHex())).toThrow(VaultError);
  });

  it("is not readable as a plain SQLite file", () => {
    const { file } = encryptedDatabase();
    expect(isPlainDatabase(file)).toBe(false);
    const plain = new Database(file);
    expect(() => plain.prepare("SELECT * FROM note").all()).toThrow();
    plain.close();
  });
});

describe("copies", () => {
  it("a snapshot is encrypted with the same key", () => {
    const { file, key } = encryptedDatabase();
    const copy = path.join(path.dirname(file), "copy.db");
    snapshotInto(file, key, copy);
    expect(isPlainDatabase(copy)).toBe(false);
    expect(readFileSync(copy).includes(Buffer.from("12998"))).toBe(false);
    const database = openEncrypted(copy, key);
    expect(database.prepare("SELECT count(*) AS n FROM note").get()).toEqual({ n: 1 });
    database.close();
  });

  it("encryptCopy turns plain books into encrypted ones and leaves the original alone", () => {
    const dir = tempDir("vault-plain");
    const plain = path.join(dir, "old.db");
    copyFileSync(DEV_DB, plain);
    const before = readFileSync(plain);
    const encrypted = path.join(dir, "books.db");
    const key = generateKeyHex();

    encryptCopy(plain, encrypted, key);

    expect(isPlainDatabase(encrypted)).toBe(false);
    expect(readFileSync(plain).equals(before)).toBe(true);
    const database = openEncrypted(encrypted, key);
    expect(database.prepare("SELECT count(*) AS n FROM Bill").get()).toEqual({ n: 41 });
    expect(database.pragma("journal_mode", { simple: true })).toBe("delete");
    database.close();
  });
});

describe("the application reads encrypted books through Prisma", () => {
  it("migrates, sets up and reports on an encrypted file", async () => {
    const dir = tempDir("vault-prisma");
    const plain = path.join(dir, "old.db");
    copyFileSync(DEV_DB, plain);
    const file = path.join(dir, "books.db");
    const key = generateKeyHex();
    encryptCopy(plain, file, key);
    runMigrations(file, MIGRATIONS, { keyHex: key });

    const prisma = createPrismaClient({ file, keyHex: key });
    try {
      const year = await prisma.financialYear.findFirstOrThrow({ where: { label: "2025-26" } });
      const report = await new AccountsService(prisma, year.id).getAnnexure10();
      // expected_results.annexure_10_totals in the sample JSON, in paise.
      expect(report.totals.openingPaise).toBe(1299800);
      expect(report.totals.spentPaise).toBe(3976300);
      expect(report.totals.closingPaise).toBe(15400);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("a Prisma client without the key cannot read it", async () => {
    const { file } = encryptedDatabase();
    const prisma = createPrismaClient({ file });
    await expect(prisma.$queryRawUnsafe("SELECT * FROM note")).rejects.toThrow();
    await prisma.$disconnect();
  });
});
