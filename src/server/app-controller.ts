/**
 * The application around the books: who is signed in on this PC, which
 * school's data folder is open, and keeping its cloud backup current.
 *
 * The model is Tally's. The software is installed on every PC. A school's data
 * is a folder the user chose - usually on a pen drive - and moving the pen drive
 * moves the books. The only things the PCs share are the account and the
 * software; everything else about a school is in its folder
 * (src/server/profiles/data-folder.ts).
 *
 * This class knows nothing about Electron. The main process wires IPC and the
 * file dialogs to it, so all of this can be tested with the fake cloud and a
 * temporary folder standing in for the pen drive.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, renameSync, rmSync, rmdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { PrismaClient } from "@prisma/client";
import { runMigrations, NewerDataError } from "../../electron/migrate.js";
import type { Issue } from "../engine/validation.js";
import { createPrismaClient } from "../lib/db.js";
import type {
  ApiResult,
  AppStateDto,
  BackupStatusDto,
  CloudBackupDto,
  CloudInfoDto,
  FolderInspectionDto,
  OpenSchoolResultDto,
  SchoolListDto,
  SchoolListItemDto,
  SetupInput,
} from "../shared/api.js";
import { AccountsService } from "./accounts-service.js";
import { CloudBackups, type Timers } from "./backup/cloud-backups.js";
import { Account, type SecretBox } from "./cloud/account.js";
import { sha256 } from "./cloud/checksum.js";
import { CloudError, type CloudBackend, type CloudBackup, type CloudProfile } from "./cloud/types.js";
import {
  acquireLock,
  booksFile,
  DATA_DIR_NAME,
  findProfilesIn,
  folderForNewSchool,
  isWritableLocation,
  keyMatches,
  MANIFEST_FILE,
  newManifest,
  readManifest,
  releaseLock,
  takeLocalBackup,
  writeManifest,
  writeSyncState,
  type Device,
  type FoundProfile,
  type Manifest,
} from "./profiles/data-folder.js";
import { readJson, writeBytesAtomic, writeJsonAtomic } from "./profiles/json-file.js";
import { KnownProfiles } from "./profiles/known-profiles.js";
import { locateProfile, mountedRoots, type Platform } from "./profiles/locate.js";
import { SetupService, validateSetupInput } from "./setup-service.js";
import { encryptCopy, generateKeyHex, isPlainDatabase, openEncrypted, VaultError } from "./vault.js";
import { z } from "zod";

export interface ControllerOptions {
  /** This PC's own data folder (Electron's userData). Never the pen drive. */
  userDataDir: string;
  migrationsDir: string;
  cloud: { backend: CloudBackend; info: CloudInfoDto } | { unavailable: string };
  secretBox: SecretBox;
  appVersion: string;
  platform: Platform;
  /** The drives a pen drive could be on. Defaults to what is mounted now. */
  roots?: () => string[];
  /** Books from before schools had folders, to offer moving them into one. */
  legacyBooks?: { file: string; developmentCopy: boolean } | null;
  timers?: Timers;
  now?: () => number;
}

interface OpenSchool {
  profileId: string;
  folder: string;
  manifest: Manifest;
  keyHex: string;
  prisma: PrismaClient;
  setup: SetupService;
  books: AccountsService | null;
  yearLabel: string;
  schemaVersion: string;
}

/** How long closing a school waits for an owed backup before giving up. */
const CLOSE_FLUSH_MS = 10_000;

export class AppController {
  private readonly known: KnownProfiles;
  private readonly device: Device;
  private readonly account: Account | null;
  private readonly backups: CloudBackups | null;
  private current: OpenSchool | null = null;
  private dataMissing = false;

  constructor(private readonly options: ControllerOptions) {
    this.known = new KnownProfiles(options.userDataDir);
    this.device = loadDevice(options.userDataDir);
    if ("backend" in options.cloud) {
      this.account = new Account(options.cloud.backend, options.userDataDir, options.secretBox, options.now);
      this.backups = new CloudBackups(
        this.account,
        { appVersion: options.appVersion, deviceName: this.device.name },
        options.timers,
        options.now,
      );
    } else {
      this.account = null;
      this.backups = null;
    }
  }

  // ------------------------------------------------------------------ state

  getAppState(): AppStateDto {
    const cloud = this.options.cloud;
    if (!("backend" in cloud) || !this.account) {
      return { phase: "unavailable", reason: "unavailable" in cloud ? cloud.unavailable : "" };
    }
    const user = this.account.user;
    if (!user) return { phase: "signedOut", cloud: cloud.info };
    const current = this.current;
    if (!current) return { phase: "chooseSchool", cloud: cloud.info, user };
    const school = {
      profileId: current.profileId,
      schoolNameGu: current.manifest.schoolNameGu,
      diseCode: current.manifest.diseCode,
      folder: current.folder,
    };
    if (this.dataMissing) return { phase: "dataMissing", cloud: cloud.info, user, school };
    return { phase: "open", cloud: cloud.info, user, school, needsSetup: current.books === null };
  }

