/**
 * The signed-in account on THIS PC, and the school keys it has fetched.
 *
 * The first login on a PC needs the internet: the password is checked by the
 * cloud, nowhere else. After that the session is kept on the PC, so the app
 * opens offline - nothing about the password is stored, only the session the
 * cloud issued, which the cloud can revoke.
 *
 * Both files here are sealed by a SecretBox. In the app that is Electron's
 * safeStorage, i.e. Windows DPAPI: the files decrypt only for the same Windows
 * user on the same PC. Copied to a pen drive or another PC they are useless,
 * and on a PC where they cannot be read the user simply logs in again.
 */
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { writeBytesAtomic } from "../profiles/json-file.js";
import { CloudError, type CloudBackend, type CloudSession, type CloudUser } from "./types.js";

/** Seals small secrets at rest. */
export interface SecretBox {
  /** False when the platform could not give real encryption (seen on bare Linux). */
  readonly secure: boolean;
  seal(plain: string): Buffer;
  open(sealed: Buffer): string;
}

/** For tests only: no protection at all. */
export const PLAIN_BOX: SecretBox = {
  secure: false,
  seal: (plain) => Buffer.from(plain, "utf8"),
  open: (sealed) => sealed.toString("utf8"),
};

class SecretFile<T> {
  constructor(
    private readonly file: string,
    private readonly schema: z.ZodType<T>,
    private readonly box: SecretBox,
  ) {}

  read(): T | null {
    let sealed: Buffer;
    try {
      sealed = readFileSync(this.file);
    } catch {
      return null;
    }
    try {
      const parsed = this.schema.safeParse(JSON.parse(this.box.open(sealed)));
      return parsed.success ? parsed.data : null;
    } catch {
      // Sealed by another Windows user or another PC: treat as absent.
      return null;
    }
  }

  write(value: T): void {
    writeBytesAtomic(this.file, this.box.seal(JSON.stringify(value)));
  }

  clear(): void {
    rmSync(this.file, { force: true });
  }
}

const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  user: z.object({ id: z.string(), email: z.string() }),
});

const keyCacheSchema = z.object({
  userId: z.string(),
  keys: z.record(z.string().regex(/^[0-9a-f]{64}$/)),
});

/** Refresh the access token when it has less than this long left. */
const REFRESH_MARGIN_SECONDS = 120;

export class Account {
  private readonly sessionFile: SecretFile<CloudSession>;
  private readonly keyFile: SecretFile<z.infer<typeof keyCacheSchema>>;
  private session: CloudSession | null;

  constructor(
    readonly backend: CloudBackend,
    userDataDir: string,
    box: SecretBox,
    private readonly now: () => number = Date.now,
  ) {
    this.sessionFile = new SecretFile(path.join(userDataDir, "session.bin"), sessionSchema, box);
    this.keyFile = new SecretFile(path.join(userDataDir, "keys.bin"), keyCacheSchema, box);
    this.session = this.sessionFile.read();
  }

  /** Who is signed in on this PC, if anybody. Works offline. */
  get user(): CloudUser | null {
    return this.session?.user ?? null;
  }

  // --------------------------------------------------------------- sign in

  async signIn(email: string, password: string): Promise<CloudUser> {
    return this.adopt(await this.approved(await this.backend.signIn(email, password)));
  }

  /** Returns the user when the account is usable at once, null when a code was emailed. */
  async signUp(email: string, password: string): Promise<CloudUser | null> {
    const { session } = await this.backend.signUp(email, password);
    return session ? this.adopt(await this.approved(session)) : null;
  }

  async verifySignUp(email: string, code: string): Promise<CloudUser> {
    return this.adopt(await this.approved(await this.backend.verifySignUp(email, code)));
  }

  requestPasswordReset(email: string): Promise<void> {
    return this.backend.requestPasswordReset(email);
  }

  async completePasswordReset(email: string, code: string, password: string): Promise<CloudUser> {
    return this.adopt(await this.approved(await this.backend.completePasswordReset(email, code, password)));
  }

