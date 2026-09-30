import { describe, expect, it } from "vitest";
import { MAX_PER_FIELD, STORAGE_KEY, SuggestionStore, normalise } from "../src/renderer/suggestions/store.js";

/** A Storage that lives in a Map - the PC's localStorage, without the PC. */
function memory(): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe("suggestion store", () => {
  it("offers what was recorded, most used first", () => {
    const store = new SuggestionStore(memory());
    store.record("vendor.name", "શ્રી રામ સ્ટેશનરી");
    store.record("vendor.name", "જય અંબે સ્ટોર");
    store.record("vendor.name", "જય અંબે સ્ટોર");
    expect(store.suggest("vendor.name", "")).toEqual(["જય અંબે સ્ટોર", "શ્રી રામ સ્ટેશનરી"]);
  });

  it("keeps a separate list for each kind of field", () => {
    const store = new SuggestionStore(memory());
    store.record("vendor.name", "Ram Stationery");
    store.record("school.taluka", "Anand");
    expect(store.suggest("school.taluka", "")).toEqual(["Anand"]);
    expect(store.suggest("bank.name", "")).toEqual([]);
  });

  it("shares one list between stores over the same storage - every school, every account", () => {
    const storage = memory();
    new SuggestionStore(storage).record("vendor.name", "Ram Stationery");
    // A later session, another school open: a fresh store on the same PC.
    expect(new SuggestionStore(storage).suggest("vendor.name", "ra")).toEqual(["Ram Stationery"]);
  });

  it("matches by prefix, then by word, then anywhere", () => {
    const store = new SuggestionStore(memory());
    store.record("f", "Sharma Traders");
    store.record("f", "Ram Sharma");
    store.record("f", "Harsharma");
    expect(store.suggest("f", "sha")).toEqual(["Sharma Traders", "Ram Sharma", "Harsharma"]);
  });

  it("ignores case in Latin letters and matches Gujarati as typed", () => {
    const store = new SuggestionStore(memory());
    store.record("f", "Ram Stationery");
    store.record("f", "આણંદ");
    expect(store.suggest("f", "RAM")).toEqual(["Ram Stationery"]);
    expect(store.suggest("f", "આ")).toEqual(["આણંદ"]);
  });

  it("does not offer the value that is already typed", () => {
    const store = new SuggestionStore(memory());
    store.record("f", "Anand");
    store.record("f", "Anand Nagar");
    // The exact value is not a suggestion: nothing left to complete.
    expect(store.suggest("f", "Anand")).toEqual(["Anand Nagar"]);
  });

  it("counts one value once however it was typed", () => {
    const store = new SuggestionStore(memory());
    store.record("f", "  Ram   Stationery ");
    store.record("f", "ram stationery");
    expect(store.suggest("f", "")).toEqual(["ram stationery"]); // the latest spelling
    expect(normalise("  a \n b ")).toBe("a b");
  });

  it("treats composed and decomposed Unicode as the same text", () => {
    const store = new SuggestionStore(memory());
    store.record("f", "caf\u00e9");
    store.record("f", "cafe\u0301");
    expect(store.suggest("f", "")).toHaveLength(1);
  });

  it("never records blank or oversized values", () => {
    const store = new SuggestionStore(memory());
    store.record("f", "   ");
    store.record("f", "x".repeat(301));
    expect(store.suggest("f", "")).toEqual([]);
  });

  it("favours recent use over old use", () => {
    let now = 0;
    const store = new SuggestionStore(memory(), () => now);
    store.record("f", "old favourite");
    store.record("f", "old favourite");
    now += 60 * DAY;
    store.record("f", "new one");
    expect(store.suggest("f", "")[0]).toBe("new one");
  });

  it("forgets a value on request", () => {
    const store = new SuggestionStore(memory());
    store.record("f", "typo");
    store.record("f", "fine");
    store.remove("f", "TYPO");
    expect(store.suggest("f", "")).toEqual(["fine"]);
  });

  it("is bounded per field, dropping the least used", () => {
    const store = new SuggestionStore(memory());
    store.record("f", "keeper");
    store.record("f", "keeper");
    for (let n = 0; n < MAX_PER_FIELD + 20; n++) store.record("f", `value ${n}`);
    expect(store.suggest("f", "keep", 1)).toEqual(["keeper"]);
    expect(store.suggest("f", "", 1000).length).toBeLessThanOrEqual(MAX_PER_FIELD);
  });

  it("limits how many it offers", () => {
    const store = new SuggestionStore(memory());
    for (let n = 0; n < 20; n++) store.record("f", `item ${n}`);
    expect(store.suggest("f", "")).toHaveLength(8);
    expect(store.suggest("f", "", 3)).toHaveLength(3);
  });

  it("survives unreadable or missing storage", () => {
    const broken = memory();
    broken.data.set(STORAGE_KEY, "{not json");
    const store = new SuggestionStore(broken);
    expect(store.suggest("f", "")).toEqual([]);
    store.record("f", "again");
    expect(store.suggest("f", "")).toEqual(["again"]);

    const none = new SuggestionStore(null);
    none.record("f", "x");
    expect(none.suggest("f", "")).toEqual([]);

    const full = new SuggestionStore({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => full.record("f", "x")).not.toThrow();
  });
});
