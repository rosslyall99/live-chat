begin;

create or replace function public.get_price_list_matrix_admin(p_price_list_id uuid)
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

  with ordered_columns as (
    select
      c.id,
      c.price_list_id,
      coalesce(c.matrix_key, c.id::text) as public_id,
      c.supplier,
      c.range,
      c.width,
      c.weight,
      c.sort_order,
      c.supplier_sort_order,
      c.external_weaver_id,
      c.external_range_id
    from public.price_matrix_columns c
    where c.price_list_id = v_price_list.id
      and c.is_active = true
    order by c.supplier_sort_order asc, c.sort_order asc, c.supplier asc, c.range asc, c.id asc
  ),
  ordered_sections as (
    select
      s.id,
      s.price_list_id,
      s.name,
      s.sort_order
    from public.price_sections s
    where s.price_list_id = v_price_list.id
    order by s.sort_order asc, s.name asc, s.id asc
  ),
  section_payloads as (
    select
      s.id,
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'sort_order', s.sort_order,
        'products',
        coalesce(
          (
            select jsonb_agg(product_payload order by product_sort_order, product_name, product_public_id)
            from (
              select
                p.sort_order as product_sort_order,
                p.name as product_name,
                coalesce(p.matrix_key, p.id::text) as product_public_id,
                jsonb_build_object(
                  'record_id', p.id,
                  'id', coalesce(p.matrix_key, p.id::text),
                  'name', p.name,
                  'sort_order', p.sort_order,
                  'cloth_required', p.cloth_required,
                  'cmt_price', p.cmt_price,
                  'delivery_weeks_min', p.delivery_weeks_min,
                  'delivery_weeks_max', p.delivery_weeks_max,
                  'notes', p.notes,
                  'prices',
                  coalesce(
                    (
                      select jsonb_object_agg(coalesce(mc.matrix_key, mc.id::text), pc.retail_price)
                      from public.price_cells pc
                      join public.price_matrix_columns mc
                        on mc.id = pc.column_id
                      where pc.product_id = p.id
                        and mc.price_list_id = v_price_list.id
                        and mc.is_active = true
                    ),
                    '{}'::jsonb
                  ),
                  'price_cells',
                  coalesce(
                    (
                      select jsonb_object_agg(
                        coalesce(mc.matrix_key, mc.id::text),
                        jsonb_build_object(
                          'record_id', pc.id,
                          'retail_price', pc.retail_price
                        )
                      )
                      from public.price_cells pc
                      join public.price_matrix_columns mc
                        on mc.id = pc.column_id
                      where pc.product_id = p.id
                        and mc.price_list_id = v_price_list.id
                        and mc.is_active = true
                    ),
                    '{}'::jsonb
                  )
                ) as product_payload
              from public.price_products p
              where p.section_id = s.id
                and p.price_list_id = v_price_list.id
            ) ordered_products
          ),
          '[]'::jsonb
        )
      ) as section_payload
    from ordered_sections s
  )
  select jsonb_build_object(
    'id', v_price_list.id,
    'version', v_price_list.version,
    'name', v_price_list.name,
    'status', v_price_list.status,
    'is_active', v_price_list.is_active,
    'effective_from', v_price_list.effective_from,
    'columns',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'record_id', c.id,
            'id', c.public_id,
            'supplier', c.supplier,
            'range', c.range,
            'width', c.width,
            'weight', c.weight,
            'sort_order', c.sort_order,
            'supplier_sort_order', c.supplier_sort_order,
            'external_weaver_id', c.external_weaver_id,
            'external_range_id', c.external_range_id
          )
          order by c.supplier_sort_order, c.sort_order, c.supplier, c.range, c.id
        )
        from ordered_columns c
      ),
      '[]'::jsonb
    ),
    'sections',
    coalesce(
      (
        select jsonb_agg(sp.section_payload order by os.sort_order, os.name, os.id)
        from ordered_sections os
        join section_payloads sp
          on sp.id = os.id
      ),
      '[]'::jsonb
    )
  )
  into v_payload;

  return coalesce(
    v_payload,
    jsonb_build_object(
      'id', v_price_list.id,
      'version', v_price_list.version,
      'name', v_price_list.name,
      'status', v_price_list.status,
      'is_active', v_price_list.is_active,
      'effective_from', v_price_list.effective_from,
      'columns', '[]'::jsonb,
      'sections', '[]'::jsonb
    )
  );
end;
$function$;

commit;
