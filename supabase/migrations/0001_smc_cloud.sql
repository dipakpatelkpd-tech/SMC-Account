-- SMC Accounts - the cloud side.
--
-- Run this ONCE in a new Supabase project: Dashboard -> SQL Editor -> New query,
-- paste the whole file, Run. docs/SUPABASE_SETUP.md walks through it.
--
-- What it creates
-- ---------------
--   public.profiles      one row per school an account keeps (name, DISE code)
--   public.profile_keys  each school's encryption key; can never be replaced
--   public.backups       one row per backup; can never be changed or deleted
--   create_profile()     creates a school and its key in one transaction
--   storage "backups"    a PRIVATE bucket holding the encrypted backup files,
--                        under <user id>/<school id>/...
--
-- The rules, all enforced here by row-level security rather than by the app:
--   * an account sees and adds only its own rows and files;
--   * nobody using the app's publishable key can update or delete anything -
--     a backup, once written, stays; a stolen password cannot wipe the history;
--   * the anonymous (not signed in) role can do nothing at all.
--
-- The app never sees a school's figures in the cloud: a backup is the encrypted
-- database file, byte for byte (src/server/vault.ts).
--
-- Safe to run twice: every statement is "create ... if not exists" or replaces
-- the previous definition.

-- ------------------------------------------------------------------ schools

create table if not exists public.profiles (
  id             uuid primary key,
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  school_name_gu text not null check (char_length(school_name_gu) between 1 and 200),
  dise_code      text not null check (char_length(dise_code) between 1 and 40),
  created_at     timestamptz not null default now(),
  -- One account cannot hold the same school twice.
  unique (owner_id, dise_code)
);

create index if not exists profiles_owner_idx on public.profiles (owner_id);

alter table public.profiles enable row level security;

drop policy if exists "profiles: owner reads" on public.profiles;
create policy "profiles: owner reads" on public.profiles
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "profiles: owner adds" on public.profiles;
create policy "profiles: owner adds" on public.profiles
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- No update or delete policy: a school, once registered, stays.

-- ------------------------------------------------------------ school keys

create table if not exists public.profile_keys (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 32 random bytes as 64 lowercase hex characters (src/server/vault.ts).
  key_hex    text not null check (key_hex ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.profile_keys enable row level security;

drop policy if exists "keys: owner reads" on public.profile_keys;
create policy "keys: owner reads" on public.profile_keys
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "keys: owner adds for own school" on public.profile_keys;
create policy "keys: owner adds for own school" on public.profile_keys
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = profile_id and p.owner_id = (select auth.uid())
    )
  );

-- No update or delete policy: a key can never be swapped, so nobody - not even
-- someone holding the password - can lock a school out of its own books.

-- ---------------------------------------------------------------- backups

create table if not exists public.backups (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles (id) on delete cascade,
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path   text not null unique,
  size_bytes     integer not null check (size_bytes > 0),
  sha256         text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  app_version    text not null check (char_length(app_version) <= 40),
  schema_version text not null check (char_length(schema_version) <= 100),
  device_name    text not null default '' check (char_length(device_name) <= 100),
  created_at     timestamptz not null default now()
);

create index if not exists backups_profile_created_idx
  on public.backups (profile_id, created_at desc);

alter table public.backups enable row level security;

drop policy if exists "backups: owner reads" on public.backups;
create policy "backups: owner reads" on public.backups
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "backups: owner adds for own school" on public.backups;
create policy "backups: owner adds for own school" on public.backups
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = profile_id and p.owner_id = (select auth.uid())
    )
    and storage_path like (select auth.uid())::text || '/' || profile_id::text || '/%'
  );

-- No update or delete policy: backups are append-only.

-- --------------------------------------------------------- table privileges

-- Row-level security decides which rows; these decide which operations exist
-- at all. The anonymous role gets nothing, signed-in users only read and add.
revoke all on public.profiles, public.profile_keys, public.backups from anon;
revoke all on public.profiles, public.profile_keys, public.backups from authenticated;
grant select, insert on public.profiles, public.profile_keys, public.backups to authenticated;

-- ------------------------------------------------- creating a school at once

-- A school and its key in ONE transaction, so there is never a school in the
-- cloud without its key. SECURITY INVOKER: it runs as the signed-in user, so
-- every policy above still applies to it.
create or replace function public.create_profile(
  p_id uuid,
  p_school_name_gu text,
  p_dise_code text,
  p_key_hex text
)
returns public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.profiles;
begin
  insert into public.profiles (id, owner_id, school_name_gu, dise_code)
  values (p_id, auth.uid(), p_school_name_gu, p_dise_code)
  returning * into created;

  insert into public.profile_keys (profile_id, owner_id, key_hex)
  values (p_id, auth.uid(), p_key_hex);

  return created;
end;
$$;

revoke execute on function public.create_profile(uuid, text, text, text) from public, anon;
grant execute on function public.create_profile(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------- storage: the files

-- Private: nothing in it is reachable by URL; only the owner can download,
-- through the API, signed in. 50 MB is far above a school's file (~150 KB for
-- a full year).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/octet-stream'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Files live at <user id>/<school id>/<time>.smcbak. An account may add files
-- only under its own id and one of its own schools, and read only its own.
drop policy if exists "backups bucket: owner adds" on storage.objects;
create policy "backups bucket: owner adds" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists "backups bucket: owner reads" on storage.objects;
create policy "backups bucket: owner reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No update or delete policy on the bucket: the app uploads with upsert off,
-- and nothing using the publishable key can overwrite or remove a backup.
