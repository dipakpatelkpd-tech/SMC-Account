/**
 * The whole Tally-style flow, with temporary folders as the PCs and the pen
 * drive and the fake cloud as the account's server.
 *
 *   PC 1 creates a school on the pen drive and enters data.
 *   The pen drive moves to PC 2, which opens the same books.
 *   The drive is pulled out mid-session and put back.
 *   The pen drive is "lost"; the school comes back from the cloud.
 *
 * Plus the refusals that make it safe: another account, another PC's lock,
 * a newer version's data, no internet on a PC that has never seen the school.
 */
import { afterAll, describe, expect, it } from "vitest";
import { copyFileSync, existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { AppController } from "../../src/server/app-controller.js";
import { PLAIN_BOX } from "../../src/server/cloud/account.js";
import { FakeCloud } from "../../src/server/cloud/fake.js";
import { booksFile, DATA_DIR_NAME, readSyncState } from "../../src/server/profiles/data-folder.js";
import { API_METHODS, MUTATING_METHODS, SESSION_METHODS, type AppStateDto } from "../../src/shared/api.js";
import { DEV_DB, MIGRATIONS, ManualTimers, cleanUpTemp, setupInput, tempDir } from "./helpers.js";

afterAll(cleanUpTemp);

const PASSWORD = "correct horse 1";

function world() {
  const timers = new ManualTimers();
  const codes: string[] = [];
  let offline = false;
  const cloud = new FakeCloud({
    dir: tempDir("cloud"),
    onCode: (_email, code) => codes.push(code),
    isOffline: () => offline,
    now: timers.clock,
  });
  let drives: string[] = [];
  const pc = (options: { legacy?: string } = {}) =>
    new AppController({
      userDataDir: tempDir("pc"),
      migrationsDir: MIGRATIONS,
      cloud: { backend: cloud, info: { kind: "fake", note: null } },
      secretBox: PLAIN_BOX,
      appVersion: "0.2.0",
      platform: "posix",
      roots: () => drives,
      legacyBooks: options.legacy ? { file: options.legacy, developmentCopy: false } : null,
      timers,
      now: timers.clock,
    });
  return {
    cloud,
    timers,
    pc,
    setOffline: (value: boolean) => (offline = value),
    plugIn: (...roots: string[]) => (drives = roots),
    lastCode: () => codes.at(-1)!,
  };
}

async function signUp(w: ReturnType<typeof world>, controller: AppController, email = "head@school.in") {
  const started = await controller.signUp(email, PASSWORD);
  expect(started).toEqual({ ok: true, data: { needsCode: true } });
  const verified = await controller.verifySignUp(email, w.lastCode());
  expect(verified.ok).toBe(true);
}

function phase(state: AppStateDto): string {
  return state.phase;
}

async function createSchool(controller: AppController, penDrive: string, diseCode = "24160299999") {
  const created = await controller.createSchool(penDrive, setupInput({ diseCode }));
  if (!created.ok) throw new Error(JSON.stringify(created.issues));
  return created.data;
}

describe("the contract", () => {
  it("wires every method exactly once", () => {
    expect(new Set(API_METHODS).size).toBe(API_METHODS.length);
    for (const method of SESSION_METHODS) expect(API_METHODS).toContain(method);
  });

  it("marks every write to the books as needing a backup", () => {
    const writes = API_METHODS.filter((method) =>
      /^(create|update|delete|save|close|apply|complete)/.test(method),
    ).filter((method) => !(SESSION_METHODS as readonly string[]).includes(method));
    expect([...MUTATING_METHODS].sort()).toEqual([...writes].sort());
  });
});

describe("one PC", () => {
  it("starts signed out, then lists no schools", async () => {
    const w = world();
    const pc1 = w.pc();
    expect(phase(pc1.getAppState())).toBe("signedOut");
    await signUp(w, pc1);
    expect(phase(pc1.getAppState())).toBe("chooseSchool");
    expect((await pc1.listSchools()).schools).toEqual([]);
  });

  it("creates a school in an SMC Accounts folder on the chosen drive, encrypted", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);

    const state = await createSchool(pc1, penDrive);
    expect(state.phase).toBe("open");
    if (state.phase !== "open") return;
    expect(state.needsSetup).toBe(false);
    expect(state.school.folder).toBe(path.join(penDrive, DATA_DIR_NAME, "24160299999"));

    const bytes = readFileSync(booksFile(state.school.folder));
    expect(bytes.subarray(0, 15).toString("latin1")).not.toBe("SQLite format 3");
    expect(bytes.includes(Buffer.from("11590100009999"))).toBe(false); // the bank account number

    const dashboard = await pc1.books!.getDashboard();
    expect(dashboard.school.nameGu).toBe("પરીક્ષા પ્રા. શાળા");
  });

  it("leaves nothing behind when the form is invalid or the internet is down", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    const pc1 = w.pc();
    await signUp(w, pc1);

    const invalid = await pc1.createSchool(penDrive, { ...setupInput(), school: { ...setupInput().school, diseCode: "" } });
    expect(invalid.ok).toBe(false);
    w.setOffline(true);
    const offline = await pc1.createSchool(penDrive, setupInput());
    expect(offline.ok).toBe(false);
    if (!offline.ok) expect(offline.issues[0]!.code).toBe("offline");
    expect(existsSync(path.join(penDrive, DATA_DIR_NAME))).toBe(false);
  });

  it("refuses the same school twice in one account", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);
    await createSchool(pc1, penDrive);
    const again = await pc1.createSchool(tempDir("other"), setupInput());
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.issues[0]!.code).toBe("school_exists");
  });

  it("manages several schools under one account", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);
    await createSchool(pc1, penDrive, "111");
    await createSchool(pc1, penDrive, "222");
    await pc1.closeSchool();
    const list = await pc1.listSchools();
    expect(list.schools.map((s) => s.diseCode).sort()).toEqual(["111", "222"]);
    expect(list.schools.every((s) => s.availability === "ready")).toBe(true);
  });
});

