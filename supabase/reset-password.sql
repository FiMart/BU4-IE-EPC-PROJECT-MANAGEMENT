-- =====================================================================
-- BU4 IE/EPC Project Management — Admin: set a new password for a user
-- Use when the "forgot password" e-mail cannot be delivered.
-- Supabase Dashboard → SQL Editor → paste → edit the 2 values below → Run.
-- Tell the user the new password and ask them to change it in Settings after logging in.
-- =====================================================================

update auth.users
   set encrypted_password = extensions.crypt('NEW-PASSWORD-HERE', extensions.gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       updated_at = now()
 where email = 'user@example.com';          -- ← the user's e-mail

-- check: 1 row should show a recent updated_at
select email, updated_at from auth.users where email = 'user@example.com';
