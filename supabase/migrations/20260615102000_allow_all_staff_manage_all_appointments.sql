begin;

create or replace function public.staff_manages_appointment(p_appointment_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    return false;
  end if;

  select sp.role
  into v_role
  from public.staff_profiles sp
  where sp.user_id = v_uid
    and sp.is_active = true;

  if v_role in ('admin', 'manager', 'agent') then
    return exists (
      select 1
      from public.appointments a
      where a.id = p_appointment_id
    );
  end if;

  return false;
end;
$function$;

grant execute on function public.staff_manages_appointment(uuid) to authenticated;

commit;
