-- Multi-site analytics: a `site` dimension so the vault and the portfolio
-- (and anything else) share one dashboard, filterable by site.

alter table analytics.analytics_events
  add column if not exists site text not null default 'vault.shreeshalember.com.np';

create index if not exists analytics_events_site_idx on analytics.analytics_events (site);

-- ── ingest RPC now records site ─────────────────────────────────────────────
create or replace function analytics.ingest_event(p jsonb)
returns void
language plpgsql
security definer
set search_path = analytics, public, extensions
as $$
declare
  t text := p ->> 'token';
begin
  if t is null
     or encode(digest(t, 'sha256'), 'hex') <> (
       select c.token_hash from analytics.ingest_config c where c.id
     ) then
    raise exception 'invalid ingest token' using errcode = '28000';
  end if;

  insert into analytics.analytics_events (
    event_type, path, title, referrer, referrer_host, source,
    country, region, city, continent, colo, asn, timezone, latitude, longitude,
    user_agent, device_type, browser, os, is_bot,
    session_hash, visitor_hash, ip_hash, cf_ray,
    duration_ms, scroll_depth,
    link_url, link_text, link_host, link_kind, link_region,
    is_external, has_download, target, rel,
    content_type, content_slug, meta, site
  ) values (
    case when p ->> 'event_type' in
      ('pageview','click','download','pdf_open','engagement','search','copy','not_found','web_vital')
      then p ->> 'event_type' else 'pageview' end,
    left(coalesce(p ->> 'path', '/'), 2048),
    left(p ->> 'title', 300),
    left(p ->> 'referrer', 2048),
    left(p ->> 'referrer_host', 253),
    left(p ->> 'source', 32),
    left(p ->> 'country', 64),
    left(p ->> 'region', 128),
    left(p ->> 'city', 128),
    left(p ->> 'continent', 32),
    left(p ->> 'colo', 16),
    analytics.safe_int(p ->> 'asn', -2147483648, 2147483647),
    left(p ->> 'timezone', 64),
    analytics.safe_num(p ->> 'latitude', -90, 90),
    analytics.safe_num(p ->> 'longitude', -180, 180),
    left(p ->> 'user_agent', 512),
    left(p ->> 'device_type', 32),
    left(p ->> 'browser', 64),
    left(p ->> 'os', 64),
    coalesce((p ->> 'is_bot') in ('true','t','1'), false),
    left(p ->> 'session_hash', 64),
    left(p ->> 'visitor_hash', 64),
    left(p ->> 'ip_hash', 64),
    left(p ->> 'cf_ray', 64),
    analytics.safe_int(p ->> 'duration_ms', 0, 3600000),
    analytics.safe_int(p ->> 'scroll_depth', 0, 100),
    left(p ->> 'link_url', 2048),
    left(p ->> 'link_text', 300),
    left(p ->> 'link_host', 253),
    left(p ->> 'link_kind', 32),
    left(p ->> 'link_region', 32),
    coalesce((p ->> 'is_external') in ('true','t','1'), false),
    coalesce((p ->> 'has_download') in ('true','t','1'), false),
    left(p ->> 'target', 16),
    left(p ->> 'rel', 64),
    left(p ->> 'content_type', 32),
    left(p ->> 'content_slug', 200),
    case when jsonb_typeof(p -> 'meta') = 'object'
              and pg_column_size(p -> 'meta') <= 4096
         then p -> 'meta' else '{}'::jsonb end,
    left(coalesce(nullif(p ->> 'site', ''), 'vault.shreeshalember.com.np'), 128)
  );
end;
$$;

-- ── views gain a trailing `site` column (create-or-replace keeps grants) ─────
create or replace view analytics.daily with (security_invoker = true) as
select
  (created_at at time zone 'UTC')::date as day,
  count(*) filter (where event_type = 'pageview') as pageviews,
  count(distinct visitor_hash) filter (where event_type = 'pageview') as visitors,
  count(*) filter (where event_type = 'click') as clicks,
  count(*) filter (where event_type = 'download') as downloads,
  count(*) filter (where event_type = 'not_found') as not_found,
  coalesce(round(avg(duration_ms) filter (where event_type = 'engagement' and duration_ms >= 1000)), 0)::int as avg_duration_ms,
  site
