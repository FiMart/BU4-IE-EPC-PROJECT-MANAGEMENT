-- =====================================================================
-- BU4 IE/EPC Project Management — user roles
-- Run once in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run (idempotent).
--
-- Roles: admin · dept_manager (ผู้จัดการแผนก) · project_manager · engineer · sales · technician
--  - Every new sign-up gets 'technician' (least privilege).
--  - The FIRST user in the project becomes 'admin' automatically.
--  - Admins, Department Managers and Project Managers can read the user list and change roles (enforced by RLS):
--      Admin              → any role, for anyone
--      Department Manager → any role except Admin, for OTHER users who are not Admin
--      Project Manager    → Project Manager / Engineer / Sales / Technician, for OTHER users who are not
--                           Admin or Department Manager
--      Nobody (except Admin) changes their own role.
--  - The last remaining admin cannot be demoted (prevents lock-out).
--  - Only Admins can delete user accounts (admin_delete_user, section 10) — not their own.
--  Role names are compared as text (role::text) so the values added below can be used in the same run.
-- =====================================================================

-- 1) role type (+ roles added in v1.25: dept_manager, sales — re-running this file adds them to older installs)
do $$ begin
  create type public.app_role as enum ('admin', 'project_manager', 'engineer', 'technician');
exception when duplicate_object then null; end $$;
alter type public.app_role add value if not exists 'dept_manager';
alter type public.app_role add value if not exists 'sales';

-- 2) profiles table (one row per auth user)
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text not null default '',
  role       public.app_role not null default 'technician',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 3) helper: is the current user an admin? (security definer → no RLS recursion)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- helper: is the current user a Project Manager?
create or replace function public.is_project_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role::text = 'project_manager');
$$;

-- helper: is the current user a Department Manager (ผู้จัดการแผนก)?
create or replace function public.is_dept_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role::text = 'dept_manager');
$$;

-- 4) row level security
drop policy if exists "profiles: read own"        on public.profiles;
drop policy if exists "profiles: admin read all"  on public.profiles;
drop policy if exists "profiles: pm read all"     on public.profiles;
drop policy if exists "profiles: dm read all"     on public.profiles;
drop policy if exists "profiles: admin set role"  on public.profiles;
drop policy if exists "profiles: pm set role"     on public.profiles;
drop policy if exists "profiles: dm set role"     on public.profiles;
create policy "profiles: read own"       on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: admin read all" on public.profiles for select to authenticated using (public.is_admin());
create policy "profiles: pm read all"    on public.profiles for select to authenticated using (public.is_project_manager());
create policy "profiles: dm read all"    on public.profiles for select to authenticated using (public.is_dept_manager());
create policy "profiles: admin set role" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Department Manager: only other people who are not Admin (USING = the row before), and never to Admin (WITH CHECK = the row after)
create policy "profiles: dm set role" on public.profiles for update to authenticated
  using (public.is_dept_manager() and id <> auth.uid() and role::text <> 'admin')
  with check (public.is_dept_manager() and id <> auth.uid() and role::text <> 'admin');
-- Project Manager: only other people who are not Admin / Department Manager, and never to those roles
create policy "profiles: pm set role" on public.profiles for update to authenticated
  using (public.is_project_manager() and id <> auth.uid() and role::text not in ('admin', 'dept_manager'))
  with check (public.is_project_manager() and id <> auth.uid() and role::text not in ('admin', 'dept_manager'));
-- no insert / delete policies: rows are created by the trigger below and removed with the auth user

-- column-level privileges: clients may read, and (admins only, via RLS) update the role column only
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (role) on public.profiles to authenticated;

-- 5) keep at least one admin
create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role::text = 'admin' and new.role::text <> 'admin'
     and (select count(*) from public.profiles where role::text = 'admin') <= 1 then
    raise exception 'Cannot remove the last admin';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin before update on public.profiles
  for each row execute function public.protect_last_admin();

-- 5b) second guard (independent of the RLS policies): only an Admin may change an Admin's role
--     or make someone Admin — a Project Manager can never touch the Admin role.
--     (auth.uid() is null in the SQL Editor, so the manual option at the end of this file still works)
create or replace function public.protect_admin_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role is distinct from new.role
     and (old.role::text = 'admin' or new.role::text = 'admin')
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an Admin can change the Admin role';
  end if;
  -- same idea one level down: only Admin / Department Manager touch the Department Manager role
  if old.role is distinct from new.role
     and (old.role::text = 'dept_manager' or new.role::text = 'dept_manager')
     and auth.uid() is not null and not (public.is_admin() or public.is_dept_manager()) then
    raise exception 'Only an Admin or a Department Manager can change the Department Manager role';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_admin_role on public.profiles;
create trigger profiles_protect_admin_role before update on public.profiles
  for each row execute function public.protect_admin_role();

-- 6) create a profile for every new auth user (first user ever → admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    (case when exists (select 1 from public.profiles where role = 'admin') then 'technician' else 'admin' end)::public.app_role
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7) keep email / name in sync when the user edits them
create or replace function public.handle_user_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set email = new.email,
         full_name = coalesce(new.raw_user_meta_data ->> 'full_name', full_name)
   where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- 8) backfill users who signed up before this script ran
insert into public.profiles (id, email, full_name, role, created_at)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), 'technician', u.created_at
from auth.users u
on conflict (id) do nothing;

-- if there is still no admin, promote the earliest registered user
update public.profiles set role = 'admin'
where id = (select id from public.profiles order by created_at asc limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

-- 9) team list for pickers (e.g. "Project Manager" of a project):
--    any signed-in member can read names + roles of the team — but not e-mails
create or replace function public.list_team()
returns table (id uuid, full_name text, role public.app_role)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) as full_name,
         p.role
    from public.profiles p
   where exists (select 1 from public.profiles me where me.id = auth.uid())
   order by 2;
$$;
revoke all on function public.list_team() from public, anon;
grant execute on function public.list_team() to authenticated;

-- 10) delete a user account — ADMIN ONLY (Settings → จัดการ Role ผู้ใช้ → ลบ)
--     Removes the Supabase Auth user (their profile row goes with it). An Admin can't delete
--     their own account (prevents lock-out). Project data they saved stays; the "who changed it"
--     columns just become empty. Project Managers and everyone else get an error.
create or replace function public.admin_delete_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only Admin can delete users';
  end if;
  if target = auth.uid() then
    raise exception 'Admin cannot delete their own account';
  end if;
  if not exists (select 1 from auth.users where id = target) then
    raise exception 'User not found';
  end if;
  -- files they uploaded stay; older Storage versions link objects to the user, so unlink first
  begin
    update storage.objects set owner = null where owner = target;
  exception when others then null;
  end;
  delete from auth.users where id = target;
end $$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Manual option — make a specific person admin:
-- update public.profiles set role = 'admin' where email = 'someone@example.com';
