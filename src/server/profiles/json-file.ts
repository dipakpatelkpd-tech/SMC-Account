/**
 * Small JSON files that must never be left half-written.
 *
 * Several of these live on a pen drive, which can be pulled out at any moment.
 * Writing in place could leave a truncated file; writing a temporary file,
 * flushing it to the drive and renaming it over the old one means a reader sees
 * either the old contents or the new, never a mixture.
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";

export function writeJsonAtomic(file: string, value: unknown): void {
  writeBytesAtomic(file, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

export function writeBytesAtomic(file: string, bytes: Uint8Array): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  const handle = openSync(temporary, "w");
  try {
    writeSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  try {
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * Read and validate a JSON file. Returns null when it does not exist, is not
 * JSON, or does not match the schema - the callers treat all three as "not
 * there", because a damaged side file must never stop the books from opening.
 */
export function readJson<T>(file: string, schema: z.ZodType<T>): T | null {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
