/**
 * A cloud that lives in a folder on this computer.
 *
 * Behaves like the Supabase project the app is built for - the same accounts
 * with emailed codes, the same rule that an account sees only its own schools,
 * keys that cannot be replaced, backups that cannot be changed or deleted - so
 * the whole application can be developed and tested before that project
 * exists, and without touching anybody's real account.
 *
 * Emailed codes are not emailed: they are handed to `onCode`, which the
 * development app prints to its terminal and the tests read directly.
 *
 * NOT for production. A packaged build refuses to start with it (see
 * src/server/cloud/config.ts). The "server" here is the same machine as the
 * client, so it protects nothing; it only imitates.
 */
import { randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readJson, writeBytesAtomic, writeJsonAtomic } from "../profiles/json-file.js";
import { sha256 } from "./checksum.js";
import {
  CloudError,
  type CloudBackend,
  type CloudBackup,
  type CloudProfile,
  type CloudSession,
  type NewBackup,
} from "./types.js";

const stateSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      salt: z.string(),
      hash: z.string(),
      confirmed: z.boolean(),
      /** Whether the owner let this account use the app. Absent: as `approveNewAccounts` says. */
      approved: z.boolean().optional(),
    }),
  ),
  codes: z.array(
    z.object({ email: z.string(), code: z.string(), purpose: z.string(), expiresAt: z.number() }),
  ),
  accessTokens: z.record(z.object({ userId: z.string(), expiresAt: z.number() })),
  refreshTokens: z.record(z.string()),
  profiles: z.array(
    z.object({
      id: z.string(),
      ownerId: z.string(),
      schoolNameGu: z.string(),
      diseCode: z.string(),
      createdAt: z.string(),
    }),
  ),
  keys: z.record(z.object({ ownerId: z.string(), keyHex: z.string() })),
  backups: z.array(
    z.object({
      id: z.string(),
      ownerId: z.string(),
      profileId: z.string(),
      storagePath: z.string(),
      sizeBytes: z.number(),
      sha256: z.string(),
      appVersion: z.string(),
      schemaVersion: z.string(),
      deviceName: z.string(),
      createdAt: z.string(),
    }),
  ),
});
type State = z.infer<typeof stateSchema>;

export interface FakeCloudOptions {
  dir: string;
  /** Receives every code the real service would email. */
  onCode?: (email: string, code: string, purpose: "signup" | "recovery") => void;
  /** When this returns true every call fails as if there were no internet. */
  isOffline?: () => boolean;
  /** How long an access token lasts, in seconds. Supabase's default is an hour. */
  accessTokenSeconds?: number;
  /**
   * Whether an account may use the app without its owner approving it. The
   * development cloud says yes, so a developer is not locked out of their own
   * machine; tests of the approval gate say no and call `setApproved`.
   */
  approveNewAccounts?: boolean;
  now?: () => number;
}

const MIN_PASSWORD = 8;

export class FakeCloud implements CloudBackend {
  readonly kind = "fake" as const;
  private readonly stateFile: string;

  constructor(private readonly options: FakeCloudOptions) {
    this.stateFile = path.join(options.dir, "state.json");
    mkdirSync(options.dir, { recursive: true });
  }

  // --------------------------------------------------------------- accounts

  async signUp(email: string, password: string): Promise<{ session: CloudSession | null }> {
    this.online();
    const address = normalise(email);
    if (password.length < MIN_PASSWORD) throw new CloudError("weak-password", "password too short");
    const state = this.read();
    const existing = state.users.find((user) => user.email === address);
    if (existing?.confirmed) throw new CloudError("user-exists", "an account exists for this email");
    if (!existing) {
      const salt = randomBytes(16).toString("hex");
      state.users.push({ id: randomUUID(), email: address, salt, hash: hash(password, salt), confirmed: false });
    }
    this.issueCode(state, address, "signup");
    this.write(state);
    return { session: null };
  }

  async verifySignUp(email: string, code: string): Promise<CloudSession> {
    this.online();
    const state = this.read();
    const address = normalise(email);
    this.takeCode(state, address, code, "signup");
    const user = state.users.find((item) => item.email === address);
    if (!user) throw new CloudError("invalid-code", "no such account");
    user.confirmed = true;
    const session = this.issueSession(state, user.id, user.email);
    this.write(state);
    return session;
  }

