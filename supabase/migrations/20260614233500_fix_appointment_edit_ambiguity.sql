begin;

create or replace function public.update_appointment_staff(
  p_appointment_id uuid,
  p_area_id uuid,
  p_appointment_type_id uuid,
  p_start_at timestamp with time zone,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text default null,
  p_internal_notes text default null
)
returns table(
  id uuid,
  branch public.branch_code,
  area_id uuid,
  appointment_type_id uuid,
  booked_by_user_id uuid,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status public.appointment_status,
  customer_name text,
  customer_email text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_area_branch public.branch_code;
  v_duration integer;
  v_end_at timestamp with time zone;
begin
  if v_uid is null then
    raise exception 'You must be signed in to update an appointment.';
  end if;

  if not public.is_active_staff(v_uid) then
    raise exception 'Your staff profile is inactive or missing.';
  end if;

  select *
  into v_existing
  from public.appointments a
  where a.id = p_appointment_id;

  if not found then
    raise exception 'That appointment could not be found.';
  end if;

  if v_existing.status = 'cancelled' then
    raise exception 'Cancelled appointments cannot be edited.';
  end if;

  if not public.staff_manages_appointment(p_appointment_id) then
    raise exception 'You are not allowed to edit this appointment.';
  end if;

  if p_area_id is null then
    raise exception 'Appointment area is required.';
  end if;

  if p_appointment_type_id is null then
    raise exception 'Appointment type is required.';
  end if;

  if p_start_at is null then
    raise exception 'Start time is required.';
  end if;

  if nullif(trim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'Customer name is required.';
  end if;

  if nullif(trim(coalesce(p_customer_email, '')), '') is null then
    raise exception 'Customer email is required.';
  end if;

  select aa.branch
  into v_area_branch
  from public.appointment_areas aa
  where aa.id = p_area_id
    and aa.is_active = true;

  if v_area_branch is null then
    raise exception 'The selected appointment area is not available.';
  end if;

  if v_area_branch <> v_existing.branch then
    raise exception 'The selected appointment area does not belong to this site.';
  end if;

  select at.duration_minutes
  into v_duration
  from public.appointment_types at
  where at.id = p_appointment_type_id
    and at.is_active = true;

  if v_duration is null then
    raise exception 'The selected appointment type is not available.';
  end if;

  v_end_at := p_start_at + make_interval(mins => v_duration);

  if exists (
    select 1
    from public.appointments a
    where a.id <> p_appointment_id
      and a.area_id = p_area_id
      and a.status <> 'cancelled'
      and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(p_start_at, v_end_at, '[)')
  ) then
    raise exception 'That appointment overlaps an existing booking in this area.';
  end if;

  if exists (
    select 1
    from public.appointment_blocks b
    where b.branch = v_existing.branch
      and (b.area_id = p_area_id or b.area_id is null)
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_at, v_end_at, '[)')
  ) then
    raise exception 'That appointment overlaps a blocked-out period.';
  end if;

  update public.appointments as a
  set
    area_id = p_area_id,
    appointment_type_id = p_appointment_type_id,
    start_at = p_start_at,
    end_at = v_end_at,
    customer_name = trim(p_customer_name),
    customer_email = trim(p_customer_email),
    customer_phone = nullif(trim(coalesce(p_customer_phone, '')), ''),
    internal_notes = nullif(trim(coalesce(p_internal_notes, '')), '')
  where a.id = p_appointment_id
  returning *
  into v_updated;

  insert into public.appointment_audit_log (
    appointment_id,
    action,
    changed_by_user_id,
    before_data,
    after_data
  )
  values (
    v_updated.id,
    'updated',
    v_uid,
    to_jsonb(v_existing),
    to_jsonb(v_updated)
  );

  return query
  select
    v_updated.id,
    v_updated.branch,
    v_updated.area_id,
    v_updated.appointment_type_id,
    v_updated.booked_by_user_id,
    v_updated.start_at,
    v_updated.end_at,
    v_updated.status,
    v_updated.customer_name,
    v_updated.customer_email;

exception
  when exclusion_violation then
    raise exception 'That appointment overlaps an existing booking in this area.';
end;
$function$;

create or replace function public.cancel_appointment_staff(
  p_appointment_id uuid
)
returns table(
  id uuid,
  status public.appointment_status
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.appointments%rowtype;
  v_updated public.appointments%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in to cancel an appointment.';
  end if;

  if not public.is_active_staff(v_uid) then
    raise exception 'Your staff profile is inactive or missing.';
  end if;

  select *
  into v_existing
  from public.appointments a
  where a.id = p_appointment_id;

  if not found then
    raise exception 'That appointment could not be found.';
  end if;

  if v_existing.status = 'cancelled' then
    return query
    select v_existing.id, v_existing.status;
    return;
  end if;

  if not public.staff_manages_appointment(p_appointment_id) then
    raise exception 'You are not allowed to cancel this appointment.';
  end if;

  update public.appointments as a
  set status = 'cancelled'::public.appointment_status
  where a.id = p_appointment_id
  returning *
  into v_updated;

  insert into public.appointment_audit_log (
    appointment_id,
    action,
    changed_by_user_id,
    before_data,
    after_data
  )
  values (
    v_updated.id,
    'cancelled',
    v_uid,
    to_jsonb(v_existing),
    to_jsonb(v_updated)
  );

  return query
  select v_updated.id, v_updated.status;
end;
$function$;

grant execute on function public.update_appointment_staff(
  uuid,
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text
) to authenticated;

grant execute on function public.cancel_appointment_staff(uuid) to authenticated;

commit;
