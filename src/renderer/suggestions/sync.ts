/**
 * Keeping the suggestions in the school's books.
 *
 * The store lives in memory (store.ts); this is what saves it to, and reads it
 * from, whichever school is open - through the books' `syncSuggestions`, which
 * merges the two and saves the result in the school's database. So they travel
 * on the pen drive to any other PC, and cost the PC nothing to keep.
 *
 * Opening a school merges its saved suggestions in and this session's out, so
 * what was typed for one school is offered in the next one opened. Typing or
 * forgetting something saves soon after; a save that finds no school open
 * (the pen drive pulled out) is skipped, and simply happens with the next.
 */
import { api } from "../api.js";
import { SuggestionStore } from "./store.js";

/** The one list the whole app suggests from. */
export const suggestionStore = new SuggestionStore();

/**
 * A version of the app that kept them in this PC's localStorage: take what is
 * there into the store, and delete it - the PC should keep nothing.
 */
const LEGACY_KEY = "smc.suggestions.v1";

function takeLegacyFromThisPc(): void {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw === null) return;
    window.localStorage.removeItem(LEGACY_KEY);
    const old: unknown = JSON.parse(raw);
    if (old === null || typeof old !== "object") return;
    const now = Date.now();
    const rows = Object.entries(old as Record<string, unknown>).flatMap(([field, list]) =>
      Array.isArray(list)
        ? list.flatMap((entry) =>
            typeof entry?.value === "string"
              ? [{ field, value: entry.value, count: Number(entry.count) || 1, last: Number(entry.last) || now }]
              : [],
          )
        : [],
    );
    suggestionStore.merge(rows);
  } catch {
    // Unreadable or no storage: nothing to bring over.
  }
}
if (typeof window !== "undefined") takeLegacyFromThisPc();

/** Save after typing has paused this long; a word at a time, not a letter. */
const SAVE_AFTER_MS = 800;

let timer: number | undefined;

/** Merge with the open school's books now. Never throws: it is a convenience. */
export async function syncSuggestions(): Promise<void> {
  timer = undefined;
  try {
    suggestionStore.merge(await api.syncSuggestions(suggestionStore.export()));
  } catch (cause) {
    // No school open, or its drive is out: the suggestions stay in memory and
    // are merged into the next school opened. Said in the console, so a real
    // failure (an old Prisma client without the Suggestion table) is not silent.
    console.warn("suggestions were not saved to the books:", cause);
  }
}

/** Save now if a save is waiting - before the school is closed. */
export async function flushSuggestions(): Promise<void> {
  if (timer === undefined) return;
  window.clearTimeout(timer);
  await syncSuggestions();
}

/**
 * Signing out: save what is waiting, then forget it all. The list belongs to
 * the schools' books, not to whoever is sitting here, so the next account to
 * sign in on this PC must not inherit it.
 */
export async function endSuggestionSession(): Promise<void> {
  await flushSuggestions();
  if (timer !== undefined) window.clearTimeout(timer);
  timer = undefined;
  suggestionStore.clear();
}

/**
 * While a school's books are open: merge now, and again soon after each change.
 * Returns the function that stops.
 */
export function startSuggestionSync(): () => void {
  void syncSuggestions();
  const stopWatching = suggestionStore.subscribe(() => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => void syncSuggestions(), SAVE_AFTER_MS);
  });
  const onHide = (): void => void flushSuggestions();
  window.addEventListener("pagehide", onHide);
  return () => {
    stopWatching();
    window.removeEventListener("pagehide", onHide);
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };
}