  async signIn(email: string, password: string): Promise<CloudSession> {
    this.online();
    const state = this.read();
    const user = state.users.find((item) => item.email === normalise(email));
    if (!user || !equal(hash(password, user.salt), user.hash)) {
      throw new CloudError("invalid-credentials", "wrong email or password");
    }
    if (!user.confirmed) throw new CloudError("email-not-confirmed", "email not confirmed");
    const session = this.issueSession(state, user.id, user.email);
    this.write(state);
    return session;
  }

  async requestPasswordReset(email: string): Promise<void> {
    this.online();
    const state = this.read();
    const address = normalise(email);
    // Like Supabase: say nothing about whether the address has an account.
    if (state.users.some((user) => user.email === address)) {
      this.issueCode(state, address, "recovery");
      this.write(state);
    }
  }

  async completePasswordReset(email: string, code: string, newPassword: string): Promise<CloudSession> {
    this.online();
    if (newPassword.length < MIN_PASSWORD) throw new CloudError("weak-password", "password too short");
    const state = this.read();
    const address = normalise(email);
    this.takeCode(state, address, code, "recovery");
    const user = state.users.find((item) => item.email === address);
    if (!user) throw new CloudError("invalid-code", "no such account");
    user.salt = randomBytes(16).toString("hex");
    user.hash = hash(newPassword, user.salt);
    user.confirmed = true;
    // A new password signs every other device out, as Supabase does.
    for (const [token, owner] of Object.entries(state.refreshTokens)) {
      if (owner === user.id) delete state.refreshTokens[token];
    }
    const session = this.issueSession(state, user.id, user.email);
    this.write(state);
    return session;
  }

  async refresh(session: CloudSession): Promise<CloudSession> {
    this.online();
    const state = this.read();
    const userId = state.refreshTokens[session.refreshToken];
    const user = state.users.find((item) => item.id === userId);
    if (!userId || !user) throw new CloudError("session-expired", "refresh token not valid");
    delete state.refreshTokens[session.refreshToken];
    const next = this.issueSession(state, user.id, user.email);
    this.write(state);
    return next;
  }

  async isApproved(session: CloudSession): Promise<boolean> {
    const { state, userId } = this.authorised(session);
    const user = state.users.find((item) => item.id === userId);
    return user?.approved ?? this.options.approveNewAccounts ?? true;
  }

  /** The owner approving (or withdrawing) an account by hand, as in the Supabase dashboard. */
  setApproved(email: string, approved: boolean): void {
    const state = this.read();
    const user = state.users.find((item) => item.email === normalise(email));
    if (!user) throw new Error(`no account ${email}`);
    user.approved = approved;
    this.write(state);
  }

  async signOut(session: CloudSession): Promise<void> {
    this.online();
    const state = this.read();
    delete state.refreshTokens[session.refreshToken];
    delete state.accessTokens[session.accessToken];
    this.write(state);
  }

  // ---------------------------------------------------------------- schools

  async listProfiles(session: CloudSession): Promise<CloudProfile[]> {
    const { state, userId } = this.authorised(session);
    return state.profiles
      .filter((profile) => profile.ownerId === userId)
      .map(({ ownerId: _owner, ...profile }) => profile);
  }

  async createProfile(
    session: CloudSession,
    input: { id: string; schoolNameGu: string; diseCode: string; keyHex: string },
  ): Promise<CloudProfile> {
    const { state, userId } = this.authorised(session);
    if (state.profiles.some((profile) => profile.id === input.id) || state.keys[input.id]) {
      throw new CloudError("server", "a school with this id already exists");
    }
    const profile = {
      id: input.id,
      ownerId: userId,
      schoolNameGu: input.schoolNameGu,
      diseCode: input.diseCode,
      createdAt: new Date(this.now()).toISOString(),
    };
    state.profiles.push(profile);
    state.keys[input.id] = { ownerId: userId, keyHex: input.keyHex };
    this.write(state);
    const { ownerId: _owner, ...result } = profile;
    return result;
  }

