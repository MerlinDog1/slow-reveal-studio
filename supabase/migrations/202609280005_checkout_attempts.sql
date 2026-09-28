-- Durable retry identity and publication CAS. Existing RLS remains server-only.
alter table public.studio_records drop constraint if exists studio_records_kind_check;
alter table public.studio_records add constraint studio_records_kind_check check (kind in ('designs','checkouts','orders','events','presets','uploads','checkout-attempts'));

create or replace function public.studio_guard_checkout_attempt() returns trigger language plpgsql set search_path = '' as $$
declare mutable text[] := array['state','assets','publishedAt','stripeStartedAt','stripeLeaseId','stripeLeaseAt','sessionId','sessionUrl','closedAt','cleanupCheckedAt'];
begin
  if old.kind = 'checkouts' and tg_op = 'UPDATE' and old.payload ? 'sessionId' and old.payload->'sessionId' is distinct from new.payload->'sessionId' then raise exception 'Checkout session identity is immutable'; end if;
  if old.kind <> 'checkout-attempts' then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if tg_op = 'DELETE' then raise exception 'Checkout attempt tombstones must be retained'; end if;
  if (old.payload - mutable) is distinct from (new.payload - mutable) then raise exception 'Checkout attempt parameters are immutable'; end if;
  if (old.payload ? 'publishedAt' and old.payload->'publishedAt' is distinct from new.payload->'publishedAt')
    or (old.payload ? 'stripeStartedAt' and old.payload->'stripeStartedAt' is distinct from new.payload->'stripeStartedAt')
    or (old.payload ? 'sessionId' and old.payload->'sessionId' is distinct from new.payload->'sessionId') then raise exception 'Checkout attempt history is immutable'; end if;
  if jsonb_array_length(old.payload->'assets') > 0 and old.payload->'assets' is distinct from new.payload->'assets' then raise exception 'Checkout asset ledger is immutable'; end if;
  if not (case old.payload->>'state'
    when 'producing' then new.payload->>'state' in ('producing','prepared','closed')
    when 'prepared' then new.payload->>'state' in ('prepared','submitting','closed','ready')
    when 'submitting' then new.payload->>'state' in ('submitting','ready','needs-review','closed')
    when 'ready' then new.payload->>'state' in ('ready','closed','needs-review')
    when 'needs-review' then new.payload->>'state' in ('needs-review','ready','closed')
    when 'closed' then new.payload->>'state' = 'closed'
    else false end) is true then raise exception 'Invalid checkout attempt transition'; end if;
  return new;
end;
$$;
create trigger studio_checkout_attempt_guard before update or delete on public.studio_records for each row execute function public.studio_guard_checkout_attempt();

create or replace function public.studio_replace_checkout_attempt(attempt_id text, expected_payload jsonb, replacement_payload jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  update public.studio_records set payload = replacement_payload where kind = 'checkout-attempts' and id = attempt_id and payload = expected_payload;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.studio_publish_checkout_attempt(attempt_id text, expected_payload jsonb, replacement_payload jsonb, checkout_payload jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_payload jsonb;
begin
  select payload into current_payload from public.studio_records where kind = 'checkout-attempts' and id = attempt_id for update;
  if current_payload is distinct from expected_payload then return false; end if;
  if expected_payload->>'state' is distinct from 'producing' or replacement_payload->>'state' is distinct from 'prepared'
    or checkout_payload->>'id' is distinct from expected_payload->>'orderId'
    or checkout_payload->>'attemptId' is distinct from attempt_id
    or checkout_payload->'package'->>'snapshotHash' is distinct from expected_payload->>'proofHash'
    or checkout_payload->'amountPence' is distinct from expected_payload->'amountPence'
    or checkout_payload->'tokenHash' is distinct from expected_payload->'tokenHash'
    or coalesce(jsonb_array_length(expected_payload->'assets'),0) = 0 then raise exception 'Checkout publication does not match attempt'; end if;
  insert into public.studio_records(kind,id,payload) values ('checkouts',checkout_payload->>'id',checkout_payload);
  update public.studio_records set payload = replacement_payload where kind = 'checkout-attempts' and id = attempt_id;
  return true;
end;
$$;
revoke execute on function public.studio_replace_checkout_attempt(text,jsonb,jsonb), public.studio_publish_checkout_attempt(text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.studio_replace_checkout_attempt(text,jsonb,jsonb), public.studio_publish_checkout_attempt(text,jsonb,jsonb,jsonb) to service_role;
