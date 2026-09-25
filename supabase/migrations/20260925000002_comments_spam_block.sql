-- Marking a comment 'spam' now actually does something: future submissions
-- from that same ip_hash or visitor_hash are silently dropped (the RPC
-- returns null instead of inserting) so repeat offenders think it worked
-- and don't bother rotating anything. 'rejected' stays a no-consequence
-- "not for this site" call with no lasting effect on the submitter.
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
  v_ip_hash text := nullif(left(p ->> 'ip_hash', 64), '');
  v_visitor_hash text := nullif(left(p ->> 'visitor_hash', 64), '');
  v_blocked boolean;
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

  select exists (
    select 1 from public.comments c
    where c.status = 'spam'
      and (
        (v_ip_hash is not null and c.ip_hash = v_ip_hash)
        or (v_visitor_hash is not null and c.visitor_hash = v_visitor_hash)
      )
  ) into v_blocked;

  if v_blocked then
    return null;
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
    v_ip_hash,
    v_visitor_hash
  ) returning id into new_id;

  return new_id;
end;
$$;