  async getProfileKey(session: CloudSession, profileId: string): Promise<string> {
    const { state, userId } = this.authorised(session);
    const key = state.keys[profileId];
    if (!key || key.ownerId !== userId) throw new CloudError("not-found", "no key for this school");
    return key.keyHex;
  }

  // ---------------------------------------------------------------- backups

  async uploadBackup(session: CloudSession, backup: NewBackup): Promise<CloudBackup> {
    const { state, userId } = this.authorised(session);
    const owned = state.profiles.some((p) => p.id === backup.profileId && p.ownerId === userId);
    if (!owned) throw new CloudError("not-found", "no such school for this account");
    if (sha256(backup.bytes) !== backup.sha256) throw new CloudError("server", "checksum mismatch");

    const createdAt = new Date(this.now()).toISOString();
    const storagePath = `${userId}/${backup.profileId}/${createdAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.smcbak`;
    writeBytesAtomic(this.objectFile(storagePath), backup.bytes);

    const record = {
      id: randomUUID(),
      ownerId: userId,
      profileId: backup.profileId,
      storagePath,
      sizeBytes: backup.bytes.byteLength,
      sha256: backup.sha256,
      appVersion: backup.appVersion,
      schemaVersion: backup.schemaVersion,
      deviceName: backup.deviceName,
      createdAt,
    };
    state.backups.push(record);
    this.write(state);
    const { ownerId: _owner, ...result } = record;
    return result;
  }

  async listBackups(session: CloudSession, profileId: string): Promise<CloudBackup[]> {
    const { state, userId } = this.authorised(session);
    return state.backups
      .filter((item) => item.ownerId === userId && item.profileId === profileId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ ownerId: _owner, ...item }) => item);
  }

  async downloadBackup(session: CloudSession, backup: CloudBackup): Promise<Uint8Array> {
    const { state, userId } = this.authorised(session);
    const record = state.backups.find((item) => item.id === backup.id);
    if (!record || record.ownerId !== userId) throw new CloudError("not-found", "no such backup");
    return new Uint8Array(readFileSync(this.objectFile(record.storagePath)));
  }

  // ------------------------------------------------------------- plumbing

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private online(): void {
    if (this.options.isOffline?.()) throw new CloudError("offline", "no internet (simulated)");
  }

  private authorised(session: CloudSession): { state: State; userId: string } {
    this.online();
    const state = this.read();
    const token = state.accessTokens[session.accessToken];
    if (!token || token.expiresAt * 1000 <= this.now()) {
      throw new CloudError("session-expired", "access token not valid");
    }
    return { state, userId: token.userId };
  }

  private issueSession(state: State, userId: string, email: string): CloudSession {
    const accessToken = randomBytes(24).toString("hex");
    const refreshToken = randomBytes(24).toString("hex");
    const expiresAt = Math.floor(this.now() / 1000) + (this.options.accessTokenSeconds ?? 3600);
    state.accessTokens[accessToken] = { userId, expiresAt };
    state.refreshTokens[refreshToken] = userId;
    return { accessToken, refreshToken, expiresAt, user: { id: userId, email } };
  }

  private issueCode(state: State, email: string, purpose: "signup" | "recovery"): void {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    state.codes = state.codes.filter((item) => !(item.email === email && item.purpose === purpose));
    state.codes.push({ email, code, purpose, expiresAt: this.now() + 60 * 60 * 1000 });
    this.options.onCode?.(email, code, purpose);
  }

  private takeCode(state: State, email: string, code: string, purpose: string): void {
    const found = state.codes.find(
      (item) => item.email === email && item.purpose === purpose && item.code === code.trim(),
    );
    if (!found || found.expiresAt <= this.now()) throw new CloudError("invalid-code", "wrong or expired code");
    state.codes = state.codes.filter((item) => item !== found);
  }

  private objectFile(storagePath: string): string {
    return path.join(this.options.dir, "objects", ...storagePath.split("/"));
  }

  private read(): State {
    return (
      readJson(this.stateFile, stateSchema) ?? {
        users: [],
        codes: [],
        accessTokens: {},
        refreshTokens: {},
        profiles: [],
        keys: {},
        backups: [],
      }
    );
  }

  private write(state: State): void {
    writeJsonAtomic(this.stateFile, state);
  }
}

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

function hash(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
