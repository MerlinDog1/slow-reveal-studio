-- Run against a test database after migrations 001–004. All fixtures roll back.
-- This exercises the actual trigger/RPC, including SQL NULL semantics.
begin;
do $$
declare
  preset_id text := 'preset-revision-regression-' || txid_current()::text;
  original jsonb;
  replacement jsonb;
  invalid_revision jsonb;
begin
  original := jsonb_build_object(
    'id', preset_id, 'mode', 'dots', 'createdAt', '2026-09-28T00:00:00Z',
    'revision', 1, 'versions', '[{"version":1}]'::jsonb,
    'audit', '[{"action":"create"}]'::jsonb
  );
  insert into public.studio_records(kind, id, payload) values ('presets', preset_id, original);

  -- Missing revision is different from a JSON null value; reject both.
  begin
    perform public.studio_replace_preset(preset_id, original, original - 'revision');
    raise exception 'Missing revision was accepted' using errcode = 'P0002';
  exception when sqlstate 'P0001' then null;
  end;
  for invalid_revision in select value from jsonb_array_elements('[null,"2",true,0,-1,2.5,3,2147483648]'::jsonb) loop
    begin
      perform public.studio_replace_preset(preset_id, original, jsonb_set(original, '{revision}', invalid_revision));
      raise exception 'Invalid revision was accepted: %', invalid_revision using errcode = 'P0002';
    exception when sqlstate 'P0001' then null;
    end;
  end loop;

  replacement := jsonb_set(original, '{revision}', '2'::jsonb);
  if public.studio_replace_preset(preset_id, original, replacement) is distinct from true then
    raise exception 'A valid next revision was rejected';
  end if;
  if public.studio_replace_preset(preset_id, original, replacement) is distinct from false then
    raise exception 'A stale expected payload was accepted';
  end if;
end;
$$;
rollback;
