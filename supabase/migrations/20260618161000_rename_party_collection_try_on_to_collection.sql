begin;

do $$
declare
  v_party_id uuid;
  v_collection_id uuid;
begin
  select id
  into v_party_id
  from public.appointment_types
  where lower(name) = lower('Party Collection Try On')
  order by created_at asc
  limit 1;

  select id
  into v_collection_id
  from public.appointment_types
  where lower(name) = lower('Collection')
  order by created_at asc
  limit 1;

  if v_party_id is not null and v_collection_id is null then
    update public.appointment_types
    set
      name = 'Collection',
      updated_at = now()
    where id = v_party_id;
  end if;
end $$;

commit;
