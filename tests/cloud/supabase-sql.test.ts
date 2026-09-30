/**
 * The Supabase project's security rules, checked against real PostgreSQL.
 *
 * supabase/migrations/0001_smc_cloud.sql is the only thing standing between one
 * account and another school's books, so it is not trusted by reading. It is
 * run in PGlite (PostgreSQL compiled to WebAssembly) on top of stand-ins for
 * the parts every Supabase project already has - the `auth.uid()` function, the
 * `anon` and `authenticated` roles with Supabase's default grants, and the
 * storage tables - and then every rule is tried as the people it must stop.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "0001_smc_cloud.sql"),
  "utf8",
);

/** What a fresh Supabase project provides before our migration runs. */
const SUPABASE_BASICS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
    declare parts text[]; begin parts := string_to_array(name, '/');
    return parts[1:array_length(parts, 1) - 1]; end $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- Supabase grants every new public table and function to both roles by default.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

let db: PGlite;
const A = randomUUID();
const B = randomUUID();
const schoolA = randomUUID();
const schoolB = randomUUID();
const key = (): string => randomBytes(32).toString("hex");

/** Run SQL as a role, signed in as `uid` (or not signed in at all). */
async function as(role: "anon" | "authenticated", uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

const backupInsert =
  "insert into public.backups (profile_id, storage_path, size_bytes, sha256, app_version, schema_version) " +
  "values ($1, $2, 100, $3, '0.2.0', '0001_init')";
const sha = "a".repeat(64);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_BASICS);
  await db.exec(MIGRATION);
  await db.query("insert into auth.users (id, email) values ($1, 'a@x.in'), ($2, 'b@x.in')", [A, B]);
  await as("authenticated", A, "select * from public.create_profile($1, 'બેટાવાડા', '241602', $2)", [
    schoolA,
    key(),
  ]);
  await as("authenticated", B, "select * from public.create_profile($1, 'બીજી શાળા', '999', $2)", [
    schoolB,
    key(),
  ]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("the migration", () => {
  it("can be run a second time without harm", async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });

  it("makes a private backups bucket", async () => {
    const bucket = await db.query<{ public: boolean }>("select public from storage.buckets where id = 'backups'");
    expect(bucket.rows[0]?.public).toBe(false);
  });
});

describe("schools and keys", () => {
  it("lets an account see only its own schools and keys", async () => {
    expect((await as("authenticated", A, "select id from public.profiles")).rows).toEqual([{ id: schoolA }]);
    expect((await as("authenticated", A, "select profile_id from public.profile_keys")).rows).toEqual([
      { profile_id: schoolA },
    ]);
    expect((await as("authenticated", B, "select id from public.profiles")).rows).toEqual([{ id: schoolB }]);
  });

  it("refuses the same DISE code twice in one account", async () => {
    await expect(
      as("authenticated", A, "select * from public.create_profile($1, 'x', '241602', $2)", [randomUUID(), key()]),
    ).rejects.toThrow(/unique/);
  });

  it("refuses taking over another account's school id", async () => {
    await expect(
      as("authenticated", B, "select * from public.create_profile($1, 'x', '1', $2)", [schoolA, key()]),
    ).rejects.toThrow();
  });

  it("refuses a key for another account's school, and a malformed key", async () => {
    await expect(
      as("authenticated", B, "insert into public.profile_keys (profile_id, key_hex) values ($1, $2)", [
        schoolA,
        key(),
      ]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as("authenticated", A, "select * from public.create_profile($1, 'z', '777', 'not-a-key')", [randomUUID()]),
    ).rejects.toThrow(/check constraint/);
  });

  it("never lets a key be replaced or a school be deleted", async () => {
    await expect(as("authenticated", A, "update public.profile_keys set key_hex = $1", [key()])).rejects.toThrow(
      /permission denied/,
    );
    await expect(as("authenticated", A, "delete from public.profile_keys")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A, "delete from public.profiles")).rejects.toThrow(/permission denied/);
  });
});

describe("backups", () => {
  it("records a backup of an account's own school under its own folder", async () => {
    await expect(as("authenticated", A, backupInsert, [schoolA, `${A}/${schoolA}/one.smcbak`, sha])).resolves.toBeDefined();
  });

  it("refuses a backup under another account's folder or for another account's school", async () => {
    await expect(as("authenticated", A, backupInsert, [schoolA, `${B}/${schoolA}/x.smcbak`, sha])).rejects.toThrow(
      /row-level security/,
    );
    await expect(as("authenticated", B, backupInsert, [schoolA, `${B}/${schoolA}/x.smcbak`, sha])).rejects.toThrow(
      /row-level security/,
    );
  });

  it("never lets a backup be changed or deleted", async () => {
    await expect(as("authenticated", A, "update public.backups set size_bytes = 1")).rejects.toThrow(
      /permission denied/,
    );
    await expect(as("authenticated", A, "delete from public.backups")).rejects.toThrow(/permission denied/);
  });
});

describe("the backup files", () => {
  it("lets an account upload only under its own id and one of its own schools", async () => {
    const upload = (uid: string, name: string) =>
      as("authenticated", uid, "insert into storage.objects (bucket_id, name) values ('backups', $1)", [name]);
    await expect(upload(A, `${A}/${schoolA}/one.smcbak`)).resolves.toBeDefined();
    await expect(upload(A, `${B}/${schoolB}/x.smcbak`)).rejects.toThrow(/row-level security/);
    await expect(upload(A, `${A}/${schoolB}/x.smcbak`)).rejects.toThrow(/row-level security/);
  });

  it("hides one account's files from another, and never lets a file be overwritten or deleted", async () => {
    expect((await as("authenticated", B, "select * from storage.objects")).rows).toEqual([]);
    expect((await as("authenticated", A, "update storage.objects set name = name || '.x'")).affectedRows).toBe(0);
    expect((await as("authenticated", A, "delete from storage.objects")).affectedRows).toBe(0);
    expect((await db.query("select count(*)::int as n from storage.objects")).rows).toEqual([{ n: 1 }]);
  });
});

describe("someone who is not signed in", () => {
  it("can read nothing and create nothing", async () => {
    await expect(as("anon", null, "select * from public.profiles")).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, "select * from public.profile_keys")).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, "select * from public.backups")).rejects.toThrow(/permission denied/);
    await expect(
      as("anon", null, "select * from public.create_profile($1, 'x', '1', $2)", [randomUUID(), key()]),
    ).rejects.toThrow(/permission denied/);
    expect((await as("anon", null, "select * from storage.objects")).rows).toEqual([]);
  });
});
