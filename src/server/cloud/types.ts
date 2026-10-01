/**
 * What the app needs from "the cloud", independent of who provides it.
 *
 * Two implementations answer it:
 *
 *   SupabaseCloud   the real thing: Supabase Auth, a Postgres table per kind of
 *                   record with row-level security, and a private Storage bucket.
 *   FakeCloud       a folder on this computer that behaves the same way. The
 *                   tests use it, and so does `npm run dev` until a Supabase
 *                   project is configured. Never used by a packaged build.
 *
 * The cloud holds three things per account, and nothing else:
 *
 *   profiles   which schools the account has (name, DISE code, id)
 *   keys       each school's encryption key (src/server/vault.ts)
 *   backups    encrypted copies of each school's books, append-only
 *
 * The books themselves are never in the cloud unencrypted: a backup is the
 * encrypted database file, byte for byte.
 */

export interface CloudUser {
  id: string;
  email: string;
}

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
  user: CloudUser;
}

export interface CloudProfile {
  id: string;
  schoolNameGu: string;
  diseCode: string;
  createdAt: string;
}

export interface CloudBackup {
  id: string;
  profileId: string;
  storagePath: string;
  sizeBytes: number;
  sha256: string;
  appVersion: string;
  schemaVersion: string;
  deviceName: string;
  createdAt: string;
}

export interface NewBackup {
  profileId: string;
  bytes: Uint8Array;
  sha256: string;
  appVersion: string;
  schemaVersion: string;
  deviceName: string;
}

export type CloudErrorCode =
  /** No internet, or the server did not answer. Retry later. */
  | "offline"
  | "invalid-credentials"
  | "email-not-confirmed"
  | "user-exists"
  | "invalid-code"
  | "weak-password"
  | "rate-limited"
  /** The saved login is no longer valid; the user has to log in again. */
  | "session-expired"
  /** The account exists but its owner has not (or no longer) let it use the app. */
  | "not-approved"
  | "not-found"
  | "server";

export class CloudError extends Error {
  constructor(
    readonly code: CloudErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CloudError";
  }
}

export interface CloudBackend {
  readonly kind: "supabase" | "fake";

  // --------------------------------------------------------------- accounts
  /**
   * Create an account. The server emails a code to prove the address belongs
   * to the person; `verifySignUp` takes it.
   */
  signUp(email: string, password: string): Promise<{ session: CloudSession | null }>;
  verifySignUp(email: string, code: string): Promise<CloudSession>;
  signIn(email: string, password: string): Promise<CloudSession>;
  /** Email a code that allows setting a new password. */
  requestPasswordReset(email: string): Promise<void>;
  completePasswordReset(email: string, code: string, newPassword: string): Promise<CloudSession>;
  refresh(session: CloudSession): Promise<CloudSession>;
  signOut(session: CloudSession): Promise<void>;
  /**
   * Whether the software's owner has let this account use the app. Accounts
   * start unapproved; the owner approves them by hand in the cloud
   * (docs/SUPABASE_SETUP.md, "Approving an account"). The cloud's own rules
   * refuse an unapproved account everything, so this is only how the app
   * finds out to say so.
   */
  isApproved(session: CloudSession): Promise<boolean>;

  // ---------------------------------------------------------------- schools
  listProfiles(session: CloudSession): Promise<CloudProfile[]>;
  /** Register a new school and its key together. Neither can be replaced later. */
  createProfile(
    session: CloudSession,
    input: { id: string; schoolNameGu: string; diseCode: string; keyHex: string },
  ): Promise<CloudProfile>;
  getProfileKey(session: CloudSession, profileId: string): Promise<string>;

  // ---------------------------------------------------------------- backups
  uploadBackup(session: CloudSession, backup: NewBackup): Promise<CloudBackup>;
  /** Newest first. */
  listBackups(session: CloudSession, profileId: string): Promise<CloudBackup[]>;
  downloadBackup(session: CloudSession, backup: CloudBackup): Promise<Uint8Array>;
}
