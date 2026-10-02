-- Preserve customer proof attestations alongside immutable artwork and audit history.
create or replace function public.studio_guard_customer_proofs() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.kind = 'orders' then
    if jsonb_typeof(coalesce(new.payload->'customerProofApprovals', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(new.payload->'customerProofApprovals', '[]'::jsonb)) < jsonb_array_length(coalesce(old.payload->'customerProofApprovals', '[]'::jsonb)) then
      raise exception 'Customer proof history is append only';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(old.payload->'customerProofApprovals', '[]'::jsonb)) with ordinality a(value, n)
      where a.value is distinct from (new.payload->'customerProofApprovals')->((a.n-1)::integer)) then
      raise exception 'Customer proof history is immutable';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists studio_immutable_customer_proofs on public.studio_records;
create trigger studio_immutable_customer_proofs before update on public.studio_records for each row execute function public.studio_guard_customer_proofs();
