import { describe, expect, it } from "vitest";
import { SuggestionStore, normalise } from "../src/renderer/suggestions/store.js";
import { MAX_PER_FIELD, fingerprint, mergeRows, validRows, type SuggestionRow } from "../src/shared/suggestions.js";

const DAY = 24 * 60 * 60 * 1000;
const row = (field: string, value: string, count: number, last: number, removed?: number): SuggestionRow => ({
  field,
  value,
  count,
  last,
  ...(removed === undefined ? {} : { removed }),
});

describe("suggestion store", () => {
  it("offers what was recorded, most used first", () => {
    const store = new SuggestionStore();
    store.record("vendor.name", "શ્રી રામ સ્ટેશનરી");
    store.record("vendor.name", "જય અંબે સ્ટોર");
    store.record("vendor.name", "જય અંબે સ્ટોર");
    expect(store.suggest("vendor.name", "")).toEqual(["જય અંબે સ્ટોર", "શ્રી રામ સ્ટેશનરી"]);
  });

  it("keeps a separate list for each kind of field", () => {
    const store = new SuggestionStore();
    store.record("vendor.name", "Ram Stationery");
    store.record("school.taluka", "Anand");
    expect(store.suggest("school.taluka", "")).toEqual(["Anand"]);
    expect(store.suggest("vendor.name", "anand")).toEqual([]);
  });

  it("offers the built-in bank branches after the school's own, and forgets them when asked", () => {
    const store = new SuggestionStore();
    expect(store.suggest("bank.name", "")).toEqual(["BOB કડાણા", "BOB અનાસ", "BOB સિમલી", "BOB સેલંબા"]);
    store.record("bank.name", "BOB અંતિસર");
    store.record("bank.name", "BOB સિમલી");
    expect(store.suggest("bank.name", "")).toEqual(["BOB અંતિસર", "BOB સિમલી", "BOB કડાણા", "BOB અનાસ", "BOB સેલંબા"]);
    expect(store.suggest("bank.name", "bob સે")).toEqual(["BOB સેલંબા"]);
    store.remove("bank.name", "BOB કડાણા");
    expect(store.suggest("bank.name", "")).not.toContain("BOB કડાણા");
    // Forgotten on this PC is forgotten on the others too: it travels as a row.
    expect(store.export().some((each) => each.value === "BOB કડાણા" && each.removed !== undefined)).toBe(true);
  });

  it("matches by prefix, then by word, then anywhere", () => {
    const store = new SuggestionStore();
    store.record("f", "Sharma Traders");
    store.record("f", "Ram Sharma");
    store.record("f", "Harsharma");
    expect(store.suggest("f", "sha")).toEqual(["Sharma Traders", "Ram Sharma", "Harsharma"]);
  });

  it("ignores case in Latin letters and matches Gujarati as typed", () => {
    const store = new SuggestionStore();
    store.record("f", "Ram Stationery");
    store.record("f", "આણંદ");
    expect(store.suggest("f", "RAM")).toEqual(["Ram Stationery"]);
    expect(store.suggest("f", "આ")).toEqual(["આણંદ"]);
  });

  it("does not offer the value that is already typed", () => {
    const store = new SuggestionStore();
    store.record("f", "Anand");
    store.record("f", "Anand Nagar");
    expect(store.suggest("f", "Anand")).toEqual(["Anand Nagar"]);
  });

  it("counts one value once however it was typed", () => {
    const store = new SuggestionStore();
    store.record("f", "  Ram   Stationery ");
    store.record("f", "ram stationery");
    expect(store.suggest("f", "")).toEqual(["ram stationery"]); // the latest spelling
    expect(store.export()).toHaveLength(1);
    expect(normalise("  a \n b ")).toBe("a b");
  });

  it("treats composed and decomposed Unicode as the same text", () => {
    const store = new SuggestionStore();
    store.record("f", "café");
    store.record("f", "café");
    expect(store.suggest("f", "")).toHaveLength(1);
  });

  it("never records blank or oversized values", () => {
    const store = new SuggestionStore();
    store.record("f", "   ");
    store.record("f", "x".repeat(301));
    expect(store.suggest("f", "")).toEqual([]);
  });

  it("favours recent use over old use", () => {
    let now = 0;
    const store = new SuggestionStore(() => now);
    store.record("f", "old favourite");
    store.record("f", "old favourite");
    now += 60 * DAY;
    store.record("f", "new one");
    expect(store.suggest("f", "")[0]).toBe("new one");
  });

  it("is bounded per field, dropping the least used", () => {
    const store = new SuggestionStore();
    store.record("f", "keeper");
    store.record("f", "keeper");
    for (let n = 0; n < MAX_PER_FIELD + 20; n++) store.record("f", `value ${n}`);
    expect(store.suggest("f", "keep", 1)).toEqual(["keeper"]);
    expect(store.suggest("f", "", 1000).length).toBeLessThanOrEqual(MAX_PER_FIELD);
  });

  it("limits how many it offers", () => {
    const store = new SuggestionStore();
    for (let n = 0; n < 20; n++) store.record("f", `item ${n}`);
    expect(store.suggest("f", "")).toHaveLength(8);
    expect(store.suggest("f", "", 3)).toHaveLength(3);
  });

  it("tells listeners about typing and forgetting, not about a merge", () => {
    const store = new SuggestionStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.record("f", "a");
    store.remove("f", "a");
    expect(calls).toBe(2);
    store.merge([row("f", "b", 1, 5)]);
    expect(calls).toBe(2);
  });

  it("clears everything", () => {
    const store = new SuggestionStore();
    store.record("f", "a");
    store.clear();
    expect(store.export()).toEqual([]);
  });
});

