begin;

create or replace function public.update_price_cell_admin(
  p_cell_id uuid,
  p_retail_price numeric,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  product_id uuid,
  column_id uuid,
  retail_price numeric,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cell public.price_cells%rowtype;
  v_updated public.price_cells%rowtype;
  v_product public.price_products%rowtype;
  v_column public.price_matrix_columns%rowtype;
  v_price_list public.price_lists%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before_data jsonb;
  v_after_data jsonb;
  v_column_public_id text;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_cell_id is null then
    raise exception 'Cell id is required.';
  end if;

  if p_retail_price is null then
    raise exception 'Retail price is required.';
  end if;

  if p_retail_price < 0 then
    raise exception 'Retail price must be greater than or equal to 0.';
  end if;

  select *
  into v_cell
  from public.price_cells pc
  where pc.id = p_cell_id
  limit 1;

  if not found then
    raise exception 'That price cell could not be found.';
  end if;

  select *
  into v_product
  from public.price_products pp
  where pp.id = v_cell.product_id
  limit 1;

  if not found then
    raise exception 'That cell is not attached to a valid price product.';
  end if;

  select *
  into v_column
  from public.price_matrix_columns pmc
  where pmc.id = v_cell.column_id
  limit 1;

  if not found then
    raise exception 'That cell is not attached to a valid price column.';
  end if;

  if v_product.price_list_id <> v_column.price_list_id then
    raise exception 'That price cell has inconsistent product/column price list data.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = v_product.price_list_id
  limit 1;

  if not found then
    raise exception 'That cell is not attached to a valid price list.';
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be edited.';
  end if;

  v_column_public_id := coalesce(v_column.matrix_key, v_column.id::text);

  v_before_data := jsonb_build_object(
    'id', v_cell.id,
    'price_list_id', v_product.price_list_id,
    'product_id', v_cell.product_id,
    'column_id', v_cell.column_id,
    'retail_price', v_cell.retail_price,
    'product_matrix_key', v_product.matrix_key,
    'product_name', v_product.name,
    'column_matrix_key', v_column_public_id,
    'column_supplier', v_column.supplier,
    'column_range', v_column.range
  );

  update public.price_cells pc
  set retail_price = p_retail_price
  where pc.id = p_cell_id
  returning *
  into v_updated;

  v_after_data := jsonb_build_object(
    'id', v_updated.id,
    'price_list_id', v_product.price_list_id,
    'product_id', v_updated.product_id,
    'column_id', v_updated.column_id,
    'retail_price', v_updated.retail_price,
    'product_matrix_key', v_product.matrix_key,
    'product_name', v_product.name,
    'column_matrix_key', v_column_public_id,
    'column_supplier', v_column.supplier,
    'column_range', v_column.range
  );

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
    v_product.price_list_id,
    'cell',
    v_updated.id,
    'cell_updated',
    v_uid,
    v_before_data,
    v_after_data,
    v_reason
  );

  return query
  select
    v_updated.id,
    v_product.price_list_id,
    v_updated.product_id,
    v_updated.column_id,
    v_updated.retail_price,
    v_updated.updated_at;
end;
$function$;

grant execute on function public.update_price_cell_admin(
  uuid,
  numeric,
  text
) to authenticated;

commit;
