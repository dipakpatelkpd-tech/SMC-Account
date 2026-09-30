/**
 * One school's data folder - the thing that travels on the pen drive.
 *
 * Like a Tally company folder: the software is installed on every PC, the data
 * is a folder the user chose, and moving the pen drive moves the books.
 *
 *   <the folder the user picked>\
 *     SMC Accounts\                     created by the app
 *       24160203401\                    one folder per school (its DISE code)
 *         profile.json                  which school, which account - not secret
 *         books.db                      the books, encrypted (src/server/vault.ts)
 *         backups\                      the last few copies, also encrypted
 *         sync.json                     is a cloud backup still owed?
 *         books.lock                    present while a PC has it open
 *
 * Only profile.json is readable without the key, and it holds nothing a DISE
 * lookup would not: the school's name and code, and which account owns it.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { CIPHER, keyFingerprint, snapshotInto } from "../vault.js";
import { readJson, writeJsonAtomic } from "./json-file.js";

export const DATA_DIR_NAME = "SMC Accounts";
export const MANIFEST_FILE = "profile.json";
export const BOOKS_FILE = "books.db";
export const BACKUPS_DIR = "backups";
export const SYNC_FILE = "sync.json";
export const LOCK_FILE = "books.lock";

/** How many local copies each school folder keeps. */
export const LOCAL_BACKUPS_KEPT = 10;

// ----------------------------------------------------------------- manifest

export const manifestSchema = z.object({
  format: z.literal("smc-accounts-profile"),
  formatVersion: z.literal(1),
  profileId: z.string().uuid(),
  ownerUserId: z.string().min(1),
  schoolNameGu: z.string(),
  diseCode: z.string(),
  cipher: z.literal(CIPHER),
  /** HMAC of the key: tells a wrong key from a damaged file. Not the key. */
  keyFingerprint: z.string().regex(/^[0-9a-f]{32}$/),
  createdAt: z.string(),
});
export type Manifest = z.infer<typeof manifestSchema>;