  /** The open school's books, or null when none is open or its drive is gone. */
  get books(): AccountsService | null {
    return this.dataMissing ? null : (this.current?.books ?? null);
  }

  get setup(): SetupService | null {
    return this.dataMissing ? null : (this.current?.setup ?? null);
  }

  get yearLabel(): string {
    return this.current?.yearLabel ?? "";
  }

  /** closeYear and openYear change which year is shown. */
  switchYear(yearId: number, label: string): void {
    const current = this.current;
    if (!current) throw new Error("no school is open");
    current.books = new AccountsService(current.prisma, yearId);
    current.yearLabel = label;
  }

  /** After setup filled an empty school database: bind its first year. */
  async afterSetup(): Promise<void> {
    const current = this.current;
    if (!current) return;
    const year = await latestYear(current.prisma);
    if (year) this.switchYear(year.id, year.label);
    await this.refreshManifest(current);
  }

  /** Every successful write to the books calls this. */
  onBooksChanged(): void {
    this.backups?.markChanged();
  }

  // ---------------------------------------------------------------- account

  async signIn(email: string, password: string): Promise<ApiResult<AppStateDto>> {
    return this.cloudCall(async (account) => {
      await account.signIn(email, password);
      return this.getAppState();
    });
  }

  async signUp(email: string, password: string): Promise<ApiResult<{ needsCode: boolean }>> {
    return this.cloudCall(async (account) => {
      const user = await account.signUp(email, password);
      return { needsCode: user === null };
    });
  }

  async verifySignUp(email: string, code: string): Promise<ApiResult<AppStateDto>> {
    return this.cloudCall(async (account) => {
      await account.verifySignUp(email, code);
      return this.getAppState();
    });
  }

  async requestPasswordReset(email: string): Promise<ApiResult<null>> {
    return this.cloudCall(async (account) => {
      await account.requestPasswordReset(email);
      return null;
    });
  }

  async completePasswordReset(email: string, code: string, password: string): Promise<ApiResult<AppStateDto>> {
    return this.cloudCall(async (account) => {
      await account.completePasswordReset(email, code, password);
      return this.getAppState();
    });
  }

  async signOut(): Promise<AppStateDto> {
    await this.closeSchool();
    await this.account?.signOut();
    return this.getAppState();
  }

  // ---------------------------------------------------------------- schools

  async listSchools(): Promise<SchoolListDto> {
    const account = this.account;
    const user = account?.user;
    if (!account || !user) return { schools: [], cloudReachable: false, legacyBooks: null };

    let inCloud: CloudProfile[] | null = null;
    try {
      inCloud = await account.withSession((session) => account.backend.listProfiles(session));
    } catch {
      // Offline, or the session ended (then the next state check shows the login).
    }

    const schools: SchoolListItemDto[] = [];
    for (const known of this.known.list(user.id)) {
      const found = this.locate(known.profileId);
      if (found && found.folder !== known.folder) {
        this.known.remember({ ...known, folder: found.folder });
      }
      schools.push({
        profileId: known.profileId,
        schoolNameGu: known.schoolNameGu,
        diseCode: known.diseCode,
        folder: found?.folder ?? known.folder,
        availability: found ? "ready" : "notConnected",
        lastOpenedAt: known.lastOpenedAt,
      });
    }
    for (const profile of inCloud ?? []) {
      if (schools.some((school) => school.profileId === profile.id)) continue;
      const found = this.locate(profile.id);
      schools.push({
        profileId: profile.id,
        schoolNameGu: profile.schoolNameGu,
        diseCode: profile.diseCode,
        folder: found?.folder ?? null,
        availability: found ? "ready" : "notOnThisPc",
        lastOpenedAt: null,
      });
    }

    const order = { ready: 0, notConnected: 1, notOnThisPc: 2 } as const;
    schools.sort(
      (a, b) =>
        order[a.availability] - order[b.availability] ||
        (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "") ||
        a.schoolNameGu.localeCompare(b.schoolNameGu),
    );

    return { schools, cloudReachable: inCloud !== null, legacyBooks: this.legacyBooks() };
  }

