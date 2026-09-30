import { createHash } from "node:crypto";

/** SHA-256 of a backup, checked after every upload and before every restore. */
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
