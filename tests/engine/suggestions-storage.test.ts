/**
 * Suggestions in the school's books.
 *
 * Runs on copies of the sample year's database. What is checked is what the
 * school relies on: suggestions saved in one copy of the books come back in
 * another (the pen drive on a different PC); two schools' lists join; a value
 * forgotten in one stays forgotten in the next; and syncing when nothing
 * changed writes nothing to the drive.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { runMigrations } from "../../electron/migrate.js";
import { AccountsService } from "../../src/server/accounts-service.js";
import { API_METHODS, MUTATING_METHODS } from "../../src/shared/api.js";
import type { SuggestionRow } from "../../src/shared/suggestions.js";

const DIR = mkdtempSync(path.join(os.tmpdir(), "smc-suggest-"));
const opened: PrismaClient[] = [];

/** A school's books: a copy of the sample database, migrated as on opening. */
async function books(name: string): Promise<{ file: string; prisma: PrismaClient; service: AccountsService }> {
  const file = path.join(DIR, `${name}.db`);
  copyFileSync(path.join(process.cwd(), "prisma", "dev.db"), file);
  return open(file);
}

async function open(file: string) {
  runMigrations(file, path.join(process.cwd(), "prisma", "migrations"));
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) });
  opened.push(prisma);
  const year = await prisma.financialYear.findFirstOrThrow({ orderBy: { label: "desc" } });
  return { file, prisma, service: new AccountsService(prisma, year.id) };
}

const row = (field: string, value: string, count: number, last: number, removed?: number): SuggestionRow => ({
  field,
  value,
  count,
  last,
  ...(removed === undefined ? {} : { removed }),
});
const NOW = Date.now();
const values = (rows: SuggestionRow[]) => rows.filter((r) => r.removed === undefined).map((r) => r.value).sort();

afterAll(async () => {
  for (const prisma of opened) await prisma.$disconnect();
  rmSync(DIR, { recursive: true, force: true });
});

describe("suggestions in the books", () => {
  it("has a Suggestion table after migrating", async () => {
    const { prisma } = await books("table");
    expect(await prisma.suggestion.count()).toBe(0);
  });

  it("saves what it is given and returns it", async () => {
    const { service } = await books("save");
    const merged = await service.syncSuggestions([row("vendor.name", "શ્રી રામ સ્ટેશનરી", 2, NOW)]);
    expect(merged).toEqual([row("vendor.name", "શ્રી રામ સ્ટેશનરી", 2, NOW)]);
    expect(await service.syncSuggestions([])).toEqual(merged);
  });

  it("carries them to another PC with the pen drive", async () => {
    const first = await books("drive");
    await first.service.syncSuggestions([row("bank.name", "Bank of Baroda", 3, NOW), row("vendor.name", "Jay Ambe", 1, NOW)]);
    await first.prisma.$disconnect();

    // The same file, opened somewhere else with nothing typed there yet.
    const elsewhere = path.join(DIR, "other-pc.db");
    copyFileSync(first.file, elsewhere);
    const other = await open(elsewhere);
    expect(values(await other.service.syncSuggestions([]))).toEqual(["Bank of Baroda", "Jay Ambe"]);
  });

  it("joins the lists of two schools", async () => {
    const a = await books("school-a");
    const b = await books("school-b");
    await a.service.syncSuggestions([row("vendor.name", "Ram Stationery", 1, NOW)]);
    await b.service.syncSuggestions([row("vendor.name", "Jay Ambe", 1, NOW)]);
    // School A is opened, then school B: the app carries A's list into B.
    const heldByApp = await a.service.syncSuggestions([]);
    expect(values(await b.service.syncSuggestions(heldByApp))).toEqual(["Jay Ambe", "Ram Stationery"]);
  });

  it("keeps a forgotten value forgotten in the next school", async () => {
    const a = await books("forget-a");
    const b = await books("forget-b");
    await b.service.syncSuggestions([row("vendor.name", "typo", 1, NOW - 5000)]);
    const merged = await a.service.syncSuggestions([row("vendor.name", "typo", 1, NOW - 5000, NOW - 1000)]);
    expect(values(merged)).toEqual([]);
    expect(values(await b.service.syncSuggestions(merged))).toEqual([]);
  });

  it("drops invalid rows instead of failing", async () => {
    const { service } = await books("invalid");
    const merged = await service.syncSuggestions([
      row("f", "fine", 1, NOW),
      { field: "", value: "bad", count: 1, last: 1 },
      "junk" as unknown as SuggestionRow,
    ]);
    expect(values(merged)).toEqual(["fine"]);
  });

  it("writes nothing when nothing changed", async () => {
    const { service, prisma } = await books("quiet");
    await service.syncSuggestions([row("f", "a", 1, NOW)]);
    const before = await prisma.suggestion.findMany();
    await service.syncSuggestions([row("f", "a", 1, NOW)]);
    const after = await prisma.suggestion.findMany();
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id)); // not deleted and recreated
  });

  it("is not an accounts write, so it does not owe a backup on every keystroke", () => {
    expect(API_METHODS).toContain("syncSuggestions");
    expect(MUTATING_METHODS as readonly string[]).not.toContain("syncSuggestions");
  });
});
