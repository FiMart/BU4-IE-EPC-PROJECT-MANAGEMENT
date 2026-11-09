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
--     see can_see_bid_price(). Re-running this file also moves prices off bids saved before v1.26;
--     and projfin — Margin · WIP/Accrued · accumulated revenue of a project: only Admin, Department Manager,
--     Project Manager and Engineer, see can_see_project_finance() — v1.78;
--     and bidvalues — a bid's Value alone: Admin and the owning Sales, plus Department Manager / Project Manager /
--     Engineer on every bid, see can_see_bid_value() — v1.78)
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
-- Timesheet entries (hours and OT) can only be written by Admin or a Project Manager (everyone with a role can read them;
-- Reset / Import still works through app_replace_all below)
create or replace function public.can_write_record(coll text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_app_role() and (coll <> 'timesheets' or public.is_admin() or public.is_project_manager());
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

-- A project's accounting figures (collection 'projfin': Margin · WIP/Accrued · accumulated revenue from the
-- Monitor WIP/Accrued file, one row per project id) are read and written ONLY by Admin, Department Manager,
-- Project Manager and Engineer. Everyone else still sees the project itself (collection 'projects').
create or replace function public.can_see_project_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'dept_manager', 'project_manager', 'engineer'));
$$;

-- A bid's Value alone (collection 'bidvalues': { value, owner }, one row per bid id — no margin, no quotation files):
-- written like the price (Admin and the owning Sales); read also by Department Manager, Project Manager and Engineer,
-- on every bid. Margin and files stay in 'bidprices'. (bid_id is kept in the signature for the app's readiness check.)
create or replace function public.can_see_bid_value(bid_id text, owner text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_see_bid_price(owner)
      or exists (select 1 from public.profiles where id = auth.uid() and role::text in ('dept_manager', 'project_manager', 'engineer'));
$$;

create policy "records: read"   on public.app_records for select to authenticated using (
  public.has_app_role() and (collection <> 'bidprices' or public.can_see_bid_price(data ->> 'owner'))
  and (collection <> 'bidvalues' or public.can_see_bid_value(id, data ->> 'owner'))
  and (collection <> 'projfin' or public.can_see_project_finance()));
create policy "records: insert" on public.app_records for insert to authenticated with check (
  public.can_write_record(collection) and (collection not in ('bidprices', 'bidvalues') or public.can_see_bid_price(data ->> 'owner'))
  and (collection <> 'projfin' or public.can_see_project_finance()));
create policy "records: update" on public.app_records for update to authenticated
  using (public.can_write_record(collection) and (collection not in ('bidprices', 'bidvalues') or public.can_see_bid_price(data ->> 'owner'))
         and (collection <> 'projfin' or public.can_see_project_finance()))
  with check (public.can_write_record(collection) and (collection not in ('bidprices', 'bidvalues') or public.can_see_bid_price(data ->> 'owner'))
         and (collection <> 'projfin' or public.can_see_project_finance()));
-- Weekly Plan tasks can only be deleted by the person who created them
-- (tasks without a recorded creator — older data / demo — only by Admin)
-- A project (with everything in it): Admin, Department Manager & Project Manager only.
-- A bid: Admin and the Sales who owns it — the only people who may see its price and quotation files, which go with it.
create policy "records: delete" on public.app_records for delete to authenticated using (
  public.can_write_record(collection) and (collection not in ('bidprices', 'bidvalues') or public.can_see_bid_price(data ->> 'owner'))
  and (collection <> 'projfin' or public.can_see_project_finance()) and (
    collection <> 'plans'
    or data ->> 'createdBy' = auth.uid()::text
    or (coalesce(data ->> 'createdBy', '') = '' and public.is_admin())
  ) and (
    collection <> 'projects'
    or exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'dept_manager', 'project_manager'))
  ) and (
    collection <> 'bids' or public.can_see_bid_price(data ->> 'owner')
  ) and (
    -- ISO 9001 records: Admin & Department Manager only (everyone else marks them closed / obsolete instead)
    collection <> 'qms'
    or exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'dept_manager'))
  )
);

