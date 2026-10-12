-- Existing Supabase Postgres scheduler. No HTTP call, secret, paid service or visitor required.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('hub-audience-retention','17 * * * *',
  $job$select public.hub_audience_run_retention();
  delete from cron.job_run_details where jobid=(select jobid from cron.job where jobname='hub-audience-retention') and end_time<now()-interval '30 days';$job$);
