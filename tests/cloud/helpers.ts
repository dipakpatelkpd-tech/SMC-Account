/**
 * Shared scaffolding for the account, school-folder and backup tests: temporary
 * folders standing in for PCs and pen drives, a clock and timers the test
 * controls, and a valid setup form.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_GRANT_HEADS } from "../../src/lib/default-grant-heads.js";
import { rupeesToPaise } from "../../src/lib/money.js";
import type { Timers } from "../../src/server/backup/cloud-backups.js";
import type { SetupInput } from "../../src/shared/api.js";

export const MIGRATIONS = path.join(process.cwd(), "prisma", "migrations");
export const DEV_DB = path.join(process.cwd(), "prisma", "dev.db");

const made: string[] = [];

/** A fresh empty folder, removed by `cleanUpTemp`. */
export function tempDir(label: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `smc-${label}-`));
  made.push(dir);
  return dir;
}

export function cleanUpTemp(): void {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** Timers that only fire when the test says time has passed. */
export class ManualTimers implements Timers {
  now = Date.parse("2026-06-01T10:00:00Z");
  private pending: { id: number; at: number; callback: () => void }[] = [];
  private next = 1;

  readonly clock = (): number => this.now;

  set(callback: () => void, ms: number): unknown {
    const id = this.next++;
    this.pending.push({ id, at: this.now + ms, callback });
    return id;
  }

  clear(handle: unknown): void {
    this.pending = this.pending.filter((timer) => timer.id !== handle);
  }

  /** When the next timer is due, or null. */
  nextDue(): number | null {
    return this.pending.length === 0 ? null : Math.min(...this.pending.map((timer) => timer.at));
  }

  advance(ms: number): void {
    this.now += ms;
    const due = this.pending.filter((timer) => timer.at <= this.now);
    this.pending = this.pending.filter((timer) => timer.at > this.now);
    for (const timer of due) timer.callback();
  }
}

export function setupInput(overrides: { nameGu?: string; diseCode?: string } = {}): SetupInput {
  const nameGu = overrides.nameGu ?? "પરીક્ષા પ્રા. શાળા";
  return {
    school: {
      nameGu,
      smcLabelGu: `SMCE ${nameGu}`,
      diseCode: overrides.diseCode ?? "24160299999",
      clusterGu: "પરીક્ષા ક્લસ્ટર",
      talukaGu: "કપડવંજ",
      districtGu: "ખેડા",
      programmeGu: "સમગ્ર શિક્ષા ખેડા – SMCE",
      memberSecretaryGu: "પટેલ રમેશભાઈ",
      memberSecretaryShortGu: "સભ્ય સચિવ રમેશ.પટેલ",
      memberSecretaryMobile: null,
    },
    bank: { bankNameGu: "Bank of Baroda (BOB)", branchGu: "અંતિસર", accountNo: "11590100009999" },
    year: { label: "2026-27", startDate: "", endDate: "" },
    grantHeads: DEFAULT_GRANT_HEADS.map((head) => ({ ...head })),
    openingBalances: [{ code: "SWACHHATA", bankPaise: rupeesToPaise(2000), cashPaise: 0 }],
  };
}
