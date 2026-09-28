-- Per-user admin membership is private and provisioned explicitly by an operator via SQL.
alter table public.studio_admin_users add column if not exists active boolean not null default true;
alter table public.studio_admin_users enable row level security;
revoke all on public.studio_admin_users from anon, authenticated;
grant all on public.studio_admin_users to service_role;

-- Renderer presets use the existing private studio_records(kind='presets') store.
-- They are published through the server projection, never a public database policy.
create or replace function public.studio_guard_presets() returns trigger language plpgsql set search_path = '' as $$
declare next_revision numeric;
begin
  if old.kind = 'presets' then
    if tg_op = 'DELETE' then raise exception 'Archive presets to retain version history'; end if;
    if old.payload->'id' is distinct from new.payload->'id'
      or old.payload->'mode' is distinct from new.payload->'mode'
      or old.payload->'createdAt' is distinct from new.payload->'createdAt' then
      raise exception 'Preset identity is immutable';
    end if;
    -- Reject missing/null, nonnumeric and fractional values before checking the increment.
    -- A plain <> comparison evaluates to SQL NULL for a missing revision and does not raise.
    if jsonb_typeof(new.payload->'revision') is distinct from 'number' then
      raise exception 'Preset revision must be a positive integer';
    end if;
    next_revision := (new.payload->>'revision')::numeric;
    if next_revision <= 0 or next_revision > 2147483647 or next_revision <> trunc(next_revision) then
      raise exception 'Preset revision must be a positive integer';
    end if;
    if next_revision is distinct from (old.payload->>'revision')::numeric + 1 then
      raise exception 'Preset revision must advance one step';
    end if;
    if jsonb_array_length(new.payload->'versions') < jsonb_array_length(old.payload->'versions')
      or exists (select 1 from jsonb_array_elements(old.payload->'versions') with ordinality a(value,n)
        where a.value is distinct from (new.payload->'versions')->((a.n-1)::integer)) then
      raise exception 'Preset versions are immutable and append only';
    end if;
    if jsonb_array_length(new.payload->'audit') < jsonb_array_length(old.payload->'audit')
      or exists (select 1 from jsonb_array_elements(old.payload->'audit') with ordinality a(value,n)
        where a.value is distinct from (new.payload->'audit')->((a.n-1)::integer)) then
      raise exception 'Preset audit history is append only';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists studio_immutable_presets on public.studio_records;
create trigger studio_immutable_presets before update or delete on public.studio_records for each row execute function public.studio_guard_presets();

create or replace function public.studio_replace_preset(preset_id text, expected_payload jsonb, replacement_payload jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  update public.studio_records set payload = replacement_payload
    where kind = 'presets' and id = preset_id and payload = expected_payload;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke execute on function public.studio_replace_preset(text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.studio_replace_preset(text,jsonb,jsonb) to service_role;
