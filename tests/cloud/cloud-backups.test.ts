/**
 * When cloud backups are sent, and what happens when they cannot be.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { runMigrations } from "../../electron/migrate.js";
import { CloudBackups, MIN_INTERVAL_MS, QUIET_MS, RETRY_MS } from "../../src/server/backup/cloud-backups.js";
import { Account, PLAIN_BOX } from "../../src/server/cloud/account.js";
import { FakeCloud } from "../../src/server/cloud/fake.js";
import { booksFile, readSyncState, writeSyncState } from "../../src/server/profiles/data-folder.js";
import { generateKeyHex, openEncrypted } from "../../src/server/vault.js";
import { MIGRATIONS, ManualTimers, cleanUpTemp, tempDir } from "./helpers.js";
import { writeFileSync } from "node:fs";

afterAll(cleanUpTemp);

const PROFILE = "5f8a1f2e-0000-4000-8000-00000000000a";

async function world() {
  const timers = new ManualTimers();
  let offline = false;
  const codes: string[] = [];
  const cloud = new FakeCloud({
    dir: tempDir("cloud"),
    isOffline: () => offline,
    onCode: (_e, code) => codes.push(code),
    now: timers.clock,
  });
  const account = new Account(cloud, tempDir("pc"), PLAIN_BOX, timers.clock);
  await account.signUp("head@school.in", "correct horse 1");
  await account.verifySignUp("head@school.in", codes.at(-1)!);

  const keyHex = generateKeyHex();
  await account.withSession((s) => cloud.createProfile(s, { id: PROFILE, schoolNameGu: "શાળા", diseCode: "1", keyHex }));
  const folder = tempDir("school");
  writeFileSync(path.join(folder, "profile.json"), "{}");
  runMigrations(booksFile(folder), MIGRATIONS, { keyHex });

  const backups = new CloudBackups(account, { appVersion: "0.2.0", deviceName: "OFFICE-PC" }, timers, timers.clock);
  const target = { folder, profileId: PROFILE, keyHex, schemaVersion: "0001_init" };
  const list = () => account.withSession((s) => cloud.listBackups(s, PROFILE));
  const settle = () => vi.waitFor(() => expect(backups.status().state).not.toBe("uploading"));
  return { timers, cloud, account, backups, target, folder, keyHex, list, settle, setOffline: (v: boolean) => (offline = v) };
}

describe("automatic backups", () => {
  it("wait for a quiet spell after the last change, then send one backup", async () => {
    const w = await world();
    w.backups.attach(w.target);
    w.backups.markChanged();
    w.timers.advance(60_000);
    w.backups.markChanged();
    expect(w.backups.status().state).toBe("pending");

    w.timers.advance(QUIET_MS - 1000);
    expect(await w.list()).toHaveLength(0);
    w.timers.advance(1000);
    await w.settle();

    expect(await w.list()).toHaveLength(1);
    expect(w.backups.status().state).toBe("upToDate");
    expect(readSyncState(w.folder).pendingSince).toBeNull();
  });

  it("upload the encrypted file, never the plain figures", async () => {
    const w = await world();
    w.backups.attach(w.target);
    await w.backups.backupNow();
    const [backup] = await w.list();
    const bytes = await w.account.withSession((s) => w.cloud.downloadBackup(s, backup!));
    expect(Buffer.from(bytes).subarray(0, 15).toString("latin1")).not.toBe("SQLite format 3");
    const restored = path.join(tempDir("restore"), "books.db");
    writeFileSync(restored, bytes);
    openEncrypted(restored, w.keyHex).close();
  });

  it("are not sent more often than the minimum interval", async () => {
    const w = await world();
    w.backups.attach(w.target);
    await w.backups.backupNow();
    w.backups.markChanged();
    w.timers.advance(QUIET_MS);
    expect(await w.list()).toHaveLength(1);
    w.timers.advance(MIN_INTERVAL_MS);
    await w.settle();
    expect(await w.list()).toHaveLength(2);
  });
});

describe("without internet", () => {
  it("keep the backup owed, on the school folder, and try again later", async () => {
    const w = await world();
    w.backups.attach(w.target);
    w.setOffline(true);
    w.backups.markChanged();
    w.timers.advance(QUIET_MS);
    await w.settle();
    expect(w.backups.status().state).toBe("offline");
    expect(readSyncState(w.folder).pendingSince).not.toBeNull();

    w.setOffline(false);
    w.timers.advance(RETRY_MS);
    await w.settle();
    expect(w.backups.status().state).toBe("upToDate");
    expect(await w.list()).toHaveLength(1);
  });

  it("send what another PC still owed as soon as a school opens", async () => {
    const w = await world();
    writeSyncState(w.folder, { pendingSince: "2026-05-30T09:00:00.000Z", lastCloudBackup: null });
    w.backups.attach(w.target);
    expect(w.backups.status().state).toBe("pending");
    w.timers.advance(30_000);
    await w.settle();
    expect(await w.list()).toHaveLength(1);
  });
});

describe("closing", () => {
  it("sends what is owed before the school closes", async () => {
    const w = await world();
    w.backups.attach(w.target);
    w.backups.markChanged();
    await w.backups.flush(10_000);
    expect(await w.list()).toHaveLength(1);
    expect(readSyncState(w.folder).pendingSince).toBeNull();
  });

  it("does nothing when nothing changed", async () => {
    const w = await world();
    w.backups.attach(w.target);
    await w.backups.flush(10_000);
    expect(await w.list()).toHaveLength(0);
  });
});
