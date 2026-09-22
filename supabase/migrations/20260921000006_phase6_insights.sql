-- Phase 6: copy events, PDF page-depth, sessions, web vitals.

-- ── allow the new event types ───────────────────────────────────────────────
alter table analytics.analytics_events
  drop constraint if exists analytics_events_event_type_check;
alter table analytics.analytics_events
  add constraint analytics_events_event_type_check
  check (event_type in ('pageview','click','download','pdf_open','engagement',
                        'search','copy','not_found','web_vital'));

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
    content_type, content_slug, meta
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
         then p -> 'meta' else '{}'::jsonb end
  );
end;
$$;

-- ── content leaderboard gains a "copies" column ─────────────────────────────
drop view if exists analytics.content_leaderboard;
create view analytics.content_leaderboard with (security_invoker = true) as
select
  content_type,
  content_slug,
  count(*) filter (where event_type = 'pageview') as pageviews,
  count(distinct visitor_hash) filter (where event_type = 'pageview') as visitors,
  coalesce(round(avg(duration_ms) filter (where event_type = 'engagement' and duration_ms >= 1000)), 0)::int as avg_duration_ms,
  count(*) filter (where event_type = 'click' and link_kind in ('repo','demo','dashboard','docs')) as outbound_clicks,
  count(*) filter (where event_type = 'download') as downloads,
  count(*) filter (where event_type = 'copy') as copies
from analytics.analytics_events
where content_slug is not null
group by 1, 2;

-- ── most-copied snippets ────────────────────────────────────────────────────
create or replace view analytics.copied_snippets with (security_invoker = true) as
select
  coalesce(nullif(meta ->> 'snippet', ''), '(no text)') as snippet,
  max(path) as path,
  count(*) as copies
from analytics.analytics_events
where event_type = 'copy'
group by 1;

-- ── PDF reading depth (how far into a paper people got) ─────────────────────
create or replace view analytics.pdf_depth with (security_invoker = true) as
select
  content_slug,
  max(path) as path,
  count(*) as reads,
  round(avg(case when meta ->> 'deepest' ~ '^[0-9]+$' then (meta ->> 'deepest')::int end))::int as avg_deepest,
  max(case when meta ->> 'pages' ~ '^[0-9]+$' then (meta ->> 'pages')::int end) as pages
from analytics.analytics_events
where event_type = 'engagement' and meta ->> 'surface' = 'pdf'
group by content_slug;

-- ── sessions (entry → path sequence → exit) ─────────────────────────────────
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
  max(source) as source
from analytics.analytics_events
where session_hash is not null
group by session_hash;

-- ── web vitals (p75 per path/metric) ────────────────────────────────────────
create or replace view analytics.web_vitals with (security_invoker = true) as
select
  path,
  coalesce(meta ->> 'metric', '') as metric,
  count(*) as samples,
  round(percentile_cont(0.75) within group (
    order by case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end
  ))::int as p75,
  round(avg(case when meta ->> 'value' ~ '^[0-9.]+$' then (meta ->> 'value')::numeric end))::int as avg
from analytics.analytics_events
where event_type = 'web_vital'
group by 1, 2;

grant select on
  analytics.content_leaderboard,
  analytics.copied_snippets,
  analytics.pdf_depth,
  analytics.sessions,
  analytics.web_vitals
to authenticated;

-- ── realtime for the "on site now" widget ───────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'analytics'
      and tablename = 'analytics_events'
  ) then
    alter publication supabase_realtime add table analytics.analytics_events;
  end if;
end;
$$;
