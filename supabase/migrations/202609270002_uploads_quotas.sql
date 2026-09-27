alter table public.studio_records drop constraint if exists studio_records_kind_check;
alter table public.studio_records add constraint studio_records_kind_check check (kind in ('designs','checkouts','orders','events','presets','uploads'));
create table if not exists public.studio_quotas (
  key text primary key,
  count integer not null default 1,
  expires_at timestamptz not null
);
alter table public.studio_quotas enable row level security;
revoke all on public.studio_quotas from anon, authenticated;
grant all on public.studio_quotas to service_role;
create index if not exists studio_quotas_expiry on public.studio_quotas(expires_at);
create or replace function public.studio_take_quota(quota_key text, quota_limit integer, expires_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  if quota_limit < 1 or quota_limit > 100000 then return false; end if;
  delete from public.studio_quotas q where q.expires_at < now();
  insert into public.studio_quotas(key, count, expires_at) values (quota_key, 1, expires_at)
  on conflict (key) do update set count = public.studio_quotas.count + 1
  where public.studio_quotas.count < quota_limit;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke execute on function public.studio_take_quota(text,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.studio_take_quota(text,integer,timestamptz) to service_role;
