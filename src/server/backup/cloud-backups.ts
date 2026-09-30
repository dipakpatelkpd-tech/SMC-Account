/**
 * Sending the open school's books to the cloud, so a lost or broken pen drive
 * never means lost books.
 *
 * What a backup is: a consistent snapshot of the encrypted database file
 * (VACUUM INTO, src/server/vault.ts), uploaded as-is. The cloud stores
 * ciphertext; it never sees a school's figures.
 *
 * When:
 *   - a few minutes after the last change (QUIET_MS), so a burst of data entry
 *     becomes one backup rather than forty;
 *   - but not more often than MIN_INTERVAL_MS, to keep storage use sensible;
 *   - when the school is closed or the app quits, if anything is still owed;
 *   - whenever the user presses "Backup now".
 *
 * Offline, nothing is lost: the fact that a backup is owed is written to the
 * school folder (sync.json), so it survives the app closing and travels on the
 * pen drive - the next PC with internet sends it.
 *
 * Backups are only ever added. Neither the app nor the cloud's rules allow one
 * to be changed or deleted, so a mistake or a stolen password cannot erase the
 * history.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Account } from "../cloud/account.js";
import { sha256 } from "../cloud/checksum.js";
import { CloudError, type CloudBackup } from "../cloud/types.js";
import { booksFile, readSyncState, writeSyncState, type SyncState } from "../profiles/data-folder.js";
import { snapshotInto } from "../vault.js";

export const QUIET_MS = 3 * 60 * 1000;
export const MIN_INTERVAL_MS = 20 * 60 * 1000;
export const RETRY_MS = 5 * 60 * 1000;

export interface BackupTarget {
  folder: string;
  profileId: string;
  keyHex: string;
  schemaVersion: string;
}

export type BackupState =
  | "upToDate"
  | "pending"
  | "uploading"
  | "offline"
  | "failed"
  | "signedOut"
  | "never";

export interface BackupStatus {
  state: BackupState;
  pendingSince: string | null;
  lastBackupAt: string | null;
  lastBackupDevice: string | null;
  /** Why the last attempt failed, in English, for the log and the detail line. */
  lastError: string | null;
}

export interface Timers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const REAL_TIMERS: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export class CloudBackups {
  private target: BackupTarget | null = null;
  private sync: SyncState = { pendingSince: null, lastCloudBackup: null };
  private timer: unknown = null;
  private running: Promise<CloudBackup | null> | null = null;
  private changes = 0;
  private lastChangeAt = 0;
  private lastUploadAt = 0;
  private lastError: string | null = null;
  private offline = false;
  private signedOut = false;