export function newManifest(input: {
  profileId?: string;
  ownerUserId: string;
  schoolNameGu: string;
  diseCode: string;
  keyHex: string;
  createdAt?: string;
}): Manifest {
  const profileId = input.profileId ?? randomUUID();
  return {
    format: "smc-accounts-profile",
    formatVersion: 1,
    profileId,
    ownerUserId: input.ownerUserId,
    schoolNameGu: input.schoolNameGu,
    diseCode: input.diseCode,
    cipher: CIPHER,
    keyFingerprint: keyFingerprint(input.keyHex, profileId),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function readManifest(folder: string): Manifest | null {
  return readJson(path.join(folder, MANIFEST_FILE), manifestSchema);
}

export function writeManifest(folder: string, manifest: Manifest): void {
  writeJsonAtomic(path.join(folder, MANIFEST_FILE), manifest);
}

export function booksFile(folder: string): string {
  return path.join(folder, BOOKS_FILE);
}

/** Does this key belong to this school? Checked before any cached key is used. */
export function keyMatches(manifest: Manifest, keyHex: string): boolean {
  try {
    return keyFingerprint(keyHex, manifest.profileId) === manifest.keyFingerprint;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ creating one

/**
 * Where a new school's folder goes inside the location the user picked.
 *
 * Picking a drive root, or any folder, gets an "SMC Accounts" folder made in
 * it; picking an existing "SMC Accounts" folder does not nest a second one.
 * The school folder is named after the DISE code - Latin, unique, and what
 * anybody looking at the pen drive would recognise.
 */
export function folderForNewSchool(chosen: string, diseCode: string): string {
  const base =
    path.basename(chosen).toLowerCase() === DATA_DIR_NAME.toLowerCase()
      ? chosen
      : path.join(chosen, DATA_DIR_NAME);
  const name = safeFolderName(diseCode) || "school";
  let candidate = path.join(base, name);
  for (let n = 2; existsSync(candidate); n += 1) candidate = path.join(base, `${name}-${n}`);
  return candidate;
}

function safeFolderName(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[. ]+$/, "")
    .slice(0, 60);
}

/** Can the app write here? Checked before anything is created. */
export function isWritableLocation(dir: string): boolean {
  try {
    if (!statSync(dir).isDirectory()) return false;
    const probe = path.join(dir, `.smc-write-test-${process.pid}`);
    writeJsonAtomic(probe, {});
    rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ finding them

export interface FoundProfile {
  folder: string;
  manifest: Manifest;
}

/**
 * Every school folder at or just below `dir`.
 *
 * The user may pick the school folder itself, the "SMC Accounts" folder, or
 * the drive it is on - all three find it. Deeper than that is not searched: a
 * pen drive root with thousands of photos should not take a minute to open.
 */
export function findProfilesIn(dir: string): FoundProfile[] {
  const found = new Map<string, FoundProfile>();
  const consider = (folder: string): void => {
    const manifest = readManifest(folder);
    if (manifest && !found.has(folder)) found.set(folder, { folder, manifest });
  };

  consider(dir);
  for (const child of subfolders(dir)) {
    consider(child);
    if (path.basename(child).toLowerCase() === DATA_DIR_NAME.toLowerCase()) {
      for (const school of subfolders(child)) consider(school);
    }
  }
  return [...found.values()];
}

function subfolders(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

// --------------------------------------------------------------- the lock

export const lockSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  pid: z.number(),
  openedAt: z.string(),
});
export type LockInfo = z.infer<typeof lockSchema>;

export interface Device {
  id: string;
  name: string;
}

/**
 * Mark the folder as open on this PC.
 *
 * Advisory, on purpose. People pull the pen drive out without closing the app,
 * so a lock left by another PC is normal and usually stale: the caller shows who
 * holds it and lets the user open anyway. A lock left by THIS PC is always
 * stale - the app allows one running copy per PC - and is simply taken over.
 */
export function acquireLock(
  folder: string,
  device: Device,
  options: { force?: boolean } = {},
): { ok: true } | { ok: false; holder: LockInfo } {
  const file = path.join(folder, LOCK_FILE);
  const holder = readJson(file, lockSchema);
  if (holder && holder.deviceId !== device.id && !options.force) return { ok: false, holder };
  writeJsonAtomic(file, {
    deviceId: device.id,
    deviceName: device.name,
    pid: process.pid,
    openedAt: new Date().toISOString(),
  } satisfies LockInfo);
  return { ok: true };
}

/** Remove the lock, but only if it is still ours. */
export function releaseLock(folder: string, device: Device): void {
  const file = path.join(folder, LOCK_FILE);
  const holder = readJson(file, lockSchema);
  if (holder && holder.deviceId === device.id) rmSync(file, { force: true });
}

// ------------------------------------------------------------ sync state

/**
 * Whether the cloud still owes this school a backup.
 *
 * Kept in the school folder, not on the PC, so it travels with the data: books
 * changed on an offline PC are backed up by the next PC that has internet.
 */
export const syncStateSchema = z.object({
  /** When the first change not yet in the cloud was made; null when none. */
  pendingSince: z.string().nullable(),
  lastCloudBackup: z
    .object({ id: z.string(), at: z.string(), deviceName: z.string() })
    .nullable(),
});
export type SyncState = z.infer<typeof syncStateSchema>;

export function readSyncState(folder: string): SyncState {
  return (
    readJson(path.join(folder, SYNC_FILE), syncStateSchema) ?? {
      pendingSince: null,
      lastCloudBackup: null,
    }
  );
}

export function writeSyncState(folder: string, state: SyncState): void {
  writeJsonAtomic(path.join(folder, SYNC_FILE), state);
}

// ------------------------------------------------------- local backups

/**
 * Copy the books into backups\, keeping the newest LOCAL_BACKUPS_KEPT.
 *
 * Taken every time a school is opened, and before a restore replaces the
 * books. Encrypted like the original.
 */
export function takeLocalBackup(folder: string, keyHex: string, reason: string): string | null {
  const source = booksFile(folder);
  if (!existsSync(source)) return null;
  const dir = path.join(folder, BACKUPS_DIR);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const destination = path.join(dir, `books-${stamp}-${reason}.db`);
  snapshotInto(source, keyHex, destination);
  pruneLocalBackups(dir);
  return destination;
}

export function listLocalBackups(folder: string): string[] {
  const dir = path.join(folder, BACKUPS_DIR);
  try {
    return readdirSync(dir)
      .filter((name) => name.startsWith("books-") && name.endsWith(".db"))
      .sort()
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function pruneLocalBackups(dir: string): void {
  const all = listLocalBackups(path.dirname(dir));
  for (const old of all.slice(0, Math.max(0, all.length - LOCAL_BACKUPS_KEPT))) {
    rmSync(old, { force: true });
  }
}
