/**
 * The bridge between the renderer and the main process.
 *
 * The renderer runs with contextIsolation on and no Node access, so this file is
 * the entire surface it can reach. Each AccountsApi method becomes one function
 * that forwards to its IPC channel - no generic "invoke anything" escape hatch,
 * which would hand a compromised page the whole main process.
 */
import { contextBridge, ipcRenderer } from "electron";
import { API_METHODS, channelFor } from "../src/shared/api.js";

const api = Object.fromEntries(
  API_METHODS.map((method) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(channelFor(method), ...args),
  ]),
);

contextBridge.exposeInMainWorld("accounts", api);
