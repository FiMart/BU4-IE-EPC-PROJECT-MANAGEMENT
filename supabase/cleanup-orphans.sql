-- =====================================================================
-- BU4 IE/EPC Project Management — one-time clean-up of data left behind by deletes
-- Before v1.66 deleting a project, bid or person left some of its data in the database.
-- From v1.66 on nothing is left behind (data.sql), so this is needed once, for what is already there.
--
-- Step 1 (runs as this file stands) only COUNTS what would be removed. Nothing is changed.
-- Step 2 removes it, for good: Export JSON from Settings first, then remove the /* and */ around step 2 and run again.
-- Step 3 is optional: people who were "deleted" in older versions (only switched off, Timesheets kept).
-- =====================================================================

-- ---------- step 1: count ----------
with p as (select id from public.app_records where collection = 'projects'),
     b as (select id from public.app_records where collection = 'bids'),
     r as (select id from public.app_records where collection = 'resources')
select collection, count(*) as rows_left_behind
  from public.app_records a
 where (collection in ('ncrs', 'safety', 'pos', 'costs', 'avl', 'punch', 'meetings', 'dailies')
        and coalesce(data ->> 'projectId', '') <> '' and data ->> 'projectId' not in (select id from p))
    or (collection in ('timesheets', 'plans') and data ->> 'kind' = 'project' and data ->> 'refId' not in (select id from p))
    or (collection in ('timesheets', 'plans') and data ->> 'kind' = 'bid' and data ->> 'refId' not in (select id from b))
    or (collection = 'timesheets' and data ->> 'resourceId' not in (select id from r))
    or (collection = 'bidprices' and id not in (select id from b))
 group by collection order by collection;

-- ---------- step 2: remove (Export JSON first) ----------
/*
with p as (select id from public.app_records where collection = 'projects'),
     b as (select id from public.app_records where collection = 'bids'),
     r as (select id from public.app_records where collection = 'resources')
delete from public.app_records a
 where (collection in ('ncrs', 'safety', 'pos', 'costs', 'avl', 'punch', 'meetings', 'dailies')
        and coalesce(data ->> 'projectId', '') <> '' and data ->> 'projectId' not in (select id from p))
    or (collection in ('timesheets', 'plans') and data ->> 'kind' = 'project' and data ->> 'refId' not in (select id from p))
    or (collection in ('timesheets', 'plans') and data ->> 'kind' = 'bid' and data ->> 'refId' not in (select id from b))
    or (collection = 'timesheets' and data ->> 'resourceId' not in (select id from r))
    or (collection = 'bidprices' and id not in (select id from b));
*/

-- ---------- step 3 (optional): people switched off by "delete" in older versions ----------
-- From v1.67 they are listed on the Resources page under "ลาออกแล้ว": give a last working day to keep their hours
-- in the reports, or delete them there one by one. Or remove all of them here, with their Timesheets (run data.sql first):
--   select id, data ->> 'name' as name from public.app_records where collection = 'resources' and data ->> 'active' = 'false' and coalesce(data ->> 'resignDate', '') = '';
--   delete from public.app_records where collection = 'resources' and data ->> 'active' = 'false' and coalesce(data ->> 'resignDate', '') = '';