describe("moving the pen drive to another PC", () => {
  it("opens the same books on PC 2 after logging in there", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);
    const created = await createSchool(pc1, penDrive);
    if (created.phase !== "open") throw new Error("not open");
    const heads = await pc1.books!.listGrantHeads();
    const saved = await pc1.books!.createReceipt({
      date: "2026-05-10",
      grantHeadId: heads[0]!.id,
      amountPaise: 1234500,
      receivedFromGu: "SSA",
      modeGu: "ઓનલાઈન",
      bankLabelGu: "BOB અંતિસર",
    });
    expect(saved.ok).toBe(true);
    pc1.onBooksChanged();
    await pc1.closeSchool();

    // The drive comes back under a different name on PC 2.
    const renamed = tempDir("pendrive-f");
    renameSync(path.join(penDrive, DATA_DIR_NAME), path.join(renamed, DATA_DIR_NAME));
    w.plugIn(renamed);

    const pc2 = w.pc();
    expect(phase(pc2.getAppState())).toBe("signedOut");
    const signedIn = await pc2.signIn("head@school.in", PASSWORD);
    expect(signedIn.ok).toBe(true);

    const list = await pc2.listSchools();
    expect(list.schools).toHaveLength(1);
    expect(list.schools[0]!.availability).toBe("ready");

    const opened = await pc2.openSchool(created.school.profileId);
    expect(opened.ok && opened.data.opened).toBe(true);
    const receipts = await pc2.books!.listReceipts();
    expect(receipts.map((r) => r.amountPaise)).toEqual([1234500]);
  });

  it("needs the internet the first time a PC opens a school, and not after", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);
    const created = await createSchool(pc1, penDrive);
    if (created.phase !== "open") throw new Error("not open");
    await pc1.closeSchool();

    const pc2 = w.pc();
    await pc2.signIn("head@school.in", PASSWORD);
    w.setOffline(true);
    const first = await pc2.openSchool(created.school.profileId);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.issues[0]!.code).toBe("offline");

    w.setOffline(false);
    expect((await pc2.openSchool(created.school.profileId)).ok).toBe(true);
    await pc2.closeSchool();

    w.setOffline(true);
    const offline = await pc2.openSchool(created.school.profileId);
    expect(offline.ok && offline.data.opened).toBe(true);
  });

  it("warns when another PC still has it open, and can open anyway", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);
    const created = await createSchool(pc1, penDrive);
    if (created.phase !== "open") throw new Error("not open");
    // PC 1 never closes: the pen drive is pulled out with the app still open.

    const pc2 = w.pc();
    await pc2.signIn("head@school.in", PASSWORD);
    const locked = await pc2.openSchool(created.school.profileId);
    expect(locked.ok && !locked.data.opened && locked.data.lockedBy.deviceName).toBeTruthy();
    const forced = await pc2.openSchool(created.school.profileId, { force: true });
    expect(forced.ok && forced.data.opened).toBe(true);
  });

  it("will not open another account's school", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1, "one@school.in");
    const created = await createSchool(pc1, penDrive);
    if (created.phase !== "open") throw new Error("not open");
    await pc1.closeSchool();

    const stranger = w.pc();
    await signUp(w, stranger, "two@school.in");
    const inspected = stranger.inspectFolder(penDrive);
    expect(inspected.ok && inspected.data.schools[0]!.ownedByMe).toBe(false);
    const opened = await stranger.openSchool(created.school.profileId, { folder: created.school.folder });
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.issues[0]!.code).toBe("other_account");
  });
});

