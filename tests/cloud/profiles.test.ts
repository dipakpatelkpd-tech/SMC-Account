/**
 * A school's data folder: what is in it, how it is found again, and the lock.
 */
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { NewerDataError, runMigrations } from "../../electron/migrate.js";
import {
  acquireLock,
  booksFile,
  DATA_DIR_NAME,
  findProfilesIn,
  folderForNewSchool,
  keyMatches,
  listLocalBackups,
  LOCAL_BACKUPS_KEPT,
  newManifest,
  readManifest,
  readSyncState,
  releaseLock,
  takeLocalBackup,
  writeManifest,
  writeSyncState,
} from "../../src/server/profiles/data-folder.js";
import { KnownProfiles } from "../../src/server/profiles/known-profiles.js";
import { locateProfile, splitDriveRoot } from "../../src/server/profiles/locate.js";
import { generateKeyHex, openEncrypted } from "../../src/server/vault.js";
import { MIGRATIONS, cleanUpTemp, tempDir } from "./helpers.js";

afterAll(cleanUpTemp);

function school(location: string, diseCode = "24160203401") {
  const key = generateKeyHex();
  const folder = folderForNewSchool(location, diseCode);
  const manifest = newManifest({ ownerUserId: "user-1", schoolNameGu: "પરીક્ષા શાળા", diseCode, keyHex: key });
  writeManifest(folder, manifest);
  runMigrations(booksFile(folder), MIGRATIONS, { keyHex: key });
  return { folder, manifest, key };
}

describe("where a new school's folder goes", () => {
  it("in an SMC Accounts folder inside the chosen location, named by DISE code", () => {
    const drive = tempDir("drive");
    expect(folderForNewSchool(drive, "24160203401")).toBe(path.join(drive, DATA_DIR_NAME, "24160203401"));
  });

  it("does not nest a second SMC Accounts folder when that folder was picked", () => {
    const drive = tempDir("drive");
    const picked = path.join(drive, DATA_DIR_NAME);
    expect(folderForNewSchool(picked, "241")).toBe(path.join(picked, "241"));
  });

  it("never reuses an existing folder, and strips characters Windows refuses", () => {
    const drive = tempDir("drive");
    const first = folderForNewSchool(drive, "241");
    mkdirSync(first, { recursive: true });
    expect(folderForNewSchool(drive, "241")).toBe(`${first}-2`);
    expect(path.basename(folderForNewSchool(drive, 'a:b*c?"d'))).toBe("abcd");
  });
});

describe("the manifest", () => {
  it("round-trips and recognises its own key", () => {
    const { folder, manifest, key } = school(tempDir("drive"));
    expect(readManifest(folder)).toEqual(manifest);
    expect(keyMatches(manifest, key)).toBe(true);
    expect(keyMatches(manifest, generateKeyHex())).toBe(false);
  });

  it("does not contain the key", () => {
    const { folder, key } = school(tempDir("drive"));
    expect(JSON.stringify(readManifest(folder))).not.toContain(key);
  });

  it("is ignored when damaged rather than stopping anything", () => {
    const folder = tempDir("damaged");
    writeFileSync(path.join(folder, "profile.json"), "{ not json");
    expect(readManifest(folder)).toBeNull();
  });
});

describe("finding schools in a chosen folder", () => {
  it("finds a school from the drive, the SMC Accounts folder or its own folder", () => {
    const drive = tempDir("drive");
    const a = school(drive, "111");
    const b = school(drive, "222");
    const ids = (dir: string) => findProfilesIn(dir).map((item) => item.manifest.profileId).sort();
    const both = [a.manifest.profileId, b.manifest.profileId].sort();
    expect(ids(drive)).toEqual(both);
    expect(ids(path.join(drive, DATA_DIR_NAME))).toEqual(both);
    expect(ids(a.folder)).toEqual([a.manifest.profileId]);
  });

  it("finds nothing in an unrelated folder", () => {
    expect(findProfilesIn(tempDir("photos"))).toEqual([]);
  });
});

