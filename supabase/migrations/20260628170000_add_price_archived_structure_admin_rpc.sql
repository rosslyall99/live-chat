begin;

create or replace function public.get_price_archived_structure_admin(p_price_list_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_price_list public.price_lists%rowtype;
  v_payload jsonb;
begin
  perform public.ensure_price_lists_admin_access();

  if p_price_list_id is null then
    raise exception 'Price list id is required.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = p_price_list_id
  limit 1;

  if not found then
    raise exception 'HUB price list % does not exist.', p_price_list_id;
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Archived items can only be viewed for inactive draft price lists.';
  end if;

  with archived_products as (
    select
      p.id,
      p.price_list_id,
      p.section_id,
      s.name as section_name,
      s.sort_order as section_sort_order,
      p.matrix_key,
      p.name,
      p.sort_order,
      p.cloth_required,
      p.cmt_price,
      p.delivery_weeks_min,
      p.delivery_weeks_max,
      p.notes,
      p.updated_at
    from public.price_products p
    left join public.price_sections s
      on s.id = p.section_id
    where p.price_list_id = v_price_list.id
      and p.is_active = false
  ),
  archived_columns as (
    select
      c.id,
      c.price_list_id,
      c.matrix_key,
      c.supplier,
      c.range,
      c.width,
      c.weight,
      c.supplier_sort_order,
      c.sort_order,
      c.external_weaver_id,
      c.external_range_id,
      c.updated_at
    from public.price_matrix_columns c
    where c.price_list_id = v_price_list.id
      and c.is_active = false
  )
  select jsonb_build_object(
    'price_list_id', v_price_list.id,
    'status', v_price_list.status,
    'is_active', v_price_list.is_active,
    'products',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ap.id,
            'price_list_id', ap.price_list_id,
            'section_id', ap.section_id,
            'section_name', ap.section_name,
            'matrix_key', ap.matrix_key,
            'name', ap.name,
            'sort_order', ap.sort_order,
            'cloth_required', ap.cloth_required,
            'cmt_price', ap.cmt_price,
            'delivery_weeks_min', ap.delivery_weeks_min,
            'delivery_weeks_max', ap.delivery_weeks_max,
            'notes', ap.notes,
            'updated_at', ap.updated_at
          )
          order by
            ap.section_sort_order nulls last,
            ap.section_name nulls last,
            ap.sort_order,
            ap.name,
            ap.id
        )
        from archived_products ap
      ),
      '[]'::jsonb
    ),
    'columns',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ac.id,
            'price_list_id', ac.price_list_id,
            'matrix_key', ac.matrix_key,
            'supplier', ac.supplier,
            'range', ac.range,
            'width', ac.width,
            'weight', ac.weight,
            'supplier_sort_order', ac.supplier_sort_order,
            'sort_order', ac.sort_order,
            'external_weaver_id', ac.external_weaver_id,
            'external_range_id', ac.external_range_id,
            'updated_at', ac.updated_at
          )
          order by
            ac.supplier_sort_order,
            ac.sort_order,
            ac.supplier,
            ac.range,
            ac.id
        )
        from archived_columns ac
      ),
      '[]'::jsonb
    )
  )
  into v_payload;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'price_list_id', v_price_list.id,
      'status', v_price_list.status,
      'is_active', v_price_list.is_active,
      'products', '[]'::jsonb,
      'columns', '[]'::jsonb
    )
  );
end;
$function$;

grant execute on function public.get_price_archived_structure_admin(uuid)
  to authenticated;

comment on function public.get_price_archived_structure_admin(uuid) is
  'Read-only helper for admins and managers that lists archived products and columns for an inactive draft HUB price list.';

commit;
