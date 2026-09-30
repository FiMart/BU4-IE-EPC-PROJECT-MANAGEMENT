-- ========================================================
-- BU4 Department Intranet Portal - Supabase SQL Schema
-- Copy and paste this script into Supabase Dashboard -> SQL Editor -> Run
-- Safe to re-run (idempotent) — existing data is kept.
--
-- Access: signed-in users only (Supabase Auth). The anon key alone can no longer read or
-- overwrite the data — it is visible to anyone who opens the website's source.
-- If this project also has the BU4 IE/EPC roles (supabase/roles.sql → public.profiles),
-- the user must additionally have a role, the same rule as the Project Management app.
-- ========================================================

-- 1. Create table for Centralized Department Data Store
create table if not exists public.department_store (
  id text primary key default 'bu4_main',
  data jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_by uuid references auth.users (id) on delete set null
);
-- older installs: add the "who changed it" column
alter table public.department_store add column if not exists updated_by uuid references auth.users (id) on delete set null;

-- 2. Enable Row Level Security (RLS)
alter table public.department_store enable row level security;

-- 3. Policies — signed-in users (with a role, when public.has_app_role() exists) can read and save
--    (the old policy that let anyone with the anon key read / write everything is removed)
drop policy if exists "Allow public read and write for department_store" on public.department_store;
drop policy if exists "department_store: read"   on public.department_store;
drop policy if exists "department_store: insert" on public.department_store;
drop policy if exists "department_store: update" on public.department_store;

do $$
declare
  who text := case when to_regprocedure('public.has_app_role()') is not null
                   then 'public.has_app_role()'   -- same project as BU4 IE/EPC: must have a role
                   else 'true' end;               -- stand-alone project: any signed-in user
begin
  execute format('create policy "department_store: read" on public.department_store for select to authenticated using (%s)', who);
  execute format('create policy "department_store: insert" on public.department_store for insert to authenticated with check (%s)', who);
  execute format('create policy "department_store: update" on public.department_store for update to authenticated using (%s) with check (%s)', who, who);
end $$;
-- no delete policy: the data row can't be deleted from the website

-- table privileges: nothing for anon; read / insert / update for signed-in users
revoke all on public.department_store from anon, authenticated;
grant select, insert, update on public.department_store to authenticated;

-- keep updated_at / updated_by current on every save
create or replace function public.department_store_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists department_store_touch on public.department_store;
create trigger department_store_touch before insert or update on public.department_store
  for each row execute function public.department_store_touch();

-- 4. Enable Realtime Replication for department_store (Optional, for real-time live sync)
--    (only if not added yet — "alter publication ... add table" has no IF NOT EXISTS,
--     so running this file a second time used to fail with error 42710)
--    Realtime follows the read policy above: only signed-in users receive changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'department_store'
     ) then
    alter publication supabase_realtime add table public.department_store;
  end if;
end $$;

-- 5. Insert initial empty placeholder if not exists
insert into public.department_store (id, data, updated_at)
values ('bu4_main', '{}'::jsonb, now())
on conflict (id) do nothing;
