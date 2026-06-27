begin;

create or replace function public.update_price_product_admin(
  p_product_id uuid,
  p_name text default null,
  p_cloth_required text default null,
  p_cmt_price numeric default null,
  p_delivery_weeks_min integer default null,
  p_delivery_weeks_max integer default null,
  p_notes text default null,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  section_id uuid,
  matrix_key text,
  name text,
  cloth_required text,
  cmt_price numeric,
  delivery_weeks_min integer,
  delivery_weeks_max integer,
  notes text,
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
  v_name text := case when p_name is null then null else nullif(trim(p_name), '') end;
  v_cloth_required text := case when p_cloth_required is null then null else nullif(trim(p_cloth_required), '') end;
  v_notes text := case when p_notes is null then null else nullif(trim(p_notes), '') end;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before_data jsonb;
  v_after_data jsonb;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_product_id is null then
    raise exception 'Product id is required.';
  end if;

  if p_name is not null and v_name is null then
    raise exception 'Product name cannot be empty.';
  end if;

  if p_cmt_price is not null and p_cmt_price < 0 then
    raise exception 'CMT price must be null or greater than or equal to 0.';
  end if;

  if p_delivery_weeks_min is not null and p_delivery_weeks_min < 0 then
    raise exception 'Delivery weeks min must be null or greater than or equal to 0.';
  end if;

  if p_delivery_weeks_max is not null and p_delivery_weeks_max < 0 then
    raise exception 'Delivery weeks max must be null or greater than or equal to 0.';
  end if;

  select *
  into v_product
  from public.price_products pp
  where pp.id = p_product_id
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
    raise exception 'Only draft price lists can be edited.';
  end if;

  if coalesce(p_delivery_weeks_min, v_product.delivery_weeks_min) is not null
     and coalesce(p_delivery_weeks_max, v_product.delivery_weeks_max) is not null
     and coalesce(p_delivery_weeks_min, v_product.delivery_weeks_min)
       > coalesce(p_delivery_weeks_max, v_product.delivery_weeks_max) then
    raise exception 'Delivery weeks min cannot be greater than delivery weeks max.';
  end if;

  v_before_data := jsonb_build_object(
    'id', v_product.id,
    'price_list_id', v_product.price_list_id,
    'section_id', v_product.section_id,
    'matrix_key', v_product.matrix_key,
    'name', v_product.name,
    'cloth_required', v_product.cloth_required,
    'cmt_price', v_product.cmt_price,
    'delivery_weeks_min', v_product.delivery_weeks_min,
    'delivery_weeks_max', v_product.delivery_weeks_max,
    'notes', v_product.notes
  );

  update public.price_products pp
  set
    name = coalesce(v_name, pp.name),
    cloth_required = coalesce(v_cloth_required, pp.cloth_required),
    cmt_price = coalesce(p_cmt_price, pp.cmt_price),
    delivery_weeks_min = coalesce(p_delivery_weeks_min, pp.delivery_weeks_min),
    delivery_weeks_max = coalesce(p_delivery_weeks_max, pp.delivery_weeks_max),
    notes = coalesce(v_notes, pp.notes)
  where pp.id = p_product_id
  returning *
  into v_updated;

  v_after_data := jsonb_build_object(
    'id', v_updated.id,
    'price_list_id', v_updated.price_list_id,
    'section_id', v_updated.section_id,
    'matrix_key', v_updated.matrix_key,
    'name', v_updated.name,
    'cloth_required', v_updated.cloth_required,
    'cmt_price', v_updated.cmt_price,
    'delivery_weeks_min', v_updated.delivery_weeks_min,
    'delivery_weeks_max', v_updated.delivery_weeks_max,
    'notes', v_updated.notes
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
    v_updated.price_list_id,
    'product',
    v_updated.id,
    'product_updated',
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
    v_updated.cloth_required,
    v_updated.cmt_price,
    v_updated.delivery_weeks_min,
    v_updated.delivery_weeks_max,
    v_updated.notes,
    v_updated.updated_at;
end;
$function$;

grant execute on function public.update_price_product_admin(
  uuid,
  text,
  text,
  numeric,
  integer,
  integer,
  text,
  text
) to authenticated;

commit;