describe("forgetting a suggestion", () => {
  it("stops offering it", () => {
    const store = new SuggestionStore();
    store.record("f", "typo");
    store.record("f", "fine");
    store.remove("f", "TYPO");
    expect(store.suggest("f", "")).toEqual(["fine"]);
  });

  it("stays forgotten when another copy still has it", () => {
    let now = 1_000;
    const here = new SuggestionStore(() => now);
    here.record("f", "typo");
    const other = here.export(); // the pen drive's copy, from before
    now += 1_000;
    here.remove("f", "typo");
    here.merge(other);
    expect(here.suggest("f", "")).toEqual([]);
  });

  it("is live again when used after being forgotten", () => {
    let now = 1_000;
    const store = new SuggestionStore(() => now);
    store.record("f", "vendor");
    store.record("f", "vendor");
    now += 1_000;
    store.remove("f", "vendor");
    now += 1_000;
    store.record("f", "vendor");
    expect(store.suggest("f", "")).toEqual(["vendor"]);
    expect(store.export()[0]).toMatchObject({ count: 1 });
    expect(store.export()[0]).not.toHaveProperty("removed");
  });
});

describe("merging two copies", () => {
  const NOW = 100 * DAY;

  it("takes the larger count and the later use - never adds", () => {
    const merged = mergeRows([row("f", "Ram", 3, 10)], [row("f", "ram", 5, 20)], NOW);
    expect(merged).toEqual([row("f", "ram", 5, 20)]);
    // Merging the same copy again changes nothing: a school opened twice does not double the counts.
    expect(mergeRows(merged, merged, NOW)).toEqual(merged);
  });

  it("gives the same answer whichever copy is merged into which", () => {
    const a = [row("f", "one", 2, 10), row("f", "two", 1, 30, 40), row("g", "x", 4, 5)];
    const b = [row("f", "one", 1, 50), row("f", "two", 3, 20), row("h", "y", 1, 1)];
    expect(fingerprint(mergeRows(a, b, NOW))).toBe(fingerprint(mergeRows(b, a, NOW)));
  });

  it("joins the lists of two schools", () => {
    const merged = mergeRows([row("vendor.name", "Ram", 1, 1)], [row("vendor.name", "Jay", 1, 2), row("bank.name", "BOB", 1, 3)], NOW);
    expect(merged.map((r) => r.value).sort()).toEqual(["BOB", "Jay", "Ram"]);
  });

  it("forgets a value that was forgotten after its last use, and keeps one used since", () => {
    const merged = mergeRows(
      [row("f", "gone", 2, 10, 20), row("f", "back", 2, 10, 20)],
      [row("f", "gone", 5, 15), row("f", "back", 1, 30)],
      NOW,
    );
    expect(merged.find((r) => r.value === "gone")).toMatchObject({ removed: 20 });
    expect(merged.find((r) => r.value === "back")).not.toHaveProperty("removed");
  });

  it("lets go of forgotten values after half a year", () => {
    const old = row("f", "gone", 1, 1, 1);
    expect(mergeRows([old], [], 1 + 100 * DAY)).toHaveLength(1);
    expect(mergeRows([old], [], 1 + 200 * DAY)).toHaveLength(0);
  });
});

describe("rows from outside", () => {
  it("keeps the valid ones and drops the rest", () => {
    const rows = validRows([
      row("f", "  ok  ", 1, 1),
      { field: "", value: "no field", count: 1, last: 1 },
      { field: "f", value: "x".repeat(400), count: 1, last: 1 },
      { field: "f", value: "negative", count: -1, last: 1 },
      { field: "f", value: "float", count: 1.5, last: 1 },
      "junk",
      null,
    ]);
    expect(rows).toEqual([row("f", "ok", 1, 1)]);
    expect(validRows("not a list")).toEqual([]);
  });
});
