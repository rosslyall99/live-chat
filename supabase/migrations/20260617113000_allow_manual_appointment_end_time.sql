begin;

drop function if exists public.create_appointment_staff(
  text,
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text
);

create or replace function public.create_appointment_staff(
  p_site_id text,
  p_area_id uuid,
  p_appointment_type_id uuid,
  p_start_at timestamp with time zone,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text default null,
  p_internal_notes text default null,
  p_end_at timestamp with time zone default null
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
  v_branch public.branch_code;
  v_area_branch public.branch_code;
  v_duration integer;
  v_end_at timestamp with time zone;
  v_inserted public.appointments%rowtype;
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

  v_branch := public.site_to_appointment_branch(p_site_id);

  if v_branch is null then
    raise exception 'Appointments are only available for Duke Street and St Enoch.';
  end if;

  if not public.staff_can_access_appointment_branch(v_branch) then
    raise exception 'You are not allowed to book appointments for this site.';
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

  v_end_at := coalesce(p_end_at, p_start_at + make_interval(mins => v_duration));

  if v_end_at <= p_start_at then
    raise exception 'End time must be after the start time.';
  end if;

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
  returning *
  into v_inserted;

  insert into public.appointment_audit_log (
    appointment_id,
    action,
    changed_by_user_id,
    after_data
  )
  values (
    v_inserted.id,
    'created',
    v_uid,
    to_jsonb(v_inserted)
  );

  return query
  select
    v_inserted.id,
    v_inserted.branch,
    v_inserted.area_id,
    v_inserted.appointment_type_id,
    v_inserted.booked_by_user_id,
    v_inserted.start_at,
    v_inserted.end_at,
    v_inserted.status,
    v_inserted.customer_name,
    v_inserted.customer_email;

exception
  when exclusion_violation then
    raise exception 'That appointment overlaps an existing booking in this area.';
end;
$function$;

drop function if exists public.update_appointment_staff(
  uuid,
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text
);

create or replace function public.update_appointment_staff(
  p_appointment_id uuid,
  p_area_id uuid,
  p_appointment_type_id uuid,
  p_start_at timestamp with time zone,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text default null,
  p_internal_notes text default null,
  p_end_at timestamp with time zone default null
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
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_internal_notes text;
  v_has_changes boolean;
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

  v_customer_name := trim(coalesce(p_customer_name, ''));
  if nullif(v_customer_name, '') is null then
    raise exception 'Customer name is required.';
  end if;

  v_customer_email := trim(coalesce(p_customer_email, ''));
  if nullif(v_customer_email, '') is null then
    raise exception 'Customer email is required.';
  end if;

  v_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_internal_notes := nullif(trim(coalesce(p_internal_notes, '')), '');

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

  v_end_at := coalesce(p_end_at, p_start_at + make_interval(mins => v_duration));

  if v_end_at <= p_start_at then
    raise exception 'End time must be after the start time.';
  end if;

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

  v_has_changes :=
    v_existing.area_id is distinct from p_area_id or
    v_existing.appointment_type_id is distinct from p_appointment_type_id or
    v_existing.start_at is distinct from p_start_at or
    v_existing.end_at is distinct from v_end_at or
    v_existing.customer_name is distinct from v_customer_name or
    v_existing.customer_email is distinct from v_customer_email or
    v_existing.customer_phone is distinct from v_customer_phone or
    v_existing.internal_notes is distinct from v_internal_notes;

  if not v_has_changes then
    return query
    select
      v_existing.id,
      v_existing.branch,
      v_existing.area_id,
      v_existing.appointment_type_id,
      v_existing.booked_by_user_id,
      v_existing.start_at,
      v_existing.end_at,
      v_existing.status,
      v_existing.customer_name,
      v_existing.customer_email;
    return;
  end if;

  begin
    update public.appointments as a
    set
      area_id = p_area_id,
      appointment_type_id = p_appointment_type_id,
      start_at = p_start_at,
      end_at = v_end_at,
      customer_name = v_customer_name,
      customer_email = v_customer_email,
      customer_phone = v_customer_phone,
      internal_notes = v_internal_notes
    where a.id = p_appointment_id
    returning *
    into v_updated;
  exception
    when exclusion_violation then
      raise exception 'That appointment overlaps an existing booking in this area.';
  end;

  if not found then
    raise exception 'That appointment could not be updated.';
  end if;

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
end;
$function$;

grant execute on function public.create_appointment_staff(
  text,
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  timestamp with time zone
) to authenticated;

grant execute on function public.update_appointment_staff(
  uuid,
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  timestamp with time zone
) to authenticated;

commit;