  inspectFolder(folder: string): ApiResult<FolderInspectionDto> {
    const user = this.account?.user;
    if (!user) return failure(ISSUES.notSignedIn());
    const found = findProfilesIn(folder);
    if (found.length === 0) return failure(ISSUES.noSchoolInFolder(folder));
    return {
      ok: true,
      data: {
        folder,
        schools: found.map(({ folder: at, manifest }) => ({
          profileId: manifest.profileId,
          schoolNameGu: manifest.schoolNameGu,
          diseCode: manifest.diseCode,
          folder: at,
          ownedByMe: manifest.ownerUserId === user.id,
        })),
      },
    };
  }

  /**
   * A new school: validate the form, build its encrypted database in a new
   * folder inside `location`, run setup, and only then register it (and its
   * key) with the account. If anything fails, the new folder is removed, so a
   * failed attempt leaves nothing behind - on the pen drive or in the cloud.
   */
  async createSchool(location: string, input: SetupInput): Promise<ApiResult<AppStateDto>> {
    const account = this.account;
    const user = account?.user;
    if (!account || !user) return failure(ISSUES.notSignedIn());

    const invalid = validateSetupInput(input);
    if (invalid) return invalid;
    if (!isWritableLocation(location)) return failure(ISSUES.notWritable(location));

    // Needs the internet anyway (the key must reach the account), so ask first:
    // it also catches creating the same school twice.
    let existing: CloudProfile[];
    try {
      existing = await account.withSession((session) => account.backend.listProfiles(session));
    } catch (error) {
      return failure(cloudIssue(error, "createSchool"));
    }
    const diseCode = input.school.diseCode.trim();
    if (existing.some((profile) => profile.diseCode === diseCode)) {
      return failure(ISSUES.schoolExists(diseCode));
    }

    await this.closeSchool();

    const profileId = randomUUID();
    const keyHex = generateKeyHex();
    const folder = folderForNewSchool(location, diseCode);
    const madeDataDir = !existsSync(path.dirname(folder));
    const manifest = newManifest({
      profileId,
      ownerUserId: user.id,
      schoolNameGu: input.school.nameGu.trim(),
      diseCode,
      keyHex,
    });

    try {
      writeManifest(folder, manifest);
      runMigrations(booksFile(folder), this.options.migrationsDir, { keyHex });
      const prisma = createPrismaClient({ file: booksFile(folder), keyHex });
      try {
        const result = await new SetupService(prisma).completeSetup(input);
        if (!result.ok) {
          removeNewFolder(folder, madeDataDir);
          return result;
        }
      } finally {
        await prisma.$disconnect();
      }
      await account.withSession((session) =>
        account.backend.createProfile(session, {
          id: profileId,
          schoolNameGu: manifest.schoolNameGu,
          diseCode,
          keyHex,
        }),
      );
      account.rememberKey(profileId, keyHex);
    } catch (error) {
      removeNewFolder(folder, madeDataDir);
      return failure(this.errorIssue(error, "createSchool"));
    }

    // A brand-new school owes its first backup straight away.
    writeSyncState(folder, { pendingSince: new Date(this.now()).toISOString(), lastCloudBackup: null });
    const opened = await this.openSchool(profileId, { folder });
    if (!opened.ok) return opened;
    return { ok: true, data: this.getAppState() };
  }

  /**
   * Open a school's books.
   *
   * The key comes from this PC's cache, or from the account once - which is why
   * opening a school on a PC for the first time needs the internet, and every
   * time after that does not.
   */
  async openSchool(
    profileId: string,
    options: { folder?: string; force?: boolean } = {},
  ): Promise<ApiResult<OpenSchoolResultDto>> {
    const account = this.account;
    const user = account?.user;
    if (!account || !user) return failure(ISSUES.notSignedIn());

    await this.closeSchool();

    const found = options.folder ? profileAt(options.folder, profileId) : this.locate(profileId);
    if (!found) return failure(ISSUES.notConnected());
    if (found.manifest.ownerUserId !== user.id) return failure(ISSUES.otherAccount());

    let keyHex: string;
    try {
      keyHex = await this.keyFor(found.manifest);
    } catch (error) {
      return failure(this.errorIssue(error, "openSchool"));
    }

    const lock = acquireLock(found.folder, this.device, { force: options.force });
    if (!lock.ok) {
      return {
        ok: true,
        data: { opened: false, lockedBy: { deviceName: lock.holder.deviceName, openedAt: lock.holder.openedAt } },
      };
    }

    try {
      await this.bind(found, keyHex);
    } catch (error) {
      releaseLock(found.folder, this.device);
      return failure(this.errorIssue(error, "openSchool"));
    }
    return { ok: true, data: { opened: true, state: this.getAppState() } };
  }

