/**
 * The real cloud: a Supabase project.
 *
 * What the project must contain is in supabase/migrations/0001_smc_cloud.sql and
 * the steps to create it are in docs/SUPABASE_SETUP.md. In short:
 *
 *   Auth       email + password accounts, the address proved by a 6-digit code
 *   profiles   one row per school                     (row-level security)
 *   profile_keys  one key per school, never replaceable   (row-level security)
 *   backups    one row per backup, never changeable     (row-level security)
 *   Storage    a private bucket "backups", files under <user id>/<school id>/
 *
 * Only the project's PUBLISHABLE key is in the app. It identifies the project;
 * it grants nothing by itself. Every table and the bucket refuse anything but
 * the signed-in owner's own rows, so a copy of the app - or of this key - is no
 * way into anybody else's schools.
 *
 * Runs in the Electron main process only. The renderer never sees a token.
 */
import { createClient, isAuthError, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  CloudError,
  type CloudBackend,
  type CloudBackup,
  type CloudProfile,
  type CloudSession,
  type NewBackup,
} from "./types.js";

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

const BUCKET = "backups";

/** Nobody waits a minute for a login on a slow rural connection. */
const REQUEST_TIMEOUT_MS = 30_000;
/** Backups are bigger; allow them longer. */
const TRANSFER_TIMEOUT_MS = 120_000;

interface ProfileRow {
  id: string;
  school_name_gu: string;
  dise_code: string;
  created_at: string;
}

interface BackupRow {
  id: string;
  profile_id: string;
  storage_path: string;
  size_bytes: number;
  sha256: string;
  app_version: string;
  schema_version: string;
  device_name: string;
  created_at: string;
}

export class SupabaseCloud implements CloudBackend {
  readonly kind = "supabase" as const;

  constructor(private readonly config: SupabaseConfig) {}

  // --------------------------------------------------------------- accounts

