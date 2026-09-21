-- Alember's Vault — analytics core
-- Creates the analytics schema, events table, admin gate, ingest RPC,
-- redirects table, and dashboard views.
--
-- Applied via Supabase MCP; this file is the source of truth in the repo.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists analytics;

grant usage on schema analytics to anon, authenticated, service_role;

-- ── events ──────────────────────────────────────────────────────────────────
create table if not exists analytics.analytics_events (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  event_type    text not null default 'pageview'
                check (event_type in ('pageview','click','download','pdf_open',
                                      'engagement','search','copy','not_found')),
  path          text not null,
  title         text,
  referrer      text,
  referrer_host text,
  source        text,
  country       text,
  region        text,
  city          text,
  continent     text,
  colo          text,
  asn           integer,
  timezone      text,
  latitude      double precision,
  longitude     double precision,
  user_agent    text,
  device_type   text,
  browser       text,
  os            text,
  is_bot        boolean not null default false,
  session_hash  text,
  visitor_hash  text,
  ip_hash       text,
  cf_ray        text,
  duration_ms   integer,
  scroll_depth  smallint,
  link_url      text,
  link_text     text,
  link_host     text,
  link_kind     text,
  link_region   text,
  is_external   boolean,
  has_download  boolean,
  target        text,
  rel           text,
  content_type  text,
  content_slug  text,
  meta          jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_created_at_idx on analytics.analytics_events (created_at desc);
create index if not exists analytics_events_type_idx       on analytics.analytics_events (event_type);
create index if not exists analytics_events_path_idx       on analytics.analytics_events (path);
create index if not exists analytics_events_visitor_idx    on analytics.analytics_events (visitor_hash);
create index if not exists analytics_events_session_idx    on analytics.analytics_events (session_hash);
create index if not exists analytics_events_content_idx    on analytics.analytics_events (content_slug);
create index if not exists analytics_events_link_host_idx  on analytics.analytics_events (link_host);

alter table analytics.analytics_events enable row level security;

-- ── admins + gate ───────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "admin read analytics" on analytics.analytics_events;
create policy "admin read analytics" on analytics.analytics_events
  for select to authenticated
  using (public.is_admin());

-- ── ingest token + RPC (scoped, no service role in the Worker) ───────────────
create table if not exists analytics.ingest_config (
  id         boolean primary key default true check (id),
  token_hash text not null
);

alter table analytics.ingest_config enable row level security;
-- No policies: only the SECURITY DEFINER function can read it.

create or replace function analytics.safe_int(txt text, lo int, hi int)
returns int
language sql
immutable
as $$
  select case
    when txt ~ '^-?[0-9]{1,19}$'
    then least(greatest(txt::numeric, lo), hi)::int
  end;
$$;

create or replace function analytics.safe_num(txt text, lo numeric, hi numeric)
returns double precision
language sql
immutable
as $$
  select case
    when txt ~ '^-?[0-9]{1,18}(\.[0-9]{1,9})?$'
    then least(greatest(txt::numeric, lo), hi)::double precision
  end;
$$;

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
      ('pageview','click','download','pdf_open','engagement','search','copy','not_found')
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

grant execute on function analytics.ingest_event(jsonb) to anon, authenticated;

-- ── redirects (filename renames must not break live URLs) ───────────────────
create table if not exists public.redirects (
  from_path  text primary key,
  to_path    text not null,
  status     int not null default 301 check (status in (301, 302, 307, 308)),
  created_at timestamptz not null default now()
);

alter table public.redirects enable row level security;

drop policy if exists "public read redirects" on public.redirects;
create policy "public read redirects" on public.redirects
  for select to anon, authenticated using (true);

drop policy if exists "admin manage redirects" on public.redirects;
create policy "admin manage redirects" on public.redirects
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── dashboard views (security_invoker so RLS still applies) ─────────────────
create or replace view analytics.daily with (security_invoker = true) as
select
  (created_at at time zone 'UTC')::date as day,
  count(*) filter (where event_type = 'pageview') as pageviews,
  count(distinct visitor_hash) filter (where event_type = 'pageview') as visitors,
  count(*) filter (where event_type = 'click') as clicks,
  count(*) filter (where event_type = 'download') as downloads,
  count(*) filter (where event_type = 'not_found') as not_found,
  coalesce(round(avg(duration_ms) filter (where event_type = 'engagement' and duration_ms >= 1000)), 0)::int as avg_duration_ms
from analytics.analytics_events
group by 1;

create or replace view analytics.top_pages with (security_invoker = true) as
select
  path,
  max(title) as title,
  count(*) filter (where event_type = 'pageview') as pageviews,
  count(distinct visitor_hash) filter (where event_type = 'pageview') as visitors,
  coalesce(round(avg(duration_ms) filter (where event_type = 'engagement' and duration_ms >= 1000)), 0)::int as avg_duration_ms,
  coalesce(round(avg(scroll_depth) filter (where event_type = 'engagement')), 0)::int as avg_scroll_depth
from analytics.analytics_events
group by path;

create or replace view analytics.sources with (security_invoker = true) as
select coalesce(source, 'other') as source,
       count(*) filter (where event_type = 'pageview') as pageviews,
       count(distinct visitor_hash) as visitors
from analytics.analytics_events
group by 1;

create or replace view analytics.referrers with (security_invoker = true) as
select coalesce(nullif(referrer_host, ''), 'direct') as referrer_host,
       count(*) as hits,
       count(distinct visitor_hash) as visitors
from analytics.analytics_events
where event_type = 'pageview'
group by 1;

create or replace view analytics.countries with (security_invoker = true) as
select coalesce(country, 'unknown') as country,
       count(*) as hits,
       count(distinct visitor_hash) as visitors
from analytics.analytics_events
where event_type = 'pageview'
group by 1;

create or replace view analytics.devices with (security_invoker = true) as
select coalesce(device_type, 'unknown') as device_type,
       coalesce(browser, 'unknown') as browser,
       coalesce(os, 'unknown') as os,
       count(*) as hits,
       count(distinct visitor_hash) as visitors
from analytics.analytics_events
where event_type = 'pageview'
group by 1, 2, 3;

create or replace view analytics.top_links with (security_invoker = true) as
select
  link_url,
  max(link_text) as link_text,
  max(link_kind) as link_kind,
  max(link_host) as link_host,
  count(*) as clicks,
  count(distinct visitor_hash) as visitors
from analytics.analytics_events
where event_type = 'click' and link_url is not null
group by link_url;

create or replace view analytics.downloads with (security_invoker = true) as
select
  coalesce(link_url, path) as link_url,
  max(link_text) as label,
  max(content_slug) as content_slug,
  count(*) as downloads,
  count(distinct visitor_hash) as visitors
from analytics.analytics_events
where event_type = 'download'
group by 1;

create or replace view analytics.content_leaderboard with (security_invoker = true) as
select
  content_type,
  content_slug,
  count(*) filter (where event_type = 'pageview') as pageviews,
  count(distinct visitor_hash) filter (where event_type = 'pageview') as visitors,
  coalesce(round(avg(duration_ms) filter (where event_type = 'engagement' and duration_ms >= 1000)), 0)::int as avg_duration_ms,
  count(*) filter (where event_type = 'click' and link_kind in ('repo','demo','dashboard','docs')) as outbound_clicks,
  count(*) filter (where event_type = 'download') as downloads
from analytics.analytics_events
where content_slug is not null
group by 1, 2;

create or replace view analytics.search_terms with (security_invoker = true) as
select
  meta ->> 'query' as query,
  count(*) as searches,
  count(*) filter (where meta ->> 'results' = '0') as zero_results
from analytics.analytics_events
where event_type = 'search' and meta ? 'query'
group by 1;

-- ── retention rollups ───────────────────────────────────────────────────────
create table if not exists analytics.daily_rollup (
  day             date not null,
  event_type      text not null,
  count           int not null default 0,
  visitors        int not null default 0,
  avg_duration_ms int,
  primary key (day, event_type)
);

create table if not exists analytics.link_daily_rollup (
  day       date not null,
  link_url  text not null,
  link_kind text,
  count     int not null default 0,
  primary key (day, link_url)
);

create or replace function analytics.rollup_and_prune(retention_days int default 90)
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
  insert into analytics.daily_rollup (day, event_type, count, visitors, avg_duration_ms)
  select
    (created_at at time zone 'UTC')::date,
    event_type,
    count(*),
    count(distinct visitor_hash),
    coalesce(round(avg(duration_ms) filter (where duration_ms >= 1000)), 0)::int
  from analytics.analytics_events
  where created_at < date_trunc('day', now())
  group by 1, 2
  on conflict (day, event_type) do update
    set count = excluded.count,
        visitors = excluded.visitors,
        avg_duration_ms = excluded.avg_duration_ms;

  insert into analytics.link_daily_rollup (day, link_url, link_kind, count)
  select
    (created_at at time zone 'UTC')::date,
    coalesce(link_url, ''),
    link_kind,
    count(*)
  from analytics.analytics_events
  where link_url is not null and created_at < date_trunc('day', now())
  group by 1, 2, 3
  on conflict (day, link_url) do update
    set count = excluded.count, link_kind = excluded.link_kind;

  delete from analytics.analytics_events
  where created_at < now() - make_interval(days => retention_days);
end;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
grant select on all tables in schema analytics to authenticated;
grant select, insert, update, delete on all tables in schema analytics to service_role;
grant usage, select on all sequences in schema analytics to service_role;
grant execute on function analytics.rollup_and_prune(int) to service_role;

alter default privileges in schema analytics grant select on tables to authenticated;