  /** Close the open school: send what backup is owed (briefly), then let go. */
  async closeSchool(flushMs = CLOSE_FLUSH_MS): Promise<AppStateDto> {
    const current = this.current;
    if (current) {
      if (!this.dataMissing) await this.backups?.flush(flushMs);
      this.backups?.detach();
      this.current = null;
      this.dataMissing = false;
      await current.prisma.$disconnect().catch(() => undefined);
      try {
        releaseLock(current.folder, this.device);
      } catch {
        // The drive is gone; its lock goes with it.
      }
    }
    return this.getAppState();
  }

  forgetSchool(profileId: string): Promise<SchoolListDto> {
    this.known.forget(profileId);
    return this.listSchools();
  }

  /**
   * Called every few seconds by the main process. When the open school's
   * folder disappears - the pen drive was pulled out - the books are closed at
   * once, so nothing tries to write to a drive that is not there.
   */
  checkDataPresent(): boolean {
    const current = this.current;
    if (!current || this.dataMissing) return !this.dataMissing;
    if (existsSync(path.join(current.folder, MANIFEST_FILE))) return true;
    this.dataMissing = true;
    this.backups?.detach();
    void current.prisma.$disconnect().catch(() => undefined);
    return false;
  }

  /** The pen drive is back - perhaps under another drive letter. */
  async reconnectSchool(): Promise<ApiResult<AppStateDto>> {
    const current = this.current;
    if (!current) return { ok: true, data: this.getAppState() };
    const profileId = current.profileId;
    this.current = null;
    this.dataMissing = false;
    await current.prisma.$disconnect().catch(() => undefined);

    const found = this.locate(profileId);
    if (!found) {
      // Still not there: go back to showing the "put the pen drive back" state.
      this.current = current;
      this.dataMissing = true;
      return failure(ISSUES.notConnected());
    }
    const opened = await this.openSchool(profileId, { folder: found.folder, force: true });
    if (!opened.ok) return opened;
    return { ok: true, data: this.getAppState() };
  }

  get dataFolder(): string | null {
    return this.current?.folder ?? null;
  }

  // ---------------------------------------------------------------- backups

  getBackupStatus(): BackupStatusDto {
    if (!this.current || !this.backups) {
      return { state: "never", pendingSince: null, lastBackupAt: null, lastBackupDevice: null, lastError: null };
    }
    return this.backups.status();
  }

  async backupNow(): Promise<ApiResult<BackupStatusDto>> {
    if (!this.current || this.dataMissing || !this.backups) return failure(ISSUES.noSchoolOpen());
    try {
      await this.backups.backupNow();
      return { ok: true, data: this.backups.status() };
    } catch (error) {
      return failure(this.errorIssue(error, "backupNow"));
    }
  }

  async listCloudBackups(profileId: string): Promise<ApiResult<CloudBackupDto[]>> {
    return this.cloudCall(async (account) => {
      const backups = await account.withSession((session) => account.backend.listBackups(session, profileId));
      return backups.map(toBackupDto);
    });
  }

  /**
   * Replace the open school's books with a cloud backup.
   *
   * The backup is downloaded, its checksum checked, and opened with the key
   * before anything is replaced; the current books are copied to backups\
   * first. So a restore can itself be undone from the local copies.
   */
  async restoreBackup(backupId: string): Promise<ApiResult<AppStateDto>> {
    const current = this.current;
    const account = this.account;
    if (!current || this.dataMissing || !account) return failure(ISSUES.noSchoolOpen());

    let bytes: Uint8Array;
    let backup: CloudBackup;
    try {
      ({ bytes, backup } = await this.download(current.profileId, backupId));
    } catch (error) {
      return failure(this.errorIssue(error, "restoreBackup"));
    }

    const staged = path.join(current.folder, "books.restore.tmp");
    try {
      writeBytesAtomic(staged, bytes);
      verifyBooks(staged, current.keyHex);
    } catch (error) {
      rmSync(staged, { force: true });
      return failure(this.errorIssue(error, "restoreBackup"));
    }

    const { profileId, folder } = current;
    this.backups?.detach();
    this.current = null;
    await current.prisma.$disconnect().catch(() => undefined);
    try {
      takeLocalBackup(folder, current.keyHex, "before-restore");
      renameSync(staged, booksFile(folder));
      // The books now equal a backup the cloud already has.
      writeSyncState(folder, {
        pendingSince: null,
        lastCloudBackup: { id: backup.id, at: backup.createdAt, deviceName: backup.deviceName },
      });
    } catch (error) {
      rmSync(staged, { force: true });
      await this.openSchool(profileId, { folder, force: true });
      return failure(this.errorIssue(error, "restoreBackup"));
    }

    const opened = await this.openSchool(profileId, { folder, force: true });
    if (!opened.ok) return opened;
    return { ok: true, data: this.getAppState() };
  }

