-- =====================================================================
-- BU4 IE/EPC Project Management — cloud data storage
-- Run AFTER roles.sql, in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run (idempotent).
--
-- Every record of the app (bids, projects, NCR, safety, people, levels, timesheets, weekly plans, POs, expenses, meta)
-- is stored as one row: (collection, id) → data (jsonb).
--  - Any signed-in user who has a role (row in public.profiles) can read & edit records
--    (except timesheets: Project Manager only — see can_write_record();
--     and bidprices — value / margin / quotation files of a bid: only Admin and the Sales who owns the bid,
--     see can_see_bid_price(). Re-running this file also moves prices off bids saved before v1.26.)
--  - Bulk replace (Reset / Import) goes through app_replace_all() — Admin, Department Manager & Project Manager only.
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
-- Timesheet entries can only be written by a Project Manager (everyone with a role can read them;
-- Reset / Import by Admin still works through app_replace_all below)
create or replace function public.can_write_record(coll text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_app_role() and (coll <> 'timesheets' or public.is_project_manager());
$$;

-- Bid prices (collection 'bidprices': value · margin · quotation files of a bid, one row per bid id) are
-- read and written ONLY by Admin and by the Sales who owns the bid (data.owner = their user id).
-- Everyone else still sees the bid itself (collection 'bids') — without the money.
create or replace function public.can_see_bid_price(owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (coalesce(owner, '') <> '' and owner = auth.uid()::text
          and exists (select 1 from public.profiles where id = auth.uid() and role::text = 'sales'));
$$;
-- may this user see the attachments of bid <bid_id> (Storage path bids/<bid_id>/…)?
create or replace function public.can_see_bid_files(bid_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.app_records
     where collection = 'bidprices' and id = bid_id and public.can_see_bid_price(data ->> 'owner'));
$$;

create policy "records: read"   on public.app_records for select to authenticated using (
  public.has_app_role() and (collection <> 'bidprices' or public.can_see_bid_price(data ->> 'owner')));
create policy "records: insert" on public.app_records for insert to authenticated with check (
  public.can_write_record(collection) and (collection <> 'bidprices' or public.can_see_bid_price(data ->> 'owner')));
create policy "records: update" on public.app_records for update to authenticated
  using (public.can_write_record(collection) and (collection <> 'bidprices' or public.can_see_bid_price(data ->> 'owner')))
  with check (public.can_write_record(collection) and (collection <> 'bidprices' or public.can_see_bid_price(data ->> 'owner')));
-- Weekly Plan tasks can only be deleted by the person who created them
-- (tasks without a recorded creator — older data / demo — only by Admin)
create policy "records: delete" on public.app_records for delete to authenticated using (
  public.can_write_record(collection) and (collection <> 'bidprices' or public.can_see_bid_price(data ->> 'owner')) and (
    collection <> 'plans'
    or data ->> 'createdBy' = auth.uid()::text
    or (coalesce(data ->> 'createdBy', '') = '' and public.is_admin())
  )
);

-- one-time move (safe to re-run): bids saved before v1.26 carry value / margin / files on the bid itself →
-- move them to a 'bidprices' row and take them off the bid. The owner is the Sales account behind the bid:
-- its 'sales' id when that is an account, else the account whose name matches the Sales employee / typed name.
with src as (
  select b.id, b.ord, b.data,
         coalesce(
           nullif(b.data ->> 'owner', ''),
           (select p.id::text from public.profiles p where p.id::text = b.data ->> 'sales'),
           (select p.id::text from public.app_records r join public.profiles p
               on lower(trim(p.full_name)) = lower(trim(r.data ->> 'name'))
             where r.collection = 'resources' and r.id = b.data ->> 'sales' limit 1),
           (select p.id::text from public.profiles p
             where coalesce(b.data ->> 'salesName', '') <> '' and lower(trim(p.full_name)) = lower(trim(b.data ->> 'salesName')) limit 1),
           '') as owner
    from public.app_records b
   where b.collection = 'bids' and b.data ?| array['value', 'margin', 'files']
), moved as (
  insert into public.app_records (collection, id, data, ord)
  select 'bidprices', s.id,
         jsonb_build_object('value', s.data -> 'value', 'margin', s.data -> 'margin', 'files', coalesce(s.data -> 'files', '[]'::jsonb), 'owner', s.owner),
         s.ord
    from src s
  on conflict (collection, id) do nothing
  returning id
)
update public.app_records b
   set data = (b.data - 'value' - 'margin' - 'files') || jsonb_build_object('owner', s.owner)
  from src s
 where b.collection = 'bids' and b.id = s.id;

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

-- Reset / Import: replace everything in one transaction (Admin, Department Manager & Project Manager only)
create or replace function public.app_replace_all(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'dept_manager', 'project_manager')) then
    raise exception 'Only Admin, Department Manager or Project Manager can reset or import data';
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
--    (except bids/…: only Admin and the Sales who owns the bid — see can_see_bid_files)
--  - delete: the person who uploaded the file, or Admin / Department Manager / Project Manager
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
-- bid attachments (quotations, bids/<bidId>/…) follow the bid price: Admin and the Sales who owns the bid
create policy "po-files: read" on storage.objects for select to authenticated
  using (bucket_id = 'po-files' and public.has_app_role()
         and (name not like 'bids/%' or public.can_see_bid_files(split_part(name, '/', 2))));
create policy "po-files: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'po-files' and public.has_app_role()
              and (name not like 'bids/%' or exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'sales'))));
create policy "po-files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'po-files' and (
    owner_id = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'dept_manager', 'project_manager'))
  ));