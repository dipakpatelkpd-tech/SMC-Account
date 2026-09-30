/**
 * Finding a school's folder again when the pen drive comes back under a
 * different name.
 *
 * Windows gives a pen drive whichever letter is free: E: on one PC, F: on the
 * next, G: when a phone is also plugged in. A remembered path like
 * `E:\SMC Accounts\24160203401` is therefore only a hint. A school is identified
 * by the profile id in its manifest, and this module tries the same path on
 * every other drive before giving up.
 *
 * The functions take the platform and the list of mounted roots as arguments,
 * so the logic can be tested on any machine.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { findProfilesIn, readManifest, type FoundProfile } from "./data-folder.js";

export type Platform = "win32" | "posix";

/**
 * Split a path into the removable-drive root and the rest.
 *
 *   E:\Work\SMC Accounts\241602      -> ["E:\", "Work\SMC Accounts\241602"]
 *   /media/rahul/PENDRIVE/SMC Accounts/241602
 *                                    -> ["/media/rahul/PENDRIVE", "SMC Accounts/241602"]
 *
 * Returns null for a path that is not on a drive we know how to re-find - a
 * folder in the user's home directory stays where it is.
 */
export function splitDriveRoot(folder: string, platform: Platform): [string, string] | null {
  if (platform === "win32") {
    const match = /^([A-Za-z]):[\\/](.*)$/.exec(folder);
    return match ? [`${match[1]!.toUpperCase()}:\\`, match[2]!] : null;
  }
  const match =
    /^(\/(?:run\/)?media\/[^/]+\/[^/]+|\/mnt\/[^/]+|\/Volumes\/[^/]+)(?:\/(.*))?$/.exec(folder);
  return match ? [match[1]!, match[2] ?? ""] : null;
}

/** The roots a pen drive could appear under right now. */
export function mountedRoots(platform: Platform): string[] {
  if (platform === "win32") {
    const roots: string[] = [];
    for (let code = "A".charCodeAt(0); code <= "Z".charCodeAt(0); code += 1) {
      const root = `${String.fromCharCode(code)}:\\`;
      if (existsSync(root)) roots.push(root);
    }
    return roots;
  }
  const user = process.env["USER"] ?? "";
  const parents = [`/media/${user}`, `/run/media/${user}`, "/media", "/mnt", "/Volumes"];
  const roots = new Set<string>();
  for (const parent of parents) {
    try {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory()) roots.add(path.join(parent, entry.name));
      }
    } catch {
      // Not on this system.
    }
  }
  return [...roots];
}

/**
 * Where is the school with this id now?
 *
 * 1. Where it was last time.
 * 2. The same path on every other mounted drive.
 * 3. Any "SMC Accounts" folder at the root of a mounted drive - for a pen drive
 *    whose folders were rearranged, or a copy restored to a new drive.
 *
 * Returns null when the school is not reachable: the pen drive is not in.
 */
export function locateProfile(
  profileId: string,
  lastFolder: string,
  options: { platform: Platform; roots: string[] },
): FoundProfile | null {
  const at = (folder: string): FoundProfile | null => {
    const manifest = readManifest(folder);
    return manifest && manifest.profileId === profileId ? { folder, manifest } : null;
  };

  const direct = at(lastFolder);
  if (direct) return direct;

  const split = splitDriveRoot(lastFolder, options.platform);
  const join = options.platform === "win32" ? path.win32.join : path.posix.join;
  if (split) {
    const [oldRoot, rest] = split;
    for (const root of options.roots) {
      if (root === oldRoot) continue;
      const found = at(join(root, rest));
      if (found) return found;
    }
  }

  for (const root of options.roots) {
    const found = findProfilesIn(root).find((item) => item.manifest.profileId === profileId);
    if (found) return found;
  }
  return null;
}
