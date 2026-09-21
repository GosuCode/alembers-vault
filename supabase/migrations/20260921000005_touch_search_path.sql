-- Pin search_path on the audit trigger function (Supabase advisor 0011).
create or replace function public.touch_academic_resource()
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
