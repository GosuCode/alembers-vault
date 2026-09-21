-- Analytics hardening (Supabase advisor follow-ups).
-- 1. Pin search_path on the tiny cast helpers.
-- 2. Restrict is_admin() execute to authenticated only (anon never needs it;
--    it is only referenced by authenticated RLS policies).

create or replace function analytics.safe_int(txt text, lo int, hi int)
returns int
language sql
immutable
set search_path = ''
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
set search_path = ''
as $$
  select case
    when txt ~ '^-?[0-9]{1,18}(\.[0-9]{1,9})?$'
    then least(greatest(txt::numeric, lo), hi)::double precision
  end;
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
