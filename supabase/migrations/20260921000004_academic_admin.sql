-- Academic management: stable slugs, audit trail, admin write policies,
-- auth'd storage access, and a usage widget.

-- ── stable slug + audit columns ─────────────────────────────────────────────
alter table public.academic_resources
  add column if not exists slug text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid;

update public.academic_resources
set slug = lower(
  regexp_replace(regexp_replace(storage_path, '^.*/', ''), '\.[A-Za-z0-9]+$', '')
)
where slug is null or slug = '';

create index if not exists academic_resources_slug_idx
  on public.academic_resources (slug);

-- Paper URLs must be unique; project reports may share a filename across years.
create unique index if not exists academic_resources_slug_uniq_idx
  on public.academic_resources (slug)
  where category <> 'project-pdf';

create or replace function public.touch_academic_resource()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists academic_resources_touch on public.academic_resources;
create trigger academic_resources_touch
  before update on public.academic_resources
  for each row execute function public.touch_academic_resource();

-- ── admin write policies ────────────────────────────────────────────────────
drop policy if exists "admin insert academic" on public.academic_resources;
create policy "admin insert academic" on public.academic_resources
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin update academic" on public.academic_resources;
create policy "admin update academic" on public.academic_resources
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin delete academic" on public.academic_resources;
create policy "admin delete academic" on public.academic_resources
  for delete to authenticated using (public.is_admin());

grant insert, update, delete on public.academic_resources to authenticated;

-- ── storage access for admins (public read stays as-is) ─────────────────────
drop policy if exists "admin read academic storage" on storage.objects;
create policy "admin read academic storage" on storage.objects
  for select to authenticated
  using (bucket_id = 'academic' and public.is_admin());

drop policy if exists "admin insert academic storage" on storage.objects;
create policy "admin insert academic storage" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'academic' and public.is_admin());

drop policy if exists "admin update academic storage" on storage.objects;
create policy "admin update academic storage" on storage.objects
  for update to authenticated
  using (bucket_id = 'academic' and public.is_admin())
  with check (bucket_id = 'academic' and public.is_admin());

drop policy if exists "admin delete academic storage" on storage.objects;
create policy "admin delete academic storage" on storage.objects
  for delete to authenticated
  using (bucket_id = 'academic' and public.is_admin());

-- ── usage widget ────────────────────────────────────────────────────────────
create or replace function public.admin_usage()
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce(sum((o.metadata->>'size')::bigint), 0),
    'storage_objects', count(o.id),
    'resources', (select count(*) from public.academic_resources)
  ) into result
  from storage.objects o
  where o.bucket_id = 'academic';

  return result;
end;
$$;

revoke all on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated;