  constructor(
    private readonly account: Account,
    private readonly identity: { appVersion: string; deviceName: string },
    private readonly timers: Timers = REAL_TIMERS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Start looking after a school that has just been opened. */
  attach(target: BackupTarget): void {
    this.detach();
    this.target = target;
    this.sync = readSyncState(target.folder);
    this.lastError = null;
    this.offline = false;
    this.signedOut = false;
    // Owed from last time - perhaps from another PC that had no internet.
    // Send it soon, but let the school finish opening first.
    if (this.sync.pendingSince) this.schedule(30_000);
  }

  /** Stop, without sending anything. `flush` first if a backup is owed. */
  detach(): void {
    this.cancel();
    this.target = null;
  }

  /** The books changed. Called after every successful write. */
  markChanged(): void {
    const target = this.target;
    if (!target) return;
    this.changes += 1;
    this.lastChangeAt = this.now();
    if (!this.sync.pendingSince) {
      this.sync = { ...this.sync, pendingSince: new Date(this.lastChangeAt).toISOString() };
      this.persist();
    }
    const quietUntil = this.lastChangeAt + QUIET_MS;
    const allowedAt = this.lastUploadAt + MIN_INTERVAL_MS;
    this.schedule(Math.max(quietUntil, allowedAt) - this.now());
  }

  /** "Backup now": send immediately, whether or not anything changed. */
  backupNow(): Promise<CloudBackup | null> {
    return this.run(true);
  }

  /**
   * Before closing the school or quitting: send what is owed, but give up after
   * `timeoutMs` - nobody should wait at a closing app for a slow connection.
   * Whatever was not sent stays owed in sync.json and goes next time.
   */
  async flush(timeoutMs: number): Promise<void> {
    if (!this.target || !this.sync.pendingSince) return;
    let timeout: unknown = null;
    await Promise.race([
      this.run(false).catch(() => null),
      new Promise<void>((resolve) => {
        timeout = this.timers.set(resolve, timeoutMs);
      }),
    ]);
    if (timeout) this.timers.clear(timeout);
  }

  status(): BackupStatus {
    const last = this.sync.lastCloudBackup;
    const base = {
      pendingSince: this.sync.pendingSince,
      lastBackupAt: last?.at ?? null,
      lastBackupDevice: last?.deviceName ?? null,
      lastError: this.lastError,
    };
    let state: BackupState;
    if (this.running) state = "uploading";
    else if (this.signedOut) state = "signedOut";
    else if (this.sync.pendingSince && this.offline) state = "offline";
    else if (this.sync.pendingSince && this.lastError) state = "failed";
    else if (this.sync.pendingSince) state = "pending";
    else if (last) state = "upToDate";
    else state = "never";
    return { state, ...base };
  }

  // ------------------------------------------------------------- plumbing

  private run(always: boolean): Promise<CloudBackup | null> {
    if (this.running) return this.running;
    const target = this.target;
    if (!target) return Promise.resolve(null);
    if (!always && !this.sync.pendingSince) return Promise.resolve(null);

    this.cancel();
    const changesAtStart = this.changes;
    this.running = this.upload(target)
      .then((backup) => {
        this.lastUploadAt = this.now();
        this.lastError = null;
        this.offline = false;
        if (this.target === target) {
          // A change made while uploading is not in this backup: still owed.
          const changedMeanwhile = this.changes !== changesAtStart;
          this.sync = {
            pendingSince: changedMeanwhile ? new Date(this.lastChangeAt).toISOString() : null,
            lastCloudBackup: { id: backup.id, at: backup.createdAt, deviceName: backup.deviceName },
          };
          this.persist();
          if (changedMeanwhile) this.schedule(MIN_INTERVAL_MS);
        }
        return backup;
      })
      .catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.offline = error instanceof CloudError && error.code === "offline";
        this.signedOut = error instanceof CloudError && error.code === "session-expired";
        if (this.target === target && !this.signedOut) this.schedule(RETRY_MS);
        throw error;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async upload(target: BackupTarget): Promise<CloudBackup> {
    // The snapshot is still encrypted, so the system temp folder is fine.
    const temporary = path.join(os.tmpdir(), `smc-backup-${randomUUID()}.db`);
    try {
      snapshotInto(booksFile(target.folder), target.keyHex, temporary);
      const bytes = new Uint8Array(readFileSync(temporary));
      return await this.account.withSession((session) =>
        this.account.backend.uploadBackup(session, {
          profileId: target.profileId,
          bytes,
          sha256: sha256(bytes),
          appVersion: this.identity.appVersion,
          schemaVersion: target.schemaVersion,
          deviceName: this.identity.deviceName,
        }),
      );
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  private schedule(ms: number): void {
    this.cancel();
    this.timer = this.timers.set(
      () => {
        this.timer = null;
        void this.run(false).catch(() => undefined);
      },
      Math.max(0, ms),
    );
  }

  private cancel(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  private persist(): void {
    if (!this.target) return;
    try {
      writeSyncState(this.target.folder, this.sync);
    } catch {
      // The pen drive was pulled out. The data-folder watcher deals with that;
      // the in-memory state still says a backup is owed.
    }
  }
}
