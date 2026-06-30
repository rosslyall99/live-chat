begin;

create or replace function public.get_price_column_mapping_status_admin(p_price_list_id uuid)
returns table(
  price_list_id uuid,
  price_list_version text,
  column_id uuid,
  matrix_key text,
  supplier text,
  range text,
  width text,
  weight text,
  is_active boolean,
  external_weaver_id integer,
  external_range_id integer,
  external_mapping_count integer,
  external_mapping_complete boolean,
  external_ranges jsonb,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_price_list public.price_lists%rowtype;
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
    c.is_active,
    c.external_weaver_id,
    c.external_range_id,
    coalesce(mr.external_mapping_count, 0) as external_mapping_count,
    (
      c.external_range_id is not null
      or coalesce(mr.external_mapping_count, 0) > 0
    ) as external_mapping_complete,
    coalesce(mr.external_ranges, '[]'::jsonb) as external_ranges,
    c.updated_at
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

revoke execute on function public.get_price_column_mapping_status_admin(uuid)
  from public, anon;
grant execute on function public.get_price_column_mapping_status_admin(uuid) to authenticated;

comment on function public.get_price_column_mapping_status_admin(uuid) is
  'Read-only HUB helper for admins and managers to inspect external tartan mapping readiness on any selected HUB price list column set, including multi-range bridge rows. Queries HUB pricing tables only.';

commit;
