-- =====================================================================
-- BU4 IE/EPC Project Management — cloud data storage
-- Run AFTER roles.sql, in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run (idempotent).
--
-- Every record of the app (bids, projects, NCR, safety, people, levels, timesheets, weekly plans, POs, expenses, meta)
-- is stored as one row: (collection, id) → data (jsonb).
--  - Any signed-in user who has a role (row in public.profiles) can read & edit records.
--  - Bulk replace (Reset / Import) goes through app_replace_all() — Admin & Project Manager only.
--  - PO file attachments: private Storage bucket "po-files" (section at the end).
-- =====================================================================

do $$ begin
  if to_regclass('public.profiles') is null then
    raise exception 'Run supabase/roles.sql first (public.profiles is missing)';
  end if;
end $$;

create table if not exists public.app_records (
  collection text   not null,
  id         text   not null,
  data       jsonb  not null,
  ord        bigint not null default 0,          -- keeps list order stable between devices
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (collection, id)
);
-- collection names: any short lowercase name, so new kinds of data added in later versions of the app
-- are accepted without re-running this file (older versions of this file listed the names one by one;
-- the app parks records the table doesn't accept yet under 'meta' until this file is re-run)
alter table public.app_records drop constraint if exists app_records_collection_check;
alter table public.app_records add constraint app_records_collection_check
  check (collection ~ '^[a-z][a-z0-9_]{0,39}$');

create index if not exists app_records_collection_ord_idx on public.app_records (collection, ord);
alter table public.app_records enable row level security;

-- signed-in user with a role?
create or replace function public.has_app_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

drop policy if exists "records: read"   on public.app_records;
drop policy if exists "records: insert" on public.app_records;
drop policy if exists "records: update" on public.app_records;
drop policy if exists "records: delete" on public.app_records;
create policy "records: read"   on public.app_records for select to authenticated using (public.has_app_role());
create policy "records: insert" on public.app_records for insert to authenticated with check (public.has_app_role());
create policy "records: update" on public.app_records for update to authenticated using (public.has_app_role()) with check (public.has_app_role());
-- Weekly Plan tasks can only be deleted by the person who created them
-- (tasks without a recorded creator — older data / demo — only by Admin)
create policy "records: delete" on public.app_records for delete to authenticated using (
  public.has_app_role() and (
    collection <> 'plans'
    or data ->> 'createdBy' = auth.uid()::text
    or (coalesce(data ->> 'createdBy', '') = '' and public.is_admin())
  )
);

revoke all on public.app_records from anon, authenticated;
grant select, insert, update, delete on public.app_records to authenticated;

-- who / when changed each record
create or replace function public.app_records_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists app_records_touch on public.app_records;
create trigger app_records_touch before insert or update on public.app_records
  for each row execute function public.app_records_touch();

-- the creator of a Weekly Plan task can never be changed by an update
create or replace function public.app_records_keep_creator()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.collection = 'plans' and coalesce(old.data ->> 'createdBy', '') <> '' then
    new.data := jsonb_set(new.data, '{createdBy}', old.data -> 'createdBy');
    if old.data ? 'createdByName' then
      new.data := jsonb_set(new.data, '{createdByName}', old.data -> 'createdByName');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists app_records_keep_creator on public.app_records;
create trigger app_records_keep_creator before update on public.app_records
  for each row execute function public.app_records_keep_creator();

-- Reset / Import: replace everything in one transaction (Admin & Project Manager only)
create or replace function public.app_replace_all(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'project_manager')) then
    raise exception 'Only Admin or Project Manager can reset or import data';
  end if;
  delete from public.app_records where true;
  insert into public.app_records (collection, id, data, ord)
  select r ->> 'collection', r ->> 'id', r -> 'data', coalesce((r ->> 'ord')::bigint, 0)
  from jsonb_array_elements(payload) as r;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.app_replace_all(jsonb) from public, anon;
grant execute on function public.app_replace_all(jsonb) to authenticated;

-- =====================================================================
-- PO file attachments — Supabase Storage (private bucket "po-files")
-- Files live at: <projectId>/<poId>/<timestamp>-<file name>   (PO attachments)
--            and bids/<bidId>/<timestamp>-<file name>        (inquiry / quotation attachments)
--  - any signed-in user with a role can view / download and upload
--  - delete: the person who uploaded the file, or Admin / Project Manager
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('po-files', 'po-files', false, 20971520, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'text/csv', 'application/zip'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "po-files: read"   on storage.objects;
drop policy if exists "po-files: upload" on storage.objects;
drop policy if exists "po-files: delete" on storage.objects;
create policy "po-files: read" on storage.objects for select to authenticated
  using (bucket_id = 'po-files' and public.has_app_role());
create policy "po-files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'po-files' and public.has_app_role());
create policy "po-files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'po-files' and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'project_manager'))
  ));