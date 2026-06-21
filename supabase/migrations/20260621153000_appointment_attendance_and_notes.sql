begin;

alter table public.appointments
  add column if not exists attendance_status text,
  add column if not exists attendance_recorded_at timestamptz,
  add column if not exists attendance_recorded_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists arrived_at timestamptz,
  add column if not exists arrived_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists internal_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_attendance_status_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_attendance_status_check
      check (
        attendance_status is null
        or attendance_status in ('checked_in', 'checked_in_late', 'no_show')
      );
  end if;
end $$;

create index if not exists idx_appointments_attendance_status
  on public.appointments (attendance_status);

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
  appointment_type_code text,
  appointment_type_color text,
  appointment_type_text_color text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status public.appointment_status,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_id uuid,
  internal_notes text,
  attendance_status text,
  attendance_recorded_at timestamp with time zone,
  attendance_recorded_by_user_id uuid,
  arrived_at timestamp with time zone,
  arrived_by_user_id uuid,
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
    at.code as appointment_type_code,
    at.color as appointment_type_color,
    at.text_color as appointment_type_text_color,
    a.start_at,
    a.end_at,
    a.status,
    a.customer_name,
    a.customer_email,
    a.customer_phone,
    a.customer_id,
    a.internal_notes,
    a.attendance_status,
    a.attendance_recorded_at,
    a.attendance_recorded_by_user_id,
    a.arrived_at,
    a.arrived_by_user_id,
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

drop function if exists public.get_appointment_for_calendar_open_staff(uuid);

create or replace function public.get_appointment_for_calendar_open_staff(
  p_appointment_id uuid
)
returns table(
  id uuid,
  branch public.branch_code,
  site_id text,
  appointment_date date,
  area_id uuid,
  appointment_type_id uuid,
  appointment_type_name text,
  appointment_type_code text,
  appointment_type_color text,
  appointment_type_text_color text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status public.appointment_status,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_id uuid,
  internal_notes text,
  attendance_status text,
  attendance_recorded_at timestamp with time zone,
  attendance_recorded_by_user_id uuid,
  arrived_at timestamp with time zone,
  arrived_by_user_id uuid,
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
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if public.current_staff_role() not in ('admin','manager','agent') then
    raise exception 'Not authorised';
  end if;

  return query
  select
    a.id,
    a.branch,
    public.appointment_branch_to_site_id(a.branch) as site_id,
    (a.start_at at time zone 'Europe/London')::date as appointment_date,
    a.area_id,
    a.appointment_type_id,
    at.name as appointment_type_name,
    at.code as appointment_type_code,
    at.color as appointment_type_color,
    at.text_color as appointment_type_text_color,
    a.start_at,
    a.end_at,
    a.status,
    a.customer_name,
    a.customer_email,
    a.customer_phone,
    a.customer_id,
    a.internal_notes,
    a.attendance_status,
    a.attendance_recorded_at,
    a.attendance_recorded_by_user_id,
    a.arrived_at,
    a.arrived_by_user_id,
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
  where a.id = p_appointment_id
    and public.staff_can_access_appointment_branch(a.branch);
end;
$function$;

drop function if exists public.get_appointment_customer_history_staff(uuid, integer);

create or replace function public.get_appointment_customer_history_staff(
  p_customer_id uuid,
  p_limit integer default 10
)
returns table(
  id uuid,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status public.appointment_status,
  branch public.branch_code,
  appointment_type_id uuid,
  appointment_type_name text,
  customer_name text,
  customer_email text,
  customer_phone text,
  attendance_status text,
  attendance_recorded_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
begin
  perform public.ensure_appointment_customer_cms_access();

  return query
  select
    a.id,
    a.start_at,
    a.end_at,
    a.status,
    a.branch,
    a.appointment_type_id,
    at.name as appointment_type_name,
    a.customer_name,
    a.customer_email,
    a.customer_phone,
    a.attendance_status,
    a.attendance_recorded_at
  from public.appointments a
  left join public.appointment_types at
    on at.id = a.appointment_type_id
  where a.customer_id = p_customer_id
  order by a.start_at desc
  limit v_limit;
end;
$function$;

create or replace function public.record_appointment_attendance_staff(
  p_appointment_id uuid,
  p_attendance_status text
)
returns table(
  id uuid,
  attendance_status text,
  attendance_recorded_at timestamp with time zone,
  attendance_recorded_by_user_id uuid,
  arrived_at timestamp with time zone,
  arrived_by_user_id uuid
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_attendance_status, '')));
  v_existing public.appointments%rowtype;
  v_updated public.appointments%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in to record attendance.';
  end if;

  if not public.is_active_staff(v_uid) then
    raise exception 'Your staff profile is inactive or missing.';
  end if;

  if v_status not in ('checked_in', 'checked_in_late', 'no_show') then
    raise exception 'Choose a valid attendance outcome.';
  end if;

  select *
  into v_existing
  from public.appointments a
  where a.id = p_appointment_id;

  if not found then
    raise exception 'That appointment could not be found.';
  end if;

  if v_existing.status = 'cancelled' then
    raise exception 'Cancelled appointments cannot have attendance recorded.';
  end if;

  if v_existing.attendance_status is not null then
    raise exception 'Attendance has already been recorded for this appointment.';
  end if;

  if (v_existing.start_at at time zone 'Europe/London')::date
    <> (now() at time zone 'Europe/London')::date then
    raise exception 'Attendance can only be recorded on the appointment day.';
  end if;

  if not public.staff_manages_appointment(p_appointment_id) then
    raise exception 'You are not allowed to update this appointment.';
  end if;

  update public.appointments as a
  set
    attendance_status = v_status,
    attendance_recorded_at = now(),
    attendance_recorded_by_user_id = v_uid,
    arrived_at = case
      when v_status in ('checked_in', 'checked_in_late') then now()
      else a.arrived_at
    end,
    arrived_by_user_id = case
      when v_status in ('checked_in', 'checked_in_late') then v_uid
      else a.arrived_by_user_id
    end
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
    v_updated.attendance_status,
    v_updated.attendance_recorded_at,
    v_updated.attendance_recorded_by_user_id,
    v_updated.arrived_at,
    v_updated.arrived_by_user_id;
end;
$function$;

create or replace function public.update_appointment_notes_staff(
  p_appointment_id uuid,
  p_internal_notes text
)
returns table(
  id uuid,
  internal_notes text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_notes text := nullif(trim(coalesce(p_internal_notes, '')), '');
  v_existing public.appointments%rowtype;
  v_updated public.appointments%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in to update appointment notes.';
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

  if not public.staff_manages_appointment(p_appointment_id) then
    raise exception 'You are not allowed to update this appointment.';
  end if;

  if v_existing.internal_notes is not distinct from v_notes then
    return query
    select v_existing.id, v_existing.internal_notes;
    return;
  end if;

  update public.appointments as a
  set internal_notes = v_notes
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
  select v_updated.id, v_updated.internal_notes;
end;
$function$;

grant execute on function public.get_calendar_day_agent(public.branch_code, date) to authenticated;
grant execute on function public.get_appointment_for_calendar_open_staff(uuid) to authenticated;
grant execute on function public.get_appointment_customer_history_staff(uuid, integer) to authenticated;
grant execute on function public.record_appointment_attendance_staff(uuid, text) to authenticated;
grant execute on function public.update_appointment_notes_staff(uuid, text) to authenticated;

commit;
