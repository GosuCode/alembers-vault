-- Site-wide Web Vitals p75 (per metric, across all paths).
create or replace view analytics.web_vitals_overall with (security_invoker = true) as
select
  metric,
  count(*) as samples,
  round(percentile_cont(0.75) within group (order by value))::int as p75,
  round(avg(value))::int as avg
from (
  select
    meta ->> 'metric' as metric,
    case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end as value
  from analytics.analytics_events
  where event_type = 'web_vital'
) samples
where metric is not null and value is not null
group by 1;

grant select on analytics.web_vitals_overall to authenticated;
