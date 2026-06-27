begin;

create or replace function public.get_price_audit_log_admin(
  p_price_list_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  price_list_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  changed_by_user_id uuid,
  changed_by_name text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform public.ensure_price_lists_admin_access();

  if p_price_list_id is null then
    raise exception 'Price list id is required.';
  end if;

  if coalesce(p_offset, 0) < 0 then
    raise exception 'Offset must be greater than or equal to 0.';
  end if;

  if not exists (
    select 1
    from public.price_lists pl
    where pl.id = p_price_list_id
  ) then
    raise exception 'HUB price list % does not exist.', p_price_list_id;
  end if;

  return query
  select
    l.id,
    l.price_list_id,
    l.entity_type,
    l.entity_id,
    l.action,
    l.changed_by_user_id,
    coalesce(sp.display_name, sp.username) as changed_by_name,
    l.before_data,
    l.after_data,
    l.reason,
    l.created_at
  from public.price_audit_log l
  left join public.staff_profiles sp
    on sp.user_id = l.changed_by_user_id
  where l.price_list_id = p_price_list_id
  order by l.created_at desc, l.id desc
  limit v_limit
  offset coalesce(p_offset, 0);
end;
$function$;

grant execute on function public.get_price_audit_log_admin(uuid, integer, integer)
  to authenticated;

comment on function public.get_price_audit_log_admin(uuid, integer, integer) is
  'Returns read-only HUB price list audit history for admins and managers.';

commit;
