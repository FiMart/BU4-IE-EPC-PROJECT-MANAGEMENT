-- =====================================================================
-- BU4 IE/EPC Project Management — confirm users who registered while
-- "Confirm email" was still ON (they would otherwise get "Email not confirmed").
-- Run in Supabase Dashboard → SQL Editor after turning "Confirm email" OFF.
-- Safe to re-run: only touches users that are not confirmed yet.
-- =====================================================================

update auth.users
   set email_confirmed_at = now()
 where email_confirmed_at is null;

-- check: everyone should now have a confirmation time
select email, email_confirmed_at, created_at
  from auth.users
 order by created_at;