  /**
   * Bring a school back from the cloud into a new folder: the pen drive was
   * lost or broken. Refused while the school's folder is reachable, which would
   * only make a second copy of it.
   */
  async restoreSchool(profileId: string, backupId: string, location: string): Promise<ApiResult<AppStateDto>> {
    const account = this.account;
    const user = account?.user;
    if (!account || !user) return failure(ISSUES.notSignedIn());
    if (this.locate(profileId)) return failure(ISSUES.schoolAvailable());
    if (!isWritableLocation(location)) return failure(ISSUES.notWritable(location));

    let profile: CloudProfile | undefined;
    let keyHex: string;
    let bytes: Uint8Array;
    let backup: CloudBackup;
    try {
      const profiles = await account.withSession((session) => account.backend.listProfiles(session));
      profile = profiles.find((item) => item.id === profileId);
      if (!profile) return failure(ISSUES.notConnected());
      keyHex = await account.keyFor(profileId);
      ({ bytes, backup } = await this.download(profileId, backupId));
    } catch (error) {
      return failure(this.errorIssue(error, "restoreSchool"));
    }

    await this.closeSchool();
    const folder = folderForNewSchool(location, profile.diseCode);
    const madeDataDir = !existsSync(path.dirname(folder));
    try {
      writeManifest(
        folder,
        newManifest({
          profileId,
          ownerUserId: user.id,
          schoolNameGu: profile.schoolNameGu,
          diseCode: profile.diseCode,
          keyHex,
          createdAt: profile.createdAt,
        }),
      );
      writeBytesAtomic(booksFile(folder), bytes);
      verifyBooks(booksFile(folder), keyHex);
      writeSyncState(folder, {
        pendingSince: null,
        lastCloudBackup: { id: backup.id, at: backup.createdAt, deviceName: backup.deviceName },
      });
    } catch (error) {
      removeNewFolder(folder, madeDataDir);
      return failure(this.errorIssue(error, "restoreSchool"));
    }

    const opened = await this.openSchool(profileId, { folder });
    if (!opened.ok) return opened;
    return { ok: true, data: this.getAppState() };
  }

  /**
   * Move the books kept by the previous version of the app - one unencrypted
   * file in this PC's data folder - into an encrypted school folder. The old
   * file is renamed, not deleted, so nothing is lost if anything goes wrong.
   */
  async moveLegacyBooks(location: string): Promise<ApiResult<AppStateDto>> {
    const account = this.account;
    const user = account?.user;
    const legacy = this.options.legacyBooks;
    if (!account || !user) return failure(ISSUES.notSignedIn());
    if (!legacy || !isPlainDatabase(legacy.file)) return failure(ISSUES.noLegacyBooks());
    if (!isWritableLocation(location)) return failure(ISSUES.notWritable(location));

    const school = readLegacySchool(legacy.file);
    const diseCode = school?.diseCode ?? "";
    try {
      const existing = await account.withSession((session) => account.backend.listProfiles(session));
      if (diseCode && existing.some((profile) => profile.diseCode === diseCode)) {
        return failure(ISSUES.schoolExists(diseCode));
      }
    } catch (error) {
      return failure(cloudIssue(error, "moveLegacyBooks"));
    }

    await this.closeSchool();
    const profileId = randomUUID();
    const keyHex = generateKeyHex();
    const folder = folderForNewSchool(location, diseCode || "school");
    const madeDataDir = !existsSync(path.dirname(folder));
    const manifest = newManifest({
      profileId,
      ownerUserId: user.id,
      schoolNameGu: school?.nameGu ?? "",
      diseCode,
      keyHex,
    });
    try {
      writeManifest(folder, manifest);
      encryptCopy(legacy.file, booksFile(folder), keyHex);
      runMigrations(booksFile(folder), this.options.migrationsDir, { keyHex });
      await account.withSession((session) =>
        account.backend.createProfile(session, {
          id: profileId,
          schoolNameGu: manifest.schoolNameGu,
          diseCode,
          keyHex,
        }),
      );
      account.rememberKey(profileId, keyHex);
    } catch (error) {
      removeNewFolder(folder, madeDataDir);
      return failure(this.errorIssue(error, "moveLegacyBooks"));
    }

    if (!legacy.developmentCopy) {
      for (const suffix of ["", "-wal", "-shm"]) {
        const from = legacy.file + suffix;
        if (existsSync(from)) renameSync(from, `${legacy.file}.moved${suffix}`);
      }
    }
    writeSyncState(folder, { pendingSince: new Date(this.now()).toISOString(), lastCloudBackup: null });
    const opened = await this.openSchool(profileId, { folder });
    if (!opened.ok) return opened;
    return { ok: true, data: this.getAppState() };
  }

  /** Quitting: like closing the school. */
  shutdown(flushMs = CLOSE_FLUSH_MS): Promise<AppStateDto> {
    return this.closeSchool(flushMs);
  }

