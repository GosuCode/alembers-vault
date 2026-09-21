-- Alember's Vault — nightly analytics rollup + retention prune.
-- Rolls raw events into daily aggregates, then deletes raw rows older than 90 days.

create extension if not exists pg_cron;

select cron.unschedule('analytics-rollup-prune')
where exists (select 1 from cron.job where jobname = 'analytics-rollup-prune');

select cron.schedule(
  'analytics-rollup-prune',
  '15 3 * * *',
  $$select analytics.rollup_and_prune(90);$$
);
