-- Server-only access. Browser clients receive neither privileges nor permissive policies.
create table if not exists public.studio_records (
  kind text not null check (kind in ('designs','checkouts','orders','events','presets')),
  id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (kind, id)
);
create index if not exists studio_records_kind_created on public.studio_records(kind, created_at desc);
create table if not exists public.studio_catalogue (
  id text primary key,
  definition jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.studio_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('reviewer','operator')),
  created_at timestamptz not null default now()
);
alter table public.studio_records enable row level security;
alter table public.studio_catalogue enable row level security;
alter table public.studio_admin_users enable row level security;
revoke all on public.studio_records, public.studio_catalogue, public.studio_admin_users from anon, authenticated;
grant all on public.studio_records, public.studio_catalogue, public.studio_admin_users to service_role;

create or replace function public.studio_guard_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.kind = 'orders' then
    if tg_op = 'DELETE' then raise exception 'Accounting records cannot be deleted; use artwork erasure tooling'; end if;
    if old.payload->'originalSnapshot' is distinct from new.payload->'originalSnapshot'
      or old.payload->'stripeSessionId' is distinct from new.payload->'stripeSessionId'
      or old.payload->'paymentStatus' is distinct from new.payload->'paymentStatus'
      or old.payload->'amountPence' is distinct from new.payload->'amountPence'
      or old.payload->'tokenHash' is distinct from new.payload->'tokenHash'
      or old.payload->'id' is distinct from new.payload->'id' then
      raise exception 'Paid snapshot is immutable; append a production revision';
    end if;
    if jsonb_array_length(new.payload->'revisions') < jsonb_array_length(old.payload->'revisions') then raise exception 'Revision history is append only'; end if;
    if exists (select 1 from jsonb_array_elements(old.payload->'revisions') with ordinality r(value, n) where r.value is distinct from (new.payload->'revisions')->((r.n-1)::integer)) then raise exception 'Existing revisions are immutable'; end if;
    if jsonb_array_length(new.payload->'audit') < jsonb_array_length(old.payload->'audit') then raise exception 'Audit history is append only'; end if;
    if exists (select 1 from jsonb_array_elements(old.payload->'audit') with ordinality a(value, n) where a.value is distinct from (new.payload->'audit')->((a.n-1)::integer)) then raise exception 'Audit history is append only'; end if;
  end if;
  if old.kind = 'checkouts' and tg_op = 'UPDATE' and (old.payload - 'sessionId') is distinct from (new.payload - 'sessionId') then raise exception 'Checkout snapshot is immutable'; end if;
  if old.kind = 'designs' and tg_op = 'UPDATE' then raise exception 'Saved designs are immutable; save a new revision'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists studio_immutable_snapshot on public.studio_records;
create trigger studio_immutable_snapshot before update or delete on public.studio_records for each row execute function public.studio_guard_immutable();

create or replace function public.studio_replace_order(order_id text, expected_payload jsonb, replacement_payload jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  update public.studio_records set payload = replacement_payload where kind = 'orders' and id = order_id and payload = expected_payload;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke execute on function public.studio_replace_order(text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.studio_replace_order(text,jsonb,jsonb) to service_role;

-- Catalogue deliberately starts as a prototype. Cost, tax and inventory review must precede approval.
insert into public.studio_catalogue(id, definition) values ('current', '{
  "prototype": true,
  "products": [
    {"id":"30x40","label":"30 × 40 cm","widthMm":300,"heightMm":400,"pricePence":4900},
    {"id":"40x50","label":"40 × 50 cm","widthMm":400,"heightMm":500,"pricePence":6900},
    {"id":"40x60","label":"40 × 60 cm","widthMm":400,"heightMm":600,"pricePence":7900},
    {"id":"50x70","label":"50 × 70 cm","widthMm":500,"heightMm":700,"pricePence":9900},
    {"id":"60x80","label":"60 × 80 cm","widthMm":600,"heightMm":800,"pricePence":12900}
  ],
  "finishes": [
    {"id":"rolled","label":"Rolled canvas","additionalPence":0},
    {"id":"stretched","label":"Stretched canvas","additionalPence":1500},
    {"id":"board","label":"Canvas board","additionalPence":800}
  ]
}'::jsonb) on conflict (id) do nothing;
