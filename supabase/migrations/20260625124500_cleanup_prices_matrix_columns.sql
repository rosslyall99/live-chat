begin;

alter table public.price_matrix_columns
  add column if not exists is_active boolean not null default true;

update public.price_matrix_columns
set is_active = true
where is_active is distinct from true;

update public.price_matrix_columns c
set
  range = 'Reiver',
  external_weaver_id = 2,
  external_range_id = 11,
  updated_at = now()
where c.matrix_key = 'loch-rv150'
  and c.price_list_id in (
    select id
    from public.price_lists
    where is_active = true
  );

update public.price_matrix_columns c
set
  range = 'Stock',
  external_weaver_id = 5,
  external_range_id = 19,
  updated_at = now()
where c.matrix_key = 'welsh-rare'
  and c.price_list_id in (
    select id
    from public.price_lists
    where is_active = true
  );

insert into public.price_column_external_ranges (
  column_id,
  external_weaver_id,
  external_range_id,
  external_range_label,
  sort_order
)
select
  c.id,
  2,
  11,
  'Reiver',
  10
from public.price_matrix_columns c
where c.matrix_key = 'loch-rv150'
  and c.price_list_id in (
    select id
    from public.price_lists
    where is_active = true
  )
on conflict (column_id, external_range_id) do update
set
  external_weaver_id = excluded.external_weaver_id,
  external_range_label = excluded.external_range_label,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.price_column_external_ranges (
  column_id,
  external_weaver_id,
  external_range_id,
  external_range_label,
  sort_order
)
select
  c.id,
  5,
  19,
  'Welsh Stock',
  10
from public.price_matrix_columns c
where c.matrix_key = 'welsh-rare'
  and c.price_list_id in (
    select id
    from public.price_lists
    where is_active = true
  )
on conflict (column_id, external_range_id) do update
set
  external_weaver_id = excluded.external_weaver_id,
  external_range_label = excluded.external_range_label,
  sort_order = excluded.sort_order,
  updated_at = now();

delete from public.price_column_external_ranges per
using public.price_matrix_columns c
where c.id = per.column_id
  and c.matrix_key = 'strathmore-stock'
  and c.price_list_id in (
    select id
    from public.price_lists
    where is_active = true
  );

delete from public.price_cells pc
using public.price_matrix_columns c
where c.id = pc.column_id
  and c.matrix_key = 'strathmore-stock'
  and c.price_list_id in (
    select id
    from public.price_lists
    where is_active = true
  );

delete from public.price_matrix_columns c
where c.matrix_key = 'strathmore-stock'
  and c.price_list_id in (
    select id
    from public.price_lists
    where is_active = true
  );

create or replace function public.get_prices_matrix_staff()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_price_list public.price_lists%rowtype;
  v_payload jsonb;
begin
  perform public.ensure_prices_staff_access();

  select *
  into v_price_list
  from public.price_lists pl
  where pl.is_active = true
  order by pl.effective_from desc nulls last, pl.created_at desc, pl.id desc
  limit 1;

  if not found then
    raise exception 'No active HUB price list is configured.';
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
    'version', v_price_list.version,
    'columns',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
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
      'version', v_price_list.version,
      'columns', '[]'::jsonb,
      'sections', '[]'::jsonb
    )
  );
end;
$function$;

create or replace function public.get_price_column_mapping_status_staff()
returns table(
  price_list_id uuid,
  price_list_version text,
  column_id uuid,
  matrix_key text,
  supplier text,
  range text,
  width text,
  weight text,
  external_weaver_id integer,
  external_range_id integer,
  external_mapping_count integer,
  external_mapping_complete boolean,
  external_ranges jsonb
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_price_list public.price_lists%rowtype;
begin
  perform public.ensure_prices_mapping_staff_access();

  select *
  into v_price_list
  from public.price_lists pl
  where pl.is_active = true
  order by pl.effective_from desc nulls last, pl.created_at desc, pl.id desc
  limit 1;

  if not found then
    raise exception 'No active HUB price list is configured.';
  end if;

  return query
  with mapping_rollup as (
    select
      per.column_id,
      count(*)::integer as external_mapping_count,
      jsonb_agg(
        jsonb_build_object(
          'external_weaver_id', per.external_weaver_id,
          'external_range_id', per.external_range_id,
          'external_range_label', per.external_range_label,
          'sort_order', per.sort_order
        )
        order by per.sort_order asc, per.external_range_id asc
      ) as external_ranges
    from public.price_column_external_ranges per
    group by per.column_id
  )
  select
    v_price_list.id as price_list_id,
    v_price_list.version as price_list_version,
    c.id as column_id,
    c.matrix_key,
    c.supplier,
    c.range,
    c.width,
    c.weight,
    c.external_weaver_id,
    c.external_range_id,
    coalesce(mr.external_mapping_count, 0) as external_mapping_count,
    (
      c.external_range_id is not null
      or coalesce(mr.external_mapping_count, 0) > 0
    ) as external_mapping_complete,
    coalesce(mr.external_ranges, '[]'::jsonb) as external_ranges
  from public.price_matrix_columns c
  left join mapping_rollup mr
    on mr.column_id = c.id
  where c.price_list_id = v_price_list.id
    and c.is_active = true
  order by
    c.supplier_sort_order asc,
    c.sort_order asc,
    c.supplier asc,
    c.range asc,
    c.id asc;
end;
$function$;

comment on function public.get_price_column_mapping_status_staff() is
  'Read-only HUB helper for admins/managers to inspect external tartan mapping readiness on active price matrix columns, including multi-range bridge rows. Queries HUB pricing tables only.';

commit;
