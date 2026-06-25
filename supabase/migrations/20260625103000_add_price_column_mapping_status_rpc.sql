begin;

create or replace function public.ensure_prices_mapping_staff_access()
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if public.staff_role() not in ('admin', 'manager') then
    raise exception 'Only admins and managers can inspect HUB price mappings.';
  end if;
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
  external_mapping_complete boolean
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
    (
      c.external_weaver_id is not null
      and c.external_range_id is not null
    ) as external_mapping_complete
  from public.price_matrix_columns c
  where c.price_list_id = v_price_list.id
  order by
    c.supplier_sort_order asc,
    c.sort_order asc,
    c.supplier asc,
    c.range asc,
    c.id asc;
end;
$function$;

revoke execute on function public.get_price_column_mapping_status_staff()
  from public, anon;
grant execute on function public.get_price_column_mapping_status_staff() to authenticated;
revoke execute on function public.ensure_prices_mapping_staff_access()
  from public, anon, authenticated;

comment on function public.get_price_column_mapping_status_staff() is
  'Read-only HUB helper for admins/managers to inspect external tartan mapping readiness on active price matrix columns. Queries HUB pricing tables only.';

commit;