  /**
   * Whether the account signed in here is still approved. Asked whenever the
   * school list is shown or a school opened, so an account the owner withdraws
   * is signed out on its next use. Offline the answer cannot be had, and the
   * books stay usable: the cloud refuses the account everything anyway.
   * Returns false - having signed this PC out - when it is no longer approved.
   */
  async stillApproved(): Promise<boolean> {
    if (!this.session) return false;
    try {
      const approved = await this.withSession((session) => this.backend.isApproved(session));
      if (!approved) this.forgetLocally();
      return approved;
    } catch (error) {
      if (error instanceof CloudError && error.code === "session-expired") return false;
      return true;
    }
  }

  /**
   * Sign out of this PC: the session and every cached school key are removed.
   * The cloud is told when it can be reached; offline, the local files going is
   * what matters - without them this PC can open nothing.
   */
  async signOut(): Promise<void> {
    const session = this.session;
    this.forgetLocally();
    if (session) {
      try {
        await this.backend.signOut(session);
      } catch {
        // Offline or already invalid. The refresh token dies with its expiry.
      }
    }
  }

  // ------------------------------------------------------ talking to cloud

  /**
   * Run a cloud call with a valid session, refreshing it first if it is about
   * to expire and once more if the server still says it has.
   *
   * If the cloud says the session is gone for good - the password was changed
   * elsewhere, or the account was removed - this PC is signed out, and the
   * CloudError("session-expired") propagates so the app shows the login.
   */
  async withSession<T>(call: (session: CloudSession) => Promise<T>): Promise<T> {
    let session = this.requireSession();
    if (session.expiresAt - this.now() / 1000 < REFRESH_MARGIN_SECONDS) {
      session = await this.refresh(session);
    }
    try {
      return await call(session);
    } catch (error) {
      if (!(error instanceof CloudError) || error.code !== "session-expired") throw error;
      return call(await this.refresh(session));
    }
  }

  // --------------------------------------------------------- school keys

  /** The key for a school: from this PC's cache, or fetched from the cloud once. */
  async keyFor(profileId: string): Promise<string> {
    const cached = this.cachedKey(profileId);
    if (cached) return cached;
    const key = await this.withSession((session) => this.backend.getProfileKey(session, profileId));
    this.rememberKey(profileId, key);
    return key;
  }

  cachedKey(profileId: string): string | null {
    const user = this.user;
    if (!user) return null;
    const cache = this.keyFile.read();
    return cache && cache.userId === user.id ? (cache.keys[profileId] ?? null) : null;
  }

  rememberKey(profileId: string, keyHex: string): void {
    const user = this.requireSession().user;
    const cache = this.keyFile.read();
    const keys = cache && cache.userId === user.id ? cache.keys : {};
    this.keyFile.write({ userId: user.id, keys: { ...keys, [profileId]: keyHex } });
  }

  forgetKey(profileId: string): void {
    const cache = this.keyFile.read();
    if (!cache) return;
    const { [profileId]: _gone, ...keys } = cache.keys;
    this.keyFile.write({ userId: cache.userId, keys });
  }

  // ------------------------------------------------------------- plumbing

  private requireSession(): CloudSession {
    if (!this.session) throw new CloudError("session-expired", "nobody is signed in");
    return this.session;
  }

  private async refresh(session: CloudSession): Promise<CloudSession> {
    try {
      const next = await this.backend.refresh(session);
      this.store(next);
      return next;
    } catch (error) {
      if (error instanceof CloudError && error.code === "session-expired") this.forgetLocally();
      throw error;
    }
  }

  /**
   * Let a fresh session in only when the owner has approved the account;
   * otherwise end it at once and say so. Nothing is stored on this PC for an
   * account that is not approved.
   */
  private async approved(session: CloudSession): Promise<CloudSession> {
    if (await this.backend.isApproved(session)) return session;
    try {
      await this.backend.signOut(session);
    } catch {
      // The session dies with its expiry anyway.
    }
    throw new CloudError("not-approved", `account ${session.user.email} is not approved`);
  }

  private adopt(session: CloudSession): CloudUser {
    // A different person on the same PC must not inherit the last one's keys.
    const previous = this.keyFile.read();
    if (previous && previous.userId !== session.user.id) this.keyFile.clear();
    this.store(session);
    return session.user;
  }

  private store(session: CloudSession): void {
    this.session = session;
    this.sessionFile.write(session);
  }

  private forgetLocally(): void {
    this.session = null;
    this.sessionFile.clear();
    this.keyFile.clear();
  }
}