-- Deleting means gone from the database: what belongs to a deleted project, bid or person is removed with it,
-- whoever deleted it — also rows that role may not delete itself (Timesheets, another person's Weekly Plan task, bid prices).
-- Runs after the delete statement, so Reset / Import (delete everything, then insert) is not affected.
create or replace function public.app_records_cascade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.collection = 'projects' then
    delete from public.app_records
     where (collection in ('ncrs', 'safety', 'pos', 'costs', 'avl', 'punch', 'meetings', 'dailies') and data ->> 'projectId' = old.id)
        or (collection = 'projfin' and id = old.id)
        or (collection in ('timesheets', 'plans') and data ->> 'kind' = 'project' and data ->> 'refId' = old.id);
  elsif old.collection = 'bids' then
    delete from public.app_records
     where (collection in ('bidprices', 'bidvalues') and id = old.id)
        or (collection in ('timesheets', 'plans') and data ->> 'kind' = 'bid' and data ->> 'refId' = old.id);
  elsif old.collection = 'resources' then
    delete from public.app_records where collection = 'timesheets' and data ->> 'resourceId' = old.id;
    -- Weekly Plan tasks only this person is on (the app takes them off shared tasks itself)
    delete from public.app_records
     where collection = 'plans'
       and coalesce(case when jsonb_typeof(data -> 'guests') = 'array' then jsonb_array_length(data -> 'guests') end, 0) = 0
       and case when jsonb_typeof(data -> 'resourceIds') = 'array' and jsonb_array_length(data -> 'resourceIds') > 0
                then data -> 'resourceIds' = jsonb_build_array(old.id)
                else data ->> 'resourceId' = old.id end;
  end if;
  return null;
end $$;
drop trigger if exists app_records_cascade on public.app_records;
create trigger app_records_cascade after delete on public.app_records
  for each row when (old.collection in ('projects', 'bids', 'resources'))
  execute function public.app_records_cascade();

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

-- v1.78 (safe to re-run): every bid Value also gets its 'bidvalues' row, kept equal to the price row
insert into public.app_records (collection, id, data, ord)
select 'bidvalues', p.id, jsonb_build_object('value', p.data -> 'value', 'owner', coalesce(p.data -> 'owner', '""'::jsonb)), p.ord
  from public.app_records p
 where p.collection = 'bidprices' and jsonb_typeof(p.data -> 'value') = 'number'
on conflict (collection, id) do update set data = excluded.data
 where public.app_records.data is distinct from excluded.data;

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

-- =====================================================================
-- Audit trail (ISO 9001 clause 7.5.3): who added, changed or deleted which record, and when.
--  - Written only by the trigger below. Nobody can change or delete a row through the API: there is no such grant.
--  - Read by Admin & Department Manager only.
--  - Holds the names of the fields that changed, never their values. A bid's price row logs only that it changed.
--  - actor is not a foreign key and the name is copied: the history outlives a deleted account.
-- =====================================================================
create table if not exists public.app_audit (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  actor_name text not null default '',
  action     text not null check (action in ('insert', 'update', 'delete', 'replace_all')),
  collection text not null default '',
  record_id  text not null default '',
  label      text not null default '',
  fields     text[] not null default '{}'
);
create index if not exists app_audit_at_idx on public.app_audit (at desc);
alter table public.app_audit enable row level security;
revoke all on public.app_audit from public, anon, authenticated;
grant select on public.app_audit to authenticated;
drop policy if exists "audit: read" on public.app_audit;
create policy "audit: read" on public.app_audit for select to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'dept_manager')));

create or replace function public.app_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(nullif(trim(full_name), ''), split_part(email, '@', 1)) from public.profiles where id = auth.uid()), '');
$$;

create or replace function public.app_records_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then old.data else new.data end;
  changed text[] := '{}';
  is_price boolean := (case when tg_op = 'DELETE' then old.collection else new.collection end) in ('bidprices', 'bidvalues', 'projfin');
begin
  if coalesce(current_setting('app.bulk', true), '') = '1' then return null; end if; -- Reset / Import writes one line of its own
  if (case when tg_op = 'DELETE' then old.collection else new.collection end) = 'meta' then return null; end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into changed from (
      select n.key as k from jsonb_each(new.data) n where n.value is distinct from old.data -> n.key
      union
      select o.key from jsonb_each(old.data) o where not new.data ? o.key
    ) x;
    if cardinality(changed) = 0 then return null; end if; -- saved again without a change
  end if;
  insert into public.app_audit (actor, actor_name, action, collection, record_id, label, fields)
  values (
    auth.uid(), public.app_actor_name(), lower(tg_op),
    case when tg_op = 'DELETE' then old.collection else new.collection end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case when is_price then '' else left(coalesce(rec ->> 'no', rec ->> 'poNo', rec ->> 'code', rec ->> 'title', rec ->> 'name', rec ->> 'description', ''), 120) end,
    case when is_price then '{}' else changed end
  );
  return null;
end $$;
revoke all on function public.app_records_audit() from public, anon, authenticated;
drop trigger if exists app_records_audit on public.app_records;
create trigger app_records_audit after insert or update or delete on public.app_records
  for each row execute function public.app_records_audit();

-- Reset / Import: replace everything in one transaction (Admin, Department Manager & Project Manager only)
create or replace function public.app_replace_all(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'dept_manager', 'project_manager')) then
    raise exception 'Only Admin, Department Manager or Project Manager can reset or import data';
  end if;
  perform set_config('app.bulk', '1', true); -- this transaction only: one line in the audit trail, not one per row
  delete from public.app_records where true;
  insert into public.app_records (collection, id, data, ord)
  select r ->> 'collection', r ->> 'id', r -> 'data', coalesce((r ->> 'ord')::bigint, 0)
  from jsonb_array_elements(payload) as r;
  get diagnostics n = row_count;
  insert into public.app_audit (actor, actor_name, action, label) values (auth.uid(), public.app_actor_name(), 'replace_all', n || ' records');
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
--  - delete: any signed-in user with a role — deleting a record has to remove its files, whoever uploaded them
--            (the app decides who may delete which record). bids/…: the uploader, Admin / Department Manager /
--            Project Manager, and whoever may see that bid's files.
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
  using (bucket_id = 'po-files' and public.has_app_role() and (
    name not like 'bids/%'
    or owner_id = auth.uid()::text
    or public.can_see_bid_files(split_part(name, '/', 2))
    or exists (select 1 from public.profiles where id = auth.uid() and role::text in ('admin', 'dept_manager', 'project_manager'))
  ));

-- the files in a folder, so deleting a record removes all of them (also files no record points to any more).
-- Quotation files (bids/…) only for those who may see them: their names stay hidden from everyone else.
-- prefix '' = the whole bucket: Admin only (Reset).
create or replace function public.app_file_paths(prefix text)
returns setof text language sql stable security definer set search_path = public as $$
  select o.name from storage.objects o
   where o.bucket_id = 'po-files' and public.has_app_role()
     and case when coalesce(prefix, '') = '' then public.is_admin()
              else left(o.name, length(prefix) + 1) = prefix || '/'
                   and (split_part(prefix, '/', 1) <> 'bids' or public.can_see_bid_files(split_part(prefix, '/', 2))) end;
$$;
revoke all on function public.app_file_paths(text) from public, anon;
grant execute on function public.app_file_paths(text) to authenticated;