from analytics.analytics_events
group by 1, site;

create or replace view analytics.top_pages with (security_invoker = true) as
select
  path,
  max(title) as title,
  count(*) filter (where event_type = 'pageview') as pageviews,
  count(distinct visitor_hash) filter (where event_type = 'pageview') as visitors,
  coalesce(round(avg(duration_ms) filter (where event_type = 'engagement' and duration_ms >= 1000)), 0)::int as avg_duration_ms,
  coalesce(round(avg(scroll_depth) filter (where event_type = 'engagement')), 0)::int as avg_scroll_depth,
  site
from analytics.analytics_events
group by path, site;

create or replace view analytics.sources with (security_invoker = true) as
select coalesce(source, 'other') as source,
       count(*) filter (where event_type = 'pageview') as pageviews,
       count(distinct visitor_hash) as visitors,
       site
from analytics.analytics_events
group by 1, site;

create or replace view analytics.referrers with (security_invoker = true) as
select coalesce(nullif(referrer_host, ''), 'direct') as referrer_host,
       count(*) as hits,
       count(distinct visitor_hash) as visitors,
       site
from analytics.analytics_events
where event_type = 'pageview'
group by 1, site;

create or replace view analytics.countries with (security_invoker = true) as
select coalesce(country, 'unknown') as country,
       count(*) as hits,
       count(distinct visitor_hash) as visitors,
       site
from analytics.analytics_events
where event_type = 'pageview'
group by 1, site;

create or replace view analytics.devices with (security_invoker = true) as
select coalesce(device_type, 'unknown') as device_type,
       coalesce(browser, 'unknown') as browser,
       coalesce(os, 'unknown') as os,
       count(*) as hits,
       count(distinct visitor_hash) as visitors,
       site
from analytics.analytics_events
where event_type = 'pageview'
group by 1, 2, 3, site;

create or replace view analytics.top_links with (security_invoker = true) as
select
  link_url,
  max(link_text) as link_text,
  max(link_kind) as link_kind,
  max(link_host) as link_host,
  count(*) as clicks,
  count(distinct visitor_hash) as visitors,
  site
from analytics.analytics_events
where event_type = 'click' and link_url is not null
group by link_url, site;

create or replace view analytics.downloads with (security_invoker = true) as
select
  coalesce(link_url, path) as link_url,
  max(link_text) as label,
  max(content_slug) as content_slug,
  count(*) as downloads,
  count(distinct visitor_hash) as visitors,
  site
from analytics.analytics_events
where event_type = 'download'
group by 1, site;

create or replace view analytics.content_leaderboard with (security_invoker = true) as
select
  content_type,
  content_slug,
  count(*) filter (where event_type = 'pageview') as pageviews,
  count(distinct visitor_hash) filter (where event_type = 'pageview') as visitors,
  coalesce(round(avg(duration_ms) filter (where event_type = 'engagement' and duration_ms >= 1000)), 0)::int as avg_duration_ms,
  count(*) filter (where event_type = 'click' and link_kind in ('repo','demo','dashboard','docs')) as outbound_clicks,
  count(*) filter (where event_type = 'download') as downloads,
  count(*) filter (where event_type = 'copy') as copies,
  site
from analytics.analytics_events
where content_slug is not null
group by 1, 2, site;

create or replace view analytics.search_terms with (security_invoker = true) as
select
  meta ->> 'query' as query,
  count(*) as searches,
  count(*) filter (where meta ->> 'results' = '0') as zero_results,
  site
from analytics.analytics_events
where event_type = 'search' and meta ? 'query'
group by 1, site;

create or replace view analytics.copied_snippets with (security_invoker = true) as
select
  coalesce(nullif(meta ->> 'snippet', ''), '(no text)') as snippet,
  max(path) as path,
  count(*) as copies,
  site
from analytics.analytics_events
where event_type = 'copy'
group by 1, site;

create or replace view analytics.pdf_depth with (security_invoker = true) as
select
  content_slug,
  max(path) as path,
  count(*) as reads,
  round(avg(case when meta ->> 'deepest' ~ '^[0-9]+$' then (meta ->> 'deepest')::int end))::int as avg_deepest,
  max(case when meta ->> 'pages' ~ '^[0-9]+$' then (meta ->> 'pages')::int end) as pages,
  site
from analytics.analytics_events
where event_type = 'engagement' and meta ->> 'surface' = 'pdf'
group by content_slug, site;

create or replace view analytics.sessions with (security_invoker = true) as
select
  session_hash,
  min(created_at) as started_at,
  max(created_at) as ended_at,
  count(*) filter (where event_type = 'pageview') as pageviews,
  count(*) as events,
  (array_agg(path order by created_at) filter (where event_type = 'pageview'))[1] as entry_path,
  (array_agg(path order by created_at desc) filter (where event_type = 'pageview'))[1] as exit_path,
  (array_agg(path order by created_at) filter (where event_type = 'pageview')) as path_sequence,
  max(country) as country,
  max(city) as city,
  max(device_type) as device_type,
  max(source) as source,
  max(site) as site
from analytics.analytics_events
where session_hash is not null
group by session_hash;

create or replace view analytics.web_vitals with (security_invoker = true) as
select
  path,
  coalesce(meta ->> 'metric', '') as metric,
  count(*) as samples,
  round(percentile_cont(0.75) within group (
    order by case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end
  )::numeric, 3) as p75,
  round(avg(case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end), 3) as avg,
  site
from analytics.analytics_events
where event_type = 'web_vital'
group by 1, 2, site;

create or replace view analytics.web_vitals_overall with (security_invoker = true) as
select
  metric,
  count(*) as samples,
  round(percentile_cont(0.75) within group (order by value)::numeric, 3) as p75,
  round(avg(value), 3) as avg,
  site
from (
  select
    meta ->> 'metric' as metric,
    site,
    case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end as value
  from analytics.analytics_events
  where event_type = 'web_vital'
) samples
where metric is not null and value is not null
group by metric, site;

-- ── rollups keep the site dimension too ─────────────────────────────────────
drop table if exists analytics.daily_rollup;
create table analytics.daily_rollup (
  day             date not null,
  site            text not null default 'vault.shreeshalember.com.np',
  event_type      text not null,
  count           int not null default 0,
  visitors        int not null default 0,
  avg_duration_ms int,
  primary key (day, site, event_type)
);

drop table if exists analytics.link_daily_rollup;
create table analytics.link_daily_rollup (
  day       date not null,
  site      text not null default 'vault.shreeshalember.com.np',
  link_url  text not null,
  link_kind text,
  count     int not null default 0,
  primary key (day, site, link_url)
);

create or replace function analytics.rollup_and_prune(retention_days int default 90)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  insert into analytics.daily_rollup (day, site, event_type, count, visitors, avg_duration_ms)
  select
    (created_at at time zone 'UTC')::date,
    site,
    event_type,
    count(*),
    count(distinct visitor_hash),
    coalesce(round(avg(duration_ms) filter (where duration_ms >= 1000)), 0)::int
  from analytics.analytics_events
  where created_at < date_trunc('day', now())
  group by 1, 2, 3
  on conflict (day, site, event_type) do update
    set count = excluded.count,
        visitors = excluded.visitors,
        avg_duration_ms = excluded.avg_duration_ms;

  insert into analytics.link_daily_rollup (day, site, link_url, link_kind, count)
  select
    (created_at at time zone 'UTC')::date,
    site,
    coalesce(link_url, ''),
    link_kind,
    count(*)
  from analytics.analytics_events
  where link_url is not null and created_at < date_trunc('day', now())
  group by 1, 2, 3, 4
  on conflict (day, site, link_url) do update
    set count = excluded.count, link_kind = excluded.link_kind;

  delete from analytics.analytics_events
  where created_at < now() - make_interval(days => retention_days);
end;
$$;

grant select, insert, update, delete on analytics.daily_rollup, analytics.link_daily_rollup to service_role;

grant select on
  analytics.daily, analytics.top_pages, analytics.sources, analytics.referrers,
  analytics.countries, analytics.devices, analytics.top_links, analytics.downloads,
  analytics.content_leaderboard, analytics.search_terms, analytics.copied_snippets,
  analytics.pdf_depth, analytics.sessions, analytics.web_vitals,
  analytics.web_vitals_overall
to authenticated;
