begin;

create or replace function public.set_price_product_active_admin(
  p_product_id uuid,
  p_is_active boolean,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  section_id uuid,
  matrix_key text,
  name text,
  sort_order integer,
  is_active boolean,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_product public.price_products%rowtype;
  v_updated public.price_products%rowtype;
  v_price_list public.price_lists%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before_data jsonb;
  v_after_data jsonb;
  v_action text;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_product_id is null then
    raise exception 'Product id is required.';
  end if;

  if p_is_active is null then
    raise exception 'Active state is required.';
  end if;

  select *
  into v_product
  from public.price_products p
  where p.id = p_product_id
  limit 1;

  if not found then
    raise exception 'That price product could not be found.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = v_product.price_list_id
  limit 1;

  if not found then
    raise exception 'That product is not attached to a valid price list.';
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be changed structurally.';
  end if;

  if v_product.is_active = p_is_active then
    raise exception 'That product is already in the requested visibility state.';
  end if;

  v_before_data := jsonb_build_object(
    'id', v_product.id,
    'price_list_id', v_product.price_list_id,
    'section_id', v_product.section_id,
    'matrix_key', v_product.matrix_key,
    'name', v_product.name,
    'sort_order', v_product.sort_order,
    'cloth_required', v_product.cloth_required,
    'cmt_price', v_product.cmt_price,
    'delivery_weeks_min', v_product.delivery_weeks_min,
    'delivery_weeks_max', v_product.delivery_weeks_max,
    'notes', v_product.notes,
    'is_active', v_product.is_active
  );

  update public.price_products p
  set is_active = p_is_active
  where p.id = p_product_id
  returning *
  into v_updated;

  v_after_data := jsonb_build_object(
    'id', v_updated.id,
    'price_list_id', v_updated.price_list_id,
    'section_id', v_updated.section_id,
    'matrix_key', v_updated.matrix_key,
    'name', v_updated.name,
    'sort_order', v_updated.sort_order,
    'cloth_required', v_updated.cloth_required,
    'cmt_price', v_updated.cmt_price,
    'delivery_weeks_min', v_updated.delivery_weeks_min,
    'delivery_weeks_max', v_updated.delivery_weeks_max,
    'notes', v_updated.notes,
    'is_active', v_updated.is_active
  );

  v_action := case when p_is_active then 'product_restored' else 'product_archived' end;

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
    v_updated.price_list_id,
    'product',
    v_updated.id,
    v_action,
    v_uid,
    v_before_data,
    v_after_data,
    v_reason
  );

  return query
  select
    v_updated.id,
    v_updated.price_list_id,
    v_updated.section_id,
    v_updated.matrix_key,
    v_updated.name,
    v_updated.sort_order,
    v_updated.is_active,
    v_updated.updated_at;
end;
$function$;

create or replace function public.set_price_matrix_column_active_admin(
  p_column_id uuid,
  p_is_active boolean,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  matrix_key text,
  supplier text,
  range text,
  supplier_sort_order integer,
  sort_order integer,
  is_active boolean,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_column public.price_matrix_columns%rowtype;
  v_updated public.price_matrix_columns%rowtype;
  v_price_list public.price_lists%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before_data jsonb;
  v_after_data jsonb;
  v_action text;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_column_id is null then
    raise exception 'Column id is required.';
  end if;

  if p_is_active is null then
    raise exception 'Active state is required.';
  end if;

  select *
  into v_column
  from public.price_matrix_columns c
  where c.id = p_column_id
  limit 1;

  if not found then
    raise exception 'That price column could not be found.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = v_column.price_list_id
  limit 1;

  if not found then
    raise exception 'That column is not attached to a valid price list.';
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be changed structurally.';
  end if;

  if v_column.is_active = p_is_active then
    raise exception 'That column is already in the requested visibility state.';
  end if;

  v_before_data := jsonb_build_object(
    'id', v_column.id,
    'price_list_id', v_column.price_list_id,
    'matrix_key', v_column.matrix_key,
    'supplier', v_column.supplier,
    'range', v_column.range,
    'width', v_column.width,
    'weight', v_column.weight,
    'supplier_sort_order', v_column.supplier_sort_order,
    'sort_order', v_column.sort_order,
    'external_weaver_id', v_column.external_weaver_id,
    'external_range_id', v_column.external_range_id,
    'is_active', v_column.is_active
  );

  update public.price_matrix_columns c
  set is_active = p_is_active
  where c.id = p_column_id
  returning *
  into v_updated;

  v_after_data := jsonb_build_object(
    'id', v_updated.id,
    'price_list_id', v_updated.price_list_id,
    'matrix_key', v_updated.matrix_key,
    'supplier', v_updated.supplier,
    'range', v_updated.range,
    'width', v_updated.width,
    'weight', v_updated.weight,
    'supplier_sort_order', v_updated.supplier_sort_order,
    'sort_order', v_updated.sort_order,
    'external_weaver_id', v_updated.external_weaver_id,
    'external_range_id', v_updated.external_range_id,
    'is_active', v_updated.is_active
  );

  v_action := case when p_is_active then 'column_restored' else 'column_archived' end;

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
    v_updated.price_list_id,
    'column',
    v_updated.id,
    v_action,
    v_uid,
    v_before_data,
    v_after_data,
    v_reason
  );

  return query
  select
    v_updated.id,
    v_updated.price_list_id,
    v_updated.matrix_key,
    v_updated.supplier,
    v_updated.range,
    v_updated.supplier_sort_order,
    v_updated.sort_order,
    v_updated.is_active,
    v_updated.updated_at;
end;
$function$;

commit;