  // ------------------------------------------------------------- plumbing

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private locate(profileId: string): FoundProfile | null {
    const known = this.known.get(profileId);
    const roots = this.options.roots?.() ?? mountedRoots(this.options.platform);
    return locateProfile(profileId, known?.folder ?? "", { platform: this.options.platform, roots });
  }

  private async keyFor(manifest: Manifest): Promise<string> {
    const account = this.account!;
    const cached = account.cachedKey(manifest.profileId);
    if (cached && keyMatches(manifest, cached)) return cached;
    if (cached) account.forgetKey(manifest.profileId);
    const key = await account.withSession((session) =>
      account.backend.getProfileKey(session, manifest.profileId),
    );
    if (!keyMatches(manifest, key)) {
      throw new VaultError("wrong-key", "the account's key does not match this folder's manifest");
    }
    account.rememberKey(manifest.profileId, key);
    return key;
  }

  /** Make a found, unlocked school folder the open one. */
  private async bind(found: FoundProfile, keyHex: string): Promise<void> {
    const file = booksFile(found.folder);
    // A copy before anything - including a migration - touches the books.
    takeLocalBackup(found.folder, keyHex, "open");
    const migration = runMigrations(file, this.options.migrationsDir, { keyHex });
    const prisma = createPrismaClient({ file, keyHex });
    const year = await latestYear(prisma);
    const current: OpenSchool = {
      profileId: found.manifest.profileId,
      folder: found.folder,
      manifest: found.manifest,
      keyHex,
      prisma,
      setup: new SetupService(prisma),
      books: year ? new AccountsService(prisma, year.id) : null,
      yearLabel: year?.label ?? "",
      schemaVersion: migration.schemaVersion,
    };
    this.current = current;
    this.dataMissing = false;
    await this.refreshManifest(current);
    this.backups?.attach({
      folder: found.folder,
      profileId: current.profileId,
      keyHex,
      schemaVersion: migration.schemaVersion,
    });
  }

  /** Keep the manifest and this PC's list in step with the school's own record. */
  private async refreshManifest(current: OpenSchool): Promise<void> {
    const school = await current.prisma.school.findFirst();
    if (
      school &&
      (school.nameGu !== current.manifest.schoolNameGu || school.diseCode !== current.manifest.diseCode)
    ) {
      current.manifest = { ...current.manifest, schoolNameGu: school.nameGu, diseCode: school.diseCode };
      writeManifest(current.folder, current.manifest);
    }
    this.known.remember({
      profileId: current.profileId,
      ownerUserId: current.manifest.ownerUserId,
      schoolNameGu: current.manifest.schoolNameGu,
      diseCode: current.manifest.diseCode,
      folder: current.folder,
      lastOpenedAt: new Date(this.now()).toISOString(),
    });
  }

  private async download(profileId: string, backupId: string): Promise<{ bytes: Uint8Array; backup: CloudBackup }> {
    const account = this.account!;
    const backups = await account.withSession((session) => account.backend.listBackups(session, profileId));
    const backup = backups.find((item) => item.id === backupId);
    if (!backup) throw new CloudError("not-found", "no such backup for this school");
    const bytes = await account.withSession((session) => account.backend.downloadBackup(session, backup));
    if (sha256(bytes) !== backup.sha256) throw new BackupDamagedError();
    return { bytes, backup };
  }

  private legacyBooks(): SchoolListDto["legacyBooks"] {
    const legacy = this.options.legacyBooks;
    if (!legacy || !isPlainDatabase(legacy.file)) return null;
    return { schoolNameGu: readLegacySchool(legacy.file)?.nameGu ?? null, developmentCopy: legacy.developmentCopy };
  }

  private async cloudCall<T>(call: (account: Account) => Promise<T>): Promise<ApiResult<T>> {
    const account = this.account;
    if (!account) return failure(ISSUES.unavailable());
    try {
      return { ok: true, data: await call(account) };
    } catch (error) {
      return failure(this.errorIssue(error, "cloud"));
    }
  }

  private errorIssue(error: unknown, where: string): Issue {
    if (error instanceof CloudError) return cloudIssue(error, where);
    if (error instanceof NewerDataError) return ISSUES.newerData(error.message);
    if (error instanceof VaultError) return ISSUES.wrongKey(error.message);
    if (error instanceof BackupDamagedError) return ISSUES.backupDamaged();
    console.error(`${where} failed:`, error);
    return ISSUES.internal(error instanceof Error ? error.message : String(error));
  }
}

// ----------------------------------------------------------------- helpers

class BackupDamagedError extends Error {
  constructor() {
    super("the downloaded backup does not match its checksum");
  }
}

