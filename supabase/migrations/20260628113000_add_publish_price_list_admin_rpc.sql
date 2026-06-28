begin;

create or replace function public.publish_price_list_admin(
  p_price_list_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target public.price_lists%rowtype;
  v_current_active public.price_lists%rowtype;
  v_published public.price_lists%rowtype;
  v_published_at timestamp with time zone := now();
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_price_list_id is null then
    raise exception 'Price list id is required.';
  end if;

  select *
  into v_target
  from public.price_lists pl
  where pl.id = p_price_list_id
  for update;

  if not found then
    raise exception 'HUB price list % does not exist.', p_price_list_id;
  end if;

  if v_target.status <> 'draft' then
    raise exception 'Only draft price lists can be published.';
  end if;

  if v_target.is_active = true then
    raise exception 'The selected draft is already active.';
  end if;

  select *
  into v_current_active
  from public.price_lists pl
  where pl.is_active = true
  order by pl.effective_from desc nulls last, pl.created_at desc, pl.id desc
  limit 1
  for update;

  if not found then
    raise exception 'No active HUB price list is configured.';
  end if;

  if v_current_active.id = v_target.id then
    raise exception 'The selected price list is already the active list.';
  end if;

  update public.price_lists pl
  set is_active = false
  where pl.id = v_current_active.id;

  update public.price_lists pl
  set
    status = 'published',
    is_active = true,
    updated_at = v_published_at
  where pl.id = v_target.id
  returning *
  into v_published;

  insert into public.price_audit_log (
    price_list_id,
    entity_type,
    entity_id,
    action,
    changed_by_user_id,
    before_data,
    after_data,
    reason
  )
  values (
    v_published.id,
    'price_list',
    v_published.id,
    'draft_published',
    v_uid,
    jsonb_build_object(
      'id', v_current_active.id,
      'version', v_current_active.version,
      'name', v_current_active.name,
      'status', v_current_active.status,
      'is_active', false
    ),
    jsonb_build_object(
      'id', v_published.id,
      'version', v_published.version,
      'name', v_published.name,
      'status', v_published.status,
      'is_active', v_published.is_active
    ),
    v_reason
  );

  return jsonb_build_object(
    'ok', true,
    'published', jsonb_build_object(
      'id', v_published.id,
      'version', v_published.version,
      'name', v_published.name,
      'status', v_published.status,
      'is_active', v_published.is_active
    ),
    'replaced', jsonb_build_object(
      'id', v_current_active.id,
      'version', v_current_active.version,
      'name', v_current_active.name
    ),
    'published_at', v_published_at
  );
end;
$function$;

grant execute on function public.publish_price_list_admin(uuid, text)
  to authenticated;

comment on function public.publish_price_list_admin(uuid, text) is
  'Admin-only HUB Prices publish helper that atomically swaps the active price list to a selected draft and records one audit entry.';

commit;
