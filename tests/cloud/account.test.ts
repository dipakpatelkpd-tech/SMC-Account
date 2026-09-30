/**
 * The account on a PC: signing up with an emailed code, staying signed in
 * offline, refreshing, losing the session when the password changes elsewhere,
 * and the school keys cached per user.
 */
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Account, PLAIN_BOX } from "../../src/server/cloud/account.js";
import { FakeCloud } from "../../src/server/cloud/fake.js";
import { CloudError } from "../../src/server/cloud/types.js";
import { generateKeyHex } from "../../src/server/vault.js";
import { cleanUpTemp, tempDir } from "./helpers.js";

afterAll(cleanUpTemp);

function world(options: { accessTokenSeconds?: number } = {}) {
  const codes: { email: string; code: string; purpose: string }[] = [];
  let offline = false;
  let now = Date.parse("2026-06-01T10:00:00Z");
  const cloud = new FakeCloud({
    dir: tempDir("cloud"),
    onCode: (email, code, purpose) => codes.push({ email, code, purpose }),
    isOffline: () => offline,
    accessTokenSeconds: options.accessTokenSeconds,
    now: () => now,
  });
  const pc = (dir = tempDir("pc")) => ({ dir, account: new Account(cloud, dir, PLAIN_BOX, () => now) });
  return {
    cloud,
    codes,
    pc,
    setOffline: (value: boolean) => (offline = value),
    advance: (ms: number) => (now += ms),
    lastCode: () => codes.at(-1)!.code,
  };
}

async function signedUp(w: ReturnType<typeof world>, email = "head@school.in") {
  const pc = w.pc();
  expect(await pc.account.signUp(email, "correct horse 1")).toBeNull();
  await pc.account.verifySignUp(email, w.lastCode());
  return pc;
}

describe("signing up", () => {
  it("needs the emailed code before the account can be used", async () => {
    const w = world();
    const pc = w.pc();
    await pc.account.signUp("head@school.in", "correct horse 1");
    expect(pc.account.user).toBeNull();
    await expect(pc.account.signIn("head@school.in", "correct horse 1")).rejects.toMatchObject({
      code: "email-not-confirmed",
    });
    await expect(pc.account.verifySignUp("head@school.in", "000000")).rejects.toMatchObject({ code: "invalid-code" });
    const user = await pc.account.verifySignUp("head@school.in", w.lastCode());
    expect(user.email).toBe("head@school.in");
  });

  it("refuses a short password and a second account for the same email", async () => {
    const w = world();
    await expect(w.pc().account.signUp("a@b.in", "short")).rejects.toMatchObject({ code: "weak-password" });
    await signedUp(w, "a@b.in");
    await expect(w.pc().account.signUp("a@b.in", "another pass 2")).rejects.toMatchObject({ code: "user-exists" });
  });
});

describe("staying signed in", () => {
  it("survives the app restarting, with no internet", async () => {
    const w = world();
    const first = await signedUp(w);
    w.setOffline(true);
    const again = new Account(w.cloud, first.dir, PLAIN_BOX);
    expect(again.user?.email).toBe("head@school.in");
  });

  it("stores no password on the PC", async () => {
    const w = world();
    const pc = await signedUp(w);
    const stored = readFileSync(path.join(pc.dir, "session.bin"), "utf8");
    expect(stored).not.toContain("correct horse");
  });

  it("refreshes the access token before it runs out", async () => {
    const w = world({ accessTokenSeconds: 300 });
    const pc = await signedUp(w);
    w.advance(400 * 1000);
    const profiles = await pc.account.withSession((session) => w.cloud.listProfiles(session));
    expect(profiles).toEqual([]);
  });

  it("keeps the session when offline, and says so", async () => {
    const w = world({ accessTokenSeconds: 60 });
    const pc = await signedUp(w);
    w.setOffline(true);
    w.advance(120 * 1000);
    await expect(pc.account.withSession((s) => w.cloud.listProfiles(s))).rejects.toMatchObject({ code: "offline" });
    expect(pc.account.user).not.toBeNull();
  });

  it("is signed out on every other PC when the password is reset", async () => {
    const w = world();
    const office = await signedUp(w);
    const home = w.pc();
    await home.account.signIn("head@school.in", "correct horse 1");

    await office.account.requestPasswordReset("head@school.in");
    await office.account.completePasswordReset("head@school.in", w.lastCode(), "new password 3");

    w.advance(2 * 60 * 60 * 1000); // the old access token expires too
    await expect(home.account.withSession((s) => w.cloud.listProfiles(s))).rejects.toBeInstanceOf(CloudError);
    expect(home.account.user).toBeNull();
    expect(existsSync(path.join(home.dir, "session.bin"))).toBe(false);
    await expect(office.account.withSession((s) => w.cloud.listProfiles(s))).resolves.toEqual([]);
  });
});

describe("school keys on a PC", () => {
  it("are fetched once, then work offline", async () => {
    const w = world();
    const pc = await signedUp(w);
    const key = generateKeyHex();
    await pc.account.withSession((s) =>
      w.cloud.createProfile(s, { id: "5f8a1f2e-0000-4000-8000-000000000001", schoolNameGu: "શાળા", diseCode: "1", keyHex: key }),
    );
    const other = w.pc();
    await other.account.signIn("head@school.in", "correct horse 1");
    expect(await other.account.keyFor("5f8a1f2e-0000-4000-8000-000000000001")).toBe(key);
    w.setOffline(true);
    expect(await other.account.keyFor("5f8a1f2e-0000-4000-8000-000000000001")).toBe(key);
  });

  it("are not handed to a different person who signs in on the same PC", async () => {
    const w = world();
    const pc = await signedUp(w, "one@school.in");
    pc.account.rememberKey("some-school", generateKeyHex());
    await signedUp(w, "two@school.in");
    await pc.account.signIn("two@school.in", "correct horse 1");
    expect(pc.account.cachedKey("some-school")).toBeNull();
  });

  it("are removed from the PC by signing out", async () => {
    const w = world();
    const pc = await signedUp(w);
    pc.account.rememberKey("some-school", generateKeyHex());
    await pc.account.signOut();
    expect(pc.account.user).toBeNull();
    expect(existsSync(path.join(pc.dir, "keys.bin"))).toBe(false);
  });

  it("cannot be read by another account in the cloud", async () => {
    const w = world();
    const owner = await signedUp(w, "one@school.in");
    await owner.account.withSession((s) =>
      w.cloud.createProfile(s, { id: "5f8a1f2e-0000-4000-8000-000000000002", schoolNameGu: "શાળા", diseCode: "2", keyHex: generateKeyHex() }),
    );
    const stranger = await signedUp(w, "two@school.in");
    await expect(stranger.account.keyFor("5f8a1f2e-0000-4000-8000-000000000002")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