describe("pulling the pen drive out", () => {
  it("closes the books at once and reopens them when the drive is back", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);
    const created = await createSchool(pc1, penDrive);
    if (created.phase !== "open") throw new Error("not open");

    const away = tempDir("in-a-pocket");
    renameSync(path.join(penDrive, DATA_DIR_NAME), path.join(away, DATA_DIR_NAME));
    expect(pc1.checkDataPresent()).toBe(false);
    expect(phase(pc1.getAppState())).toBe("dataMissing");
    expect(pc1.books).toBeNull();
    expect((await pc1.reconnectSchool()).ok).toBe(false);

    // Back in, as another drive letter.
    w.plugIn(away);
    const back = await pc1.reconnectSchool();
    expect(back.ok && back.data.phase).toBe("open");
    expect((await pc1.books!.getDashboard()).school.diseCode).toBe("24160299999");
  });
});

describe("cloud backups and restoring", () => {
  it("backs up a new school at once, and a lost pen drive loses nothing", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);
    const created = await createSchool(pc1, penDrive);
    if (created.phase !== "open") throw new Error("not open");
    expect(readSyncState(created.school.folder).pendingSince).not.toBeNull();
    const sent = await pc1.backupNow();
    expect(sent.ok && sent.data.state).toBe("upToDate");
    await pc1.closeSchool();

    // The pen drive is lost.
    w.plugIn();
    const pc2 = w.pc();
    await pc2.signIn("head@school.in", PASSWORD);
    const list = await pc2.listSchools();
    expect(list.schools[0]!.availability).toBe("notOnThisPc");

    const backups = await pc2.listCloudBackups(created.school.profileId);
    if (!backups.ok) throw new Error("no backups");
    const newDrive = tempDir("new-pendrive");
    const restored = await pc2.restoreSchool(created.school.profileId, backups.data[0]!.id, newDrive);
    if (!restored.ok) throw new Error(JSON.stringify(restored.issues));
    expect(restored.data.phase).toBe("open");
    expect((await pc2.books!.getDashboard()).school.nameGu).toBe("પરીક્ષા પ્રા. શાળા");
  });

  it("restores an earlier backup over the open books, keeping a local copy first", async () => {
    const w = world();
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc();
    await signUp(w, pc1);
    const created = await createSchool(pc1, penDrive);
    if (created.phase !== "open") throw new Error("not open");
    await pc1.backupNow();

    const heads = await pc1.books!.listGrantHeads();
    await pc1.books!.createReceipt({
      date: "2026-05-10",
      grantHeadId: heads[0]!.id,
      amountPaise: 500,
      receivedFromGu: "a mistake",
      modeGu: "ઓનલાઈન",
      bankLabelGu: "BOB",
    });
    expect(await pc1.books!.listReceipts()).toHaveLength(1);

    const backups = await pc1.listCloudBackups(created.school.profileId);
    if (!backups.ok) throw new Error("no backups");
    const restored = await pc1.restoreBackup(backups.data.at(-1)!.id);
    expect(restored.ok).toBe(true);
    expect(await pc1.books!.listReceipts()).toHaveLength(0);
  });
});

describe("the books from before schools had folders", () => {
  it("are encrypted into a school folder and reproduce the sample year exactly", async () => {
    const w = world();
    const pcData = tempDir("old-install");
    const legacy = path.join(pcData, "smc-accounts.db");
    copyFileSync(DEV_DB, legacy);
    const penDrive = tempDir("pendrive");
    w.plugIn(penDrive);
    const pc1 = w.pc({ legacy });
    await signUp(w, pc1);

    const list = await pc1.listSchools();
    expect(list.legacyBooks?.schoolNameGu).toBeTruthy();

    const moved = await pc1.moveLegacyBooks(penDrive);
    if (!moved.ok) throw new Error(JSON.stringify(moved.issues));
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(`${legacy}.moved`)).toBe(true);

    const report = await pc1.books!.getAnnexure10();
    // expected_results.annexure_10_totals, in paise.
    expect(report.totals).toEqual({
      openingPaise: 1299800,
      receivedPaise: 2941700,
      totalPaise: 4241500,
      spentPaise: 3976300,
      returnedPaise: 249800,
      totalOutPaise: 4226100,
      closingPaise: 15400,
    });

    // And the same after a round trip through the cloud.
    await pc1.backupNow();
    const state = pc1.getAppState();
    if (state.phase !== "open") throw new Error("not open");
    const backups = await pc1.listCloudBackups(state.school.profileId);
    if (!backups.ok) throw new Error("no backups");
    await pc1.closeSchool();
    w.plugIn();
    const pc2 = w.pc();
    await pc2.signIn("head@school.in", PASSWORD);
    const restored = await pc2.restoreSchool(state.school.profileId, backups.data[0]!.id, tempDir("new-pendrive"));
    if (!restored.ok) throw new Error(JSON.stringify(restored.issues));
    expect((await pc2.books!.getAnnexure10()).totals).toEqual(report.totals);
  });
});