  async signUp(email: string, password: string): Promise<{ session: CloudSession | null }> {
    const { data, error } = await this.anonymous().auth.signUp({ email: email.trim(), password });
    if (error) throw authFailure(error);
    // With email confirmation on (it must be - see the setup guide) an address
    // that already has a confirmed account comes back as a user with no
    // identities, so the attempt cannot be used to test which emails exist.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      throw new CloudError("user-exists", "an account already exists for this email");
    }
    return { session: data.session ? toSession(data.session) : null };
  }

  async verifySignUp(email: string, code: string): Promise<CloudSession> {
    const client = this.anonymous();
    let result = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "signup" });
    // Newer projects issue the confirmation as a plain email code.
    if (result.error && !isAuthRetryableFetchError(result.error)) {
      const retry = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (!retry.error) result = retry;
    }
    if (result.error) throw authFailure(result.error, "invalid-code");
    if (!result.data.session) throw new CloudError("invalid-code", "the code gave no session");
    return toSession(result.data.session);
  }

  async signIn(email: string, password: string): Promise<CloudSession> {
    const { data, error } = await this.anonymous().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw authFailure(error);
    return toSession(data.session);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.anonymous().auth.resetPasswordForEmail(email.trim());
    if (error) throw authFailure(error);
  }

  async completePasswordReset(email: string, code: string, newPassword: string): Promise<CloudSession> {
    const client = this.anonymous();
    const verified = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
    if (verified.error) throw authFailure(verified.error, "invalid-code");
    if (!verified.data.session) throw new CloudError("invalid-code", "the code gave no session");
    // verifyOtp left this client signed in, which is what updateUser needs.
    const updated = await client.auth.updateUser({ password: newPassword });
    if (updated.error) throw authFailure(updated.error);
    // Changing the password ends the recovery session's right to exist; sign in
    // properly so the saved session is an ordinary one.
    return this.signIn(email, newPassword);
  }

  async refresh(session: CloudSession): Promise<CloudSession> {
    const { data, error } = await this.anonymous().auth.refreshSession({
      refresh_token: session.refreshToken,
    });
    if (error) throw authFailure(error, "session-expired");
    if (!data.session) throw new CloudError("session-expired", "refresh gave no session");
    return toSession(data.session);
  }

  async signOut(session: CloudSession): Promise<void> {
    const client = this.anonymous();
    const set = await client.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });
    if (set.error) return; // Already invalid on the server: nothing to revoke.
    // "local": end this PC's session only, not the user's other PCs.
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error && !isAuthRetryableFetchError(error)) return;
    if (error) throw authFailure(error);
  }

  async isApproved(session: CloudSession): Promise<boolean> {
    const { data, error, status } = await this.as(session)
      .from("account_access")
      .select("approved")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw dataFailure(error, status);
    return (data as { approved?: boolean } | null)?.approved === true;
  }

  // ---------------------------------------------------------------- schools

  async listProfiles(session: CloudSession): Promise<CloudProfile[]> {
    const { data, error, status } = await this.as(session)
      .from("profiles")
      .select("id, school_name_gu, dise_code, created_at")
      .order("created_at", { ascending: true });
    if (error) throw dataFailure(error, status);
    return (data as ProfileRow[]).map(toProfile);
  }

  async createProfile(
    session: CloudSession,
    input: { id: string; schoolNameGu: string; diseCode: string; keyHex: string },
  ): Promise<CloudProfile> {
    // One database function, so the school and its key are created in a single
    // transaction: there is never a school in the cloud without its key.
    const { data, error, status } = await this.as(session).rpc("create_profile", {
      p_id: input.id,
      p_school_name_gu: input.schoolNameGu,
      p_dise_code: input.diseCode,
      p_key_hex: input.keyHex,
    });
    if (error) throw dataFailure(error, status);
    const row = (Array.isArray(data) ? data[0] : data) as ProfileRow | undefined;
    if (!row) throw new CloudError("server", "create_profile returned nothing");
    return toProfile(row);
  }

  async getProfileKey(session: CloudSession, profileId: string): Promise<string> {
    const { data, error, status } = await this.as(session)
      .from("profile_keys")
      .select("key_hex")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw dataFailure(error, status);
    const key = (data as { key_hex?: string } | null)?.key_hex;
    if (!key) throw new CloudError("not-found", "no key for this school in this account");
    return key;
  }

  // ---------------------------------------------------------------- backups

  async uploadBackup(session: CloudSession, backup: NewBackup): Promise<CloudBackup> {
    const client = this.as(session, TRANSFER_TIMEOUT_MS);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${session.user.id}/${backup.profileId}/${stamp}-${randomUUID().slice(0, 8)}.smcbak`;

    // upsert:false - a backup is only ever added. The bucket's policies do not
    // allow overwriting or deleting, and this does not ask to.
    const uploaded = await client.storage.from(BUCKET).upload(storagePath, backup.bytes, {
      contentType: "application/octet-stream",
      upsert: false,
    });
    if (uploaded.error) throw storageFailure(uploaded.error);

    const { data, error, status } = await client
      .from("backups")
      .insert({
        profile_id: backup.profileId,
        storage_path: storagePath,
        size_bytes: backup.bytes.byteLength,
        sha256: backup.sha256,
        app_version: backup.appVersion,
        schema_version: backup.schemaVersion,
        device_name: backup.deviceName.slice(0, 100),
      })
      .select()
      .single();
    if (error) throw dataFailure(error, status);
    return toBackup(data as BackupRow);
  }

  async listBackups(session: CloudSession, profileId: string): Promise<CloudBackup[]> {
    const { data, error, status } = await this.as(session)
      .from("backups")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw dataFailure(error, status);
    return (data as BackupRow[]).map(toBackup);
  }

  async downloadBackup(session: CloudSession, backup: CloudBackup): Promise<Uint8Array> {
    const { data, error } = await this.as(session, TRANSFER_TIMEOUT_MS)
      .storage.from(BUCKET)
      .download(backup.storagePath);
    if (error) throw storageFailure(error);
    return new Uint8Array(await data.arrayBuffer());
  }

  // ------------------------------------------------------------- plumbing

  /** A client with no user: for signing in, signing up and refreshing. */
  private anonymous(): SupabaseClient {
    return createClient(this.config.url, this.config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: timedFetch(REQUEST_TIMEOUT_MS) },
    });
  }

  /**
   * A client acting as the signed-in user. The access token goes in the
   * Authorization header, which is what row-level security reads. Refreshing
   * it before it expires is the caller's job (src/server/cloud/account.ts).
   */
  private as(session: CloudSession, timeoutMs = REQUEST_TIMEOUT_MS): SupabaseClient {
    return createClient(this.config.url, this.config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        fetch: timedFetch(timeoutMs),
      },
    });
  }
}

function timedFetch(timeoutMs: number): typeof fetch {
  return (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
}

function toSession(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  user: { id: string; email?: string };
}): CloudSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
    user: { id: session.user.id, email: session.user.email ?? "" },
  };
}

function toProfile(row: ProfileRow): CloudProfile {
  return {
    id: row.id,
    schoolNameGu: row.school_name_gu,
    diseCode: row.dise_code,
    createdAt: row.created_at,
  };
}

function toBackup(row: BackupRow): CloudBackup {
  return {
    id: row.id,
    profileId: row.profile_id,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    appVersion: row.app_version,
    schemaVersion: row.schema_version,
    deviceName: row.device_name,
    createdAt: row.created_at,
  };
}

/** Supabase Auth's error codes, in the app's own terms. */
function authFailure(error: unknown, fallback: CloudError["code"] = "server"): CloudError {
  if (isAuthRetryableFetchError(error)) return new CloudError("offline", error.message);
  if (!isAuthError(error)) return new CloudError("offline", String(error));
  const message = error.message;
  if (error.status === 429) return new CloudError("rate-limited", message);
  switch (error.code) {
    case "invalid_credentials":
      return new CloudError("invalid-credentials", message);
    case "email_not_confirmed":
      return new CloudError("email-not-confirmed", message);
    case "user_already_exists":
    case "email_exists":
      return new CloudError("user-exists", message);
    case "otp_expired":
      return new CloudError("invalid-code", message);
    case "weak_password":
    case "same_password":
      return new CloudError("weak-password", message);
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return new CloudError("rate-limited", message);
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "session_not_found":
    case "session_expired":
    case "user_not_found":
    case "user_banned":
      return new CloudError("session-expired", message);
    default:
      return new CloudError(fallback, message);
  }
}

/** PostgREST answers status 0 when the request never reached the server. */
function dataFailure(error: { message: string; code?: string }, status: number): CloudError {
  if (status === 0) return new CloudError("offline", error.message);
  if (status === 401 || error.code === "PGRST301" || error.code === "PGRST303") {
    return new CloudError("session-expired", error.message);
  }
  if (status === 429) return new CloudError("rate-limited", error.message);
  return new CloudError("server", error.message);
}

/**
 * Storage reports most refusals as HTTP 400 with the real code in the body, so
 * an expired token is recognised by its message as well as by 401.
 */
function storageFailure(error: { message: string; status?: number; statusCode?: string }): CloudError {
  const status = error.status;
  if (status === undefined || status === 0) return new CloudError("offline", error.message);
  if (status === 401 || error.statusCode === "401" || /\bjwt\b|token.*expired/i.test(error.message)) {
    return new CloudError("session-expired", error.message);
  }
  if (status === 404 || error.statusCode === "404") return new CloudError("not-found", error.message);
  return new CloudError("server", error.message);
}
