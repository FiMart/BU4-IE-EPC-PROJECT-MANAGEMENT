-- line.sql — sends the LINE notifications on a schedule (Edge Function line-notify, supabase/functions/line-notify)
-- Run ONCE in Supabase → SQL Editor, after:
--   1. supabase/data.sql has been re-run (v1.81: the Admin-only LINE settings)
--   2. the function is deployed:   supabase functions deploy line-notify --no-verify-jwt
--   3. its secrets are set:        LINE_CHANNEL_ACCESS_TOKEN · LINE_CHANNEL_SECRET · CRON_SECRET · APP_URL
-- Before running: replace YOUR-PROJECT-REF and YOUR-CRON-SECRET below (the same text as the CRON_SECRET secret).
-- Times are UTC: 01:00 UTC = 08:00 in Thailand. Safe to re-run (the jobs are replaced).
-- To stop: select cron.unschedule('bu4-line-urgent'); select cron.unschedule('bu4-line-weekly');
-- The on / off switch and the recipients are in the app: Settings → แจ้งเตือนผ่าน LINE.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  perform cron.unschedule('bu4-line-urgent');
exception when others then null; end $$;
do $$ begin
  perform cron.unschedule('bu4-line-weekly');
exception when others then null; end $$;

-- urgent items: Monday – Friday 08:00 (nothing is sent on a day with nothing urgent)
select cron.schedule('bu4-line-urgent', '0 1 * * 1-5', $job$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/line-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{"mode":"urgent"}'::jsonb,
    timeout_milliseconds := 30000);
$job$);

-- weekly summary: Monday 08:05
select cron.schedule('bu4-line-weekly', '5 1 * * 1', $job$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/line-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{"mode":"weekly"}'::jsonb,
    timeout_milliseconds := 30000);
$job$);

-- check: select jobname, schedule, active from cron.job where jobname like 'bu4-line-%';
-- last runs: select * from net._http_response order by created desc limit 5;
