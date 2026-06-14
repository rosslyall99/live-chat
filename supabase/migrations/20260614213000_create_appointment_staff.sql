begin;

drop function if exists public.get_calendar_day_agent(public.branch_code, date);

create or replace function public.get_calendar_day_agent(
  p_branch public.branch_code,
  p_day date
)
returns table(
  id uuid,
  branch public.branch_code,
  area_id uuid,
  appointment_type_id uuid,
  appointment_type_name text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status public.appointment_status,
  customer_name text,
  customer_email text,
  customer_phone text,
  assigned_staff_user_id uuid,
  booked_by_user_id uuid,
  booked_by_name text,
  claimed_by_user_id uuid,
  claimed_at timestamp with time zone,
  completed_by_user_id uuid,
  completed_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.current_staff_role() not in ('admin','manager','agent') then
    raise exception 'Not authorised';
  end if;

  return query
  select
    a.id,
    a.branch,
    a.area_id,
    a.appointment_type_id,
    at.name as appointment_type_name,
    a.start_at,
    a.end_at,
    a.status,
    a.customer_name,
    a.customer_email,
    a.customer_phone,
    a.assigned_staff_user_id,
    a.booked_by_user_id,
    coalesce(sp.display_name, sp.username) as booked_by_name,
    a.claimed_by_user_id,
    a.claimed_at,
    a.completed_by_user_id,
    a.completed_at
  from public.appointments a
  left join public.appointment_types at
    on at.id = a.appointment_type_id
  left join public.staff_profiles sp
    on sp.user_id = a.booked_by_user_id
  where a.branch = p_branch
    and a.start_at >= (p_day::timestamptz)
    and a.start_at < ((p_day + 1)::timestamptz)
    and a.status <> 'cancelled'
  order by a.start_at asc;
end;
$function$;

create or replace function public.create_appointment_staff(
  p_site_id text,
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
  v_site text := lower(trim(coalesce(p_site_id, '')));
  v_branch public.branch_code;
  v_area_branch public.branch_code;
  v_duration integer;
  v_end_at timestamp with time zone;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create an appointment.';
  end if;

  if not public.is_active_staff(v_uid) then
    raise exception 'Your staff profile is inactive or missing.';
  end if;

  if public.current_staff_role() not in ('admin','manager','agent') then
    raise exception 'You are not allowed to create appointments.';
  end if;

  if not public.staff_can_access_site(p_site_id) then
    raise exception 'You are not allowed to book appointments for this site.';
  end if;

  v_branch := case
    when v_site in ('duke', 'duk', 'duke street') then 'DUK'::public.branch_code
    when v_site in ('sten', 'stenoch', 'ste', 'st enoch', 'st enochs') then 'STE'::public.branch_code
    else null
  end;

  if v_branch is null then
    raise exception 'Appointments are only available for Duke Street and St Enoch.';
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

  if v_area_branch <> v_branch then
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
    where a.area_id = p_area_id
      and a.status <> 'cancelled'
      and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(p_start_at, v_end_at, '[)')
  ) then
    raise exception 'That appointment overlaps an existing booking in this area.';
  end if;

  if exists (
    select 1
    from public.appointment_blocks b
    where b.branch = v_branch
      and (b.area_id = p_area_id or b.area_id is null)
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_at, v_end_at, '[)')
  ) then
    raise exception 'That appointment overlaps a blocked-out period.';
  end if;

  return query
  insert into public.appointments (
    branch,
    area_id,
    appointment_type_id,
    start_at,
    end_at,
    status,
    customer_name,
    customer_email,
    customer_phone,
    internal_notes,
    booked_by_user_id,
    sms_consent
  )
  values (
    v_branch,
    p_area_id,
    p_appointment_type_id,
    p_start_at,
    v_end_at,
    'booked'::public.appointment_status,
    trim(p_customer_name),
    trim(p_customer_email),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_internal_notes, '')), ''),
    v_uid,
    false
  )
  returning
    appointments.id,
    appointments.branch,
    appointments.area_id,
    appointments.appointment_type_id,
    appointments.booked_by_user_id,
    appointments.start_at,
    appointments.end_at,
    appointments.status,
    appointments.customer_name,
    appointments.customer_email;

exception
  when exclusion_violation then
    raise exception 'That appointment overlaps an existing booking in this area.';
end;
$function$;

grant execute on function public.get_calendar_day_agent(public.branch_code, date) to authenticated;
grant execute on function public.create_appointment_staff(
  text,
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text
) to authenticated;

commit;