describe("finding a school again on another drive", () => {
  it("splits Windows and Linux removable paths into drive and rest", () => {
    expect(splitDriveRoot("e:\\Work\\SMC Accounts\\241", "win32")).toEqual(["E:\\", "Work\\SMC Accounts\\241"]);
    expect(splitDriveRoot("/media/rahul/PEN/SMC Accounts/241", "posix")).toEqual([
      "/media/rahul/PEN",
      "SMC Accounts/241",
    ]);
    expect(splitDriveRoot("/home/rahul/books", "posix")).toBeNull();
  });

  it("finds it where it was", () => {
    const { folder, manifest } = school(tempDir("drive-e"));
    expect(locateProfile(manifest.profileId, folder, { platform: "posix", roots: [] })?.folder).toBe(folder);
  });

  it("finds it on whichever drive it is on now", () => {
    const driveE = tempDir("drive-e");
    const driveF = tempDir("drive-f");
    const { manifest, folder } = school(driveF);
    const remembered = path.join(driveE, DATA_DIR_NAME, "24160203401");
    const found = locateProfile(manifest.profileId, remembered, { platform: "posix", roots: [driveE, driveF] });
    expect(found?.folder).toBe(folder);
  });

  it("reports it missing when no drive has it", () => {
    const { manifest } = school(tempDir("drive"));
    expect(locateProfile(manifest.profileId, "/nowhere", { platform: "posix", roots: [tempDir("empty")] })).toBeNull();
  });
});

describe("the lock", () => {
  const pc1 = { id: "pc-1", name: "OFFICE-PC" };
  const pc2 = { id: "pc-2", name: "HOME-PC" };

  it("tells a second PC who has the books open", () => {
    const folder = tempDir("lock");
    expect(acquireLock(folder, pc1).ok).toBe(true);
    const second = acquireLock(folder, pc2);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.holder.deviceName).toBe("OFFICE-PC");
  });

  it("lets the same PC take over its own stale lock, and anyone force it", () => {
    const folder = tempDir("lock");
    acquireLock(folder, pc1);
    expect(acquireLock(folder, pc1).ok).toBe(true);
    expect(acquireLock(folder, pc2, { force: true }).ok).toBe(true);
  });

  it("is only released by the PC holding it", () => {
    const folder = tempDir("lock");
    acquireLock(folder, pc1);
    releaseLock(folder, pc2);
    expect(existsSync(path.join(folder, "books.lock"))).toBe(true);
    releaseLock(folder, pc1);
    expect(existsSync(path.join(folder, "books.lock"))).toBe(false);
  });
});

describe("local backups and the sync state", () => {
  it("keeps the newest copies, each still encrypted and readable", () => {
    const { folder, key } = school(tempDir("drive"));
    for (let n = 0; n < LOCAL_BACKUPS_KEPT + 3; n += 1) takeLocalBackup(folder, key, `t${String(n).padStart(2, "0")}`);
    const copies = listLocalBackups(folder);
    expect(copies.length).toBeLessThanOrEqual(LOCAL_BACKUPS_KEPT);
    const database = openEncrypted(copies.at(-1)!, key);
    expect(database.prepare("SELECT count(*) AS n FROM School").get()).toEqual({ n: 0 });
    database.close();
  });

  it("remembers a backup is owed across restarts", () => {
    const folder = tempDir("sync");
    expect(readSyncState(folder)).toEqual({ pendingSince: null, lastCloudBackup: null });
    writeSyncState(folder, { pendingSince: "2026-06-01T10:00:00.000Z", lastCloudBackup: null });
    expect(readSyncState(folder).pendingSince).toBe("2026-06-01T10:00:00.000Z");
  });
});

describe("migrations and versions", () => {
  it("keep a school's books a single file on the drive", () => {
    const { folder, key } = school(tempDir("drive"));
    const database = openEncrypted(booksFile(folder), key);
    expect(database.pragma("journal_mode", { simple: true })).toBe("delete");
    database.close();
  });

  it("refuse books upgraded by a newer version of the app", () => {
    const { folder, key } = school(tempDir("drive"));
    const database = openEncrypted(booksFile(folder), key);
    database.prepare("INSERT INTO _smc_migrations (name, appliedAt) VALUES ('9999_future', '2030-01-01')").run();
    database.close();
    expect(() => runMigrations(booksFile(folder), MIGRATIONS, { keyHex: key })).toThrow(NewerDataError);
  });

  it("still build the plain development database the old way", () => {
    const file = path.join(tempDir("plain"), "dev.db");
    runMigrations(file, MIGRATIONS);
    const database = new Database(file);
    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    database.close();
  });
});

describe("this PC's list of schools", () => {
  it("shows each account only its own schools, most recent first", () => {
    const known = new KnownProfiles(tempDir("pc"));
    const base = { schoolNameGu: "શાળા", diseCode: "1", folder: "/x" };
    known.remember({ ...base, profileId: "a", ownerUserId: "u1", lastOpenedAt: "2026-01-01" });
    known.remember({ ...base, profileId: "b", ownerUserId: "u1", lastOpenedAt: "2026-02-01" });
    known.remember({ ...base, profileId: "c", ownerUserId: "u2", lastOpenedAt: "2026-03-01" });
    expect(known.list("u1").map((item) => item.profileId)).toEqual(["b", "a"]);
    known.forget("b");
    expect(known.list("u1").map((item) => item.profileId)).toEqual(["a"]);
  });
});
