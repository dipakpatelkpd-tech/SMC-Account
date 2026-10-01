-- SMC Accounts - only accounts the software's owner approves may use it.
--
-- Run this ONCE, after 0001_smc_cloud.sql: Dashboard -> SQL Editor -> New query,
-- paste the whole file, Run. Safe to run again.
--
-- What it does
-- ------------
--   public.account_access  one row per account, made automatically when the
--                          account signs up, with approved = false
--   public.is_approved()   whether the signed-in account is approved
--
-- An account that is not approved can sign in to Supabase, but the app then
-- signs it out and says it is waiting for approval - and, whatever any copy of
-- the app does, these rules refuse it every school, key, backup and file.
--
-- To approve an account: Dashboard -> Table Editor -> account_access, find the
-- email, tick "approved", Save. To withdraw it, untick it: the app signs that
-- account out the next time it lists or opens a school with the internet on.
-- (docs/SUPABASE_SETUP.md, "Approving an account".)
--
-- Accounts that already exist when this runs are approved, so nobody using the
-- app today is locked out; untick any you do not want.

-- ------------------------------------------------------------- the list

create table if not exists public.account_access (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text,
  approved    boolean not null default false,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.account_access enable row level security;

-- An account may see its own row - that is how the app knows - and nothing
-- else. Only the owner, in the dashboard (which bypasses these rules), can
-- change a row: the app's key can neither approve itself nor see who else uses it.
drop policy if exists "access: own row" on public.account_access;
create policy "access: own row" on public.account_access
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.account_access from anon, authenticated;
grant select on public.account_access to authenticated;

-- Every new account gets a row, not approved.
create or replace function public.new_account_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_access (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.new_account_access() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_access on auth.users;
create trigger on_auth_user_created_access
  after insert on auth.users
  for each row execute function public.new_account_access();

-- Accounts made before this ran: approved, so nobody is locked out by surprise.
insert into public.account_access (user_id, email, approved)
select id, email, true from auth.users
on conflict (user_id) do nothing;

-- ------------------------------------------------------------- the check

-- SECURITY DEFINER so the rules below can read the list without the account
-- being able to read anyone else's row.
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.approved from public.account_access a where a.user_id = (select auth.uid())),
    false
  )
$$;

revoke execute on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

-- ------------------------------------------------- refusing the unapproved

-- RESTRICTIVE policies: they are ANDed with the existing ones, so every rule in
-- 0001 still holds and, on top of it, the account must be approved.
drop policy if exists "profiles: approved accounts only" on public.profiles;
create policy "profiles: approved accounts only" on public.profiles
  as restrictive for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "keys: approved accounts only" on public.profile_keys;
create policy "keys: approved accounts only" on public.profile_keys
  as restrictive for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "backups: approved accounts only" on public.backups;
create policy "backups: approved accounts only" on public.backups
  as restrictive for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

drop policy if exists "backups bucket: approved accounts only" on storage.objects;
create policy "backups bucket: approved accounts only" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'backups' or public.is_approved())
  with check (bucket_id <> 'backups' or public.is_approved());