async function latestYear(prisma: PrismaClient): Promise<{ id: number; label: string } | null> {
  // The newest year that is still open, so a school that switched to a closed
  // year to reprint it comes back to the one they are working in.
  return (
    (await prisma.financialYear.findFirst({ where: { status: "OPEN" }, orderBy: { label: "desc" } })) ??
    (await prisma.financialYear.findFirst({ orderBy: { label: "desc" } }))
  );
}

function profileAt(folder: string, profileId: string): FoundProfile | null {
  const manifest = readManifest(folder);
  return manifest && manifest.profileId === profileId ? { folder, manifest } : null;
}

/** A restored or downloaded file must open with the key and be an SMC database. */
function verifyBooks(file: string, keyHex: string): void {
  const database = openEncrypted(file, keyHex, { fileMustExist: true });
  try {
    const school = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='School'").get();
    if (!school) throw new VaultError("not-a-database", "the file is not an SMC Accounts database");
  } finally {
    database.close();
  }
}

function readLegacySchool(file: string): { nameGu: string; diseCode: string } | null {
  try {
    const database = new Database(file, { readonly: true, fileMustExist: true });
    try {
      return (database.prepare("SELECT nameGu, diseCode FROM School ORDER BY id LIMIT 1").get() ??
        null) as { nameGu: string; diseCode: string } | null;
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
}

/** Undo a school folder this attempt created - and "SMC Accounts" if it made that too and it is empty. */
function removeNewFolder(folder: string, removeParentIfEmpty: boolean): void {
  rmSync(folder, { recursive: true, force: true });
  const parent = path.dirname(folder);
  if (removeParentIfEmpty && path.basename(parent) === DATA_DIR_NAME) {
    try {
      if (readdirSync(parent).length === 0) rmdirSync(parent);
    } catch {
      // Leave it.
    }
  }
}

const deviceSchema = z.object({ id: z.string().uuid(), name: z.string() });

/** This PC's identity, for lock files and for naming who made a backup. */
function loadDevice(userDataDir: string): Device {
  const file = path.join(userDataDir, "device.json");
  const name = os.hostname() || "PC";
  const stored = readJson(file, deviceSchema);
  if (stored) {
    if (stored.name !== name) writeJsonAtomic(file, { id: stored.id, name });
    return { id: stored.id, name };
  }
  const device = { id: randomUUID(), name };
  writeJsonAtomic(file, device);
  return device;
}

function toBackupDto(backup: CloudBackup): CloudBackupDto {
  return {
    id: backup.id,
    createdAt: backup.createdAt,
    sizeBytes: backup.sizeBytes,
    deviceName: backup.deviceName,
    appVersion: backup.appVersion,
  };
}

function failure(issue: Issue): { ok: false; issues: Issue[] } {
  return { ok: false, issues: [issue] };
}

function issue(code: string, messageGu: string, messageEn: string, detail = messageEn): Issue {
  return { severity: "error", code, messageGu, messageEn, detail };
}

/** The same failure in the user's terms, whichever cloud call it came from. */
function cloudIssue(error: unknown, where: string): Issue {
  if (!(error instanceof CloudError)) {
    console.error(`${where} failed:`, error);
    return ISSUES.internal(error instanceof Error ? error.message : String(error));
  }
  const detail = `${where}: ${error.message}`;
  switch (error.code) {
    case "offline":
      return issue(
        "offline",
        "ઇન્ટરનેટ જોડાણ નથી. જોડાણ તપાસીને ફરી પ્રયત્ન કરો.",
        "No internet connection. Check the connection and try again.",
        detail,
      );
    case "invalid-credentials":
      return issue("invalid_credentials", "ઈમેલ અથવા પાસવર્ડ ખોટો છે.", "Wrong email or password.", detail);
    case "email-not-confirmed":
      return issue(
        "email_not_confirmed",
        "આ ઈમેલ હજી ચકાસાયો નથી. ઈમેલમાં આવેલો કોડ દાખલ કરો.",
        "This email is not confirmed yet. Enter the code that was emailed to it.",
        detail,
      );
    case "user-exists":
      return issue(
        "user_exists",
        "આ ઈમેલથી ખાતું પહેલેથી છે. લૉગિન કરો, અથવા પાસવર્ડ ભૂલી ગયા હો તો નવો બનાવો.",
        "An account already exists for this email. Log in, or reset the password.",
        detail,
      );
    case "invalid-code":
      return issue("invalid_code", "કોડ ખોટો છે અથવા તેની મુદત પૂરી થઈ ગઈ છે.", "The code is wrong or has expired.", detail);
    case "weak-password":
      return issue(
        "weak_password",
        "પાસવર્ડ ઓછામાં ઓછા 8 અક્ષરનો અને અનુમાન ન થઈ શકે તેવો રાખો.",
        "Use a password of at least 8 characters that is hard to guess.",
        detail,
      );
    case "rate-limited":
      return issue(
        "rate_limited",
        "ઘણા પ્રયત્નો થયા. થોડી મિનિટ પછી ફરી પ્રયત્ન કરો.",
        "Too many attempts. Try again in a few minutes.",
        detail,
      );
    case "session-expired":
      return issue("session_expired", "લૉગિનની મુદત પૂરી થઈ. ફરી લૉગિન કરો.", "Your login has ended. Please log in again.", detail);
    case "not-found":
      return issue(
        "not_found",
        "ક્લાઉડમાં આ માહિતી આ ખાતામાં મળી નહીં.",
        "This was not found in the cloud for this account.",
        detail,
      );
    case "server":
      return issue("cloud_error", "ક્લાઉડ સર્વરે ભૂલ બતાવી. થોડી વાર પછી ફરી પ્રયત્ન કરો.", "The cloud server reported an error. Try again later.", detail);
  }
}

const ISSUES = {
  notSignedIn: () => issue("not_signed_in", "પહેલાં લૉગિન કરો.", "Please log in first."),
  unavailable: () => issue("unavailable", "ક્લાઉડ સેટિંગ વગર આ સોફ્ટવેર ચાલી શકે નહીં.", "This build has no cloud settings."),
  noSchoolOpen: () => issue("no_school_open", "કોઈ શાળા ખુલ્લી નથી.", "No school is open."),
  notConnected: () =>
    issue(
      "not_connected",
      "આ શાળાનો ડેટા મળ્યો નહીં. પેન ડ્રાઈવ લગાવો અથવા ડેટાનું ફોલ્ડર પસંદ કરો.",
      "This school's data was not found. Insert the pen drive, or choose its folder.",
    ),
  otherAccount: () =>
    issue(
      "other_account",
      "આ ડેટા બીજા ખાતાનો છે. તે ખાતાથી લૉગિન કરીને ખોલો.",
      "This data belongs to another account. Log in with that account to open it.",
    ),
  noSchoolInFolder: (folder: string) =>
    issue(
      "no_school_in_folder",
      "આ ફોલ્ડરમાં SMC હિસાબનો કોઈ ડેટા નથી.",
      "There is no SMC Accounts data in this folder.",
      `no profile.json in or just below ${folder}`,
    ),
  notWritable: (folder: string) =>
    issue(
      "folder_not_writable",
      "આ જગ્યાએ ડેટા સાચવી શકાતો નથી. બીજું ફોલ્ડર પસંદ કરો.",
      "Data cannot be saved here. Choose another folder.",
      `cannot write to ${folder}`,
    ),
  schoolExists: (diseCode: string) =>
    issue(
      "school_exists",
      `ડાયસ કોડ ${diseCode} ની શાળા આ ખાતામાં પહેલેથી છે. "હાલનો ડેટા ખોલો" વાપરો.`,
      `A school with DISE code ${diseCode} already exists in this account. Use "Open existing data".`,
    ),
  schoolAvailable: () =>
    issue(
      "school_available",
      "આ શાળાનો ડેટા આ PC પર મળે છે; તેને ખોલો. બીજી નકલ બનાવવાની જરૂર નથી.",
      "This school's data is reachable on this PC; open it instead of making a second copy.",
    ),
  noLegacyBooks: () => issue("no_legacy_books", "જૂનો ડેટા મળ્યો નહીં.", "No earlier books were found on this PC."),
  newerData: (detail: string) =>
    issue(
      "newer_data",
      "આ ડેટા SMC હિસાબના નવા સંસ્કરણથી સાચવાયેલો છે. આ PC પર સોફ્ટવેર અપડેટ કરો.",
      "This data was saved by a newer version of SMC Accounts. Update the software on this PC.",
      detail,
    ),
  wrongKey: (detail: string) =>
    issue(
      "wrong_key",
      "ડેટા ખોલી શકાયો નહીં: તે બગડેલો છે અથવા આ ખાતાની ચાવી સાથે મેળ ખાતો નથી.",
      "The data could not be opened: it is damaged, or does not match this account's key.",
      detail,
    ),
  backupDamaged: () =>
    issue(
      "backup_damaged",
      "ડાઉનલોડ થયેલો બેકઅપ બગડેલો છે, તેથી વાપર્યો નથી. ફરી પ્રયત્ન કરો.",
      "The downloaded backup was damaged, so it was not used. Try again.",
    ),
  internal: (detail: string) =>
    issue("internal_error", "અણધારી ભૂલ આવી. વિગત માટે લોગ જુઓ.", "Something went wrong. See the log for details.", detail),
};
