/**
 * The renderer's handle on the data.
 *
 * Screens import `api` from here and nothing else. Today it is the Electron
 * bridge; swapping in a fetch-based implementation for a website means changing
 * this one file, because everything above depends only on the AccountsApi type.
 */
import type { AccountsApi } from "../shared/api.js";

declare global {
  interface Window {
    accounts?: AccountsApi;
  }
}

function bridge(): AccountsApi {
  const found = window.accounts;
  if (!found) {
    throw new Error(
      "The accounts bridge is missing. The preload script did not run - check electron/preload.ts.",
    );
  }
  return found;
}

/** A proxy so screens can call api.listReceipts() before the bridge exists. */
export const api: AccountsApi = new Proxy({} as AccountsApi, {
  get(_target, method: string) {
    return (...args: unknown[]) => {
      const fn = bridge()[method as keyof AccountsApi] as (...a: unknown[]) => unknown;
      return fn(...args);
    };
  },
});
