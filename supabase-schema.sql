-- ========================================================
-- BU4 Department Intranet Portal - Supabase SQL Schema
-- Copy and paste this script into Supabase Dashboard -> SQL Editor -> Run
-- ========================================================

-- 1. Create table for Centralized Department Data Store
create table if not exists public.department_store (
  id text primary key default 'bu4_main',
  data jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS)
alter table public.department_store enable row level security;

-- 3. Create Policy to allow Read/Write via Anon Public Key
drop policy if exists "Allow public read and write for department_store" on public.department_store;
create policy "Allow public read and write for department_store"
on public.department_store
for all
to anon, authenticated
using (true)
with check (true);

-- 4. Enable Realtime Replication for department_store (Optional, for real-time live sync)
alter publication supabase_realtime add table public.department_store;

-- 5. Insert initial empty placeholder if not exists
insert into public.department_store (id, data, updated_at)
values ('bu4_main', '{}'::jsonb, now())
on conflict (id) do nothing;
