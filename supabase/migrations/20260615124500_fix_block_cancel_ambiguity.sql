begin;

create or replace function public.cancel_appointment_block_staff(
  p_block_id uuid
)
returns table(
  id uuid
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.appointment_blocks%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in to cancel a block.';
  end if;

  if not public.is_active_staff(v_uid) then
    raise exception 'Your staff profile is inactive or missing.';
  end if;

  select *
  into v_existing
  from public.appointment_blocks ab
  where ab.id = p_block_id;

  if not found then
    raise exception 'That block could not be found.';
  end if;

  if not public.staff_can_manage_appointment_branch(v_existing.branch) then
    raise exception 'You are not allowed to cancel this block.';
  end if;

  insert into public.appointment_block_audit_log (
    block_id,
    action,
    changed_by_user_id,
    before_data
  )
  values (
    v_existing.id,
    'cancelled',
    v_uid,
    to_jsonb(v_existing)
  );

  delete from public.appointment_blocks ab
  where ab.id = p_block_id;

  return query
  select v_existing.id;
end;
$function$;

grant execute on function public.cancel_appointment_block_staff(uuid) to authenticated;

commit;
