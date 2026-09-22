-- Keep decimal precision for Web Vitals (CLS is unitless and small).
drop view if exists analytics.web_vitals;
create view analytics.web_vitals with (security_invoker = true) as
select
  path,
  coalesce(meta ->> 'metric', '') as metric,
  count(*) as samples,
  round(percentile_cont(0.75) within group (
    order by case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end
  )::numeric, 3) as p75,
  round(avg(case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end), 3) as avg
from analytics.analytics_events
where event_type = 'web_vital'
group by 1, 2;

drop view if exists analytics.web_vitals_overall;
create view analytics.web_vitals_overall with (security_invoker = true) as
select
  metric,
  count(*) as samples,
  round(percentile_cont(0.75) within group (order by value)::numeric, 3) as p75,
  round(avg(value), 3) as avg
from (
  select
    meta ->> 'metric' as metric,
    case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end as value
  from analytics.analytics_events
  where event_type = 'web_vital'
) samples
where metric is not null and value is not null
group by 1;

grant select on analytics.web_vitals, analytics.web_vitals_overall to authenticated;
