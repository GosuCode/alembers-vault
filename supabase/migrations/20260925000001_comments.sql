-- Comment threads for blog posts, academic resources, and projects.
-- Anonymous visitors submit via public.submit_comment (token-gated, mirrors
-- analytics.ingest_event), land as 'pending', and only show up publicly once
-- an admin flips them to 'approved'. Replies nest via parent_id.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('blog', 'project', 'academic')),
  content_slug text not null check (char_length(content_slug) between 1 and 200),
  parent_id uuid references public.comments (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  author_email text check (author_email is null or char_length(author_email) <= 254),
  body text not null check (char_length(body) between 1 and 3000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'spam')),
  ip_hash text,
  visitor_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index comments_thread_idx
  on public.comments (content_type, content_slug, status, created_at);

create index comments_parent_idx
  on public.comments (parent_id);

create index comments_status_idx
  on public.comments (status, created_at);

-- ── moderation audit trail ──────────────────────────────────────────────────
create or replace function public.touch_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger comments_touch
  before update on public.comments
  for each row execute function public.touch_comment();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.comments enable row level security;

create policy "approved comments are publicly readable" on public.comments
  for select to anon, authenticated
  using (status = 'approved');

create policy "admin manage comments" on public.comments
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.comments to authenticated;
grant select on public.comments to anon;

-- ── anonymous submission RPC ────────────────────────────────────────────────
-- Same shared-secret gate as analytics.ingest_event: the Worker holds
-- INGEST_TOKEN and is the only caller, after its own honeypot + rate limit
-- checks. Bypasses RLS (security definer) so it can insert 'pending' rows
-- that the submitter itself can't then read back.
create or replace function public.submit_comment(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'analytics', 'extensions'
as $$
declare
  t text := p ->> 'token';
  v_content_type text := p ->> 'content_type';
  v_content_slug text := left(p ->> 'content_slug', 200);
  v_parent uuid := nullif(p ->> 'parent_id', '')::uuid;
  v_parent_type text;
  v_parent_slug text;
  v_parent_status text;
  new_id uuid;
begin
  if t is null
     or encode(digest(t, 'sha256'), 'hex') <> (
       select c.token_hash from analytics.ingest_config c where c.id
     ) then
    raise exception 'invalid token' using errcode = '28000';
  end if;

  if v_content_type not in ('blog', 'project', 'academic') then
    raise exception 'invalid content_type' using errcode = '22023';
  end if;

  if v_parent is not null then
    select content_type, content_slug, status
      into v_parent_type, v_parent_slug, v_parent_status
      from public.comments where id = v_parent;
    if not found
       or v_parent_status <> 'approved'
       or v_parent_type <> v_content_type
       or v_parent_slug <> v_content_slug then
      raise exception 'invalid parent comment' using errcode = '22023';
    end if;
  end if;

  insert into public.comments (
    content_type, content_slug, parent_id, author_name, author_email, body,
    ip_hash, visitor_hash
  ) values (
    v_content_type,
    v_content_slug,
    v_parent,
    left(p ->> 'author_name', 80),
    nullif(left(p ->> 'author_email', 254), ''),
    left(p ->> 'body', 3000),
    left(p ->> 'ip_hash', 64),
    left(p ->> 'visitor_hash', 64)
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.submit_comment(jsonb) from public;
grant execute on function public.submit_comment(jsonb) to anon, authenticated;
