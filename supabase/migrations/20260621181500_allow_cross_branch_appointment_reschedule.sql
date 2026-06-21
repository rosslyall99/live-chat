begin;

drop function if exists public.update_appointment_staff(
  uuid,
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  timestamp with time zone,
  uuid
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
  p_end_at timestamp with time zone default null,
  p_customer_id uuid default null,
  p_site_id text default null
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
  customer_email text,
  customer_id uuid
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
  v_target_branch public.branch_code;
  v_duration integer;
  v_end_at timestamp with time zone;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_customer_id uuid;
  v_internal_notes text;
  v_has_changes boolean;
  v_site_id text;
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

  if nullif(trim(coalesce(p_site_id, '')), '') is null then
    v_target_branch := v_existing.branch;
    v_site_id := public.appointment_branch_to_site_id(v_target_branch);
  else
    v_site_id := nullif(public.appointment_canonical_site_id(p_site_id), '');
    v_target_branch := public.site_to_appointment_branch(v_site_id);
  end if;

  if v_target_branch is null or v_site_id is null then
    raise exception 'The selected appointment site is not available.';
  end if;

  if not public.staff_can_access_appointment_branch(v_target_branch) then
    raise exception 'You are not allowed to edit appointments for this site.';
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
  v_customer_id := public.resolve_appointment_customer_staff(
    p_customer_id,
    v_customer_name,
    v_customer_email,
    v_customer_phone,
    v_uid
  );
  v_internal_notes := nullif(trim(coalesce(p_internal_notes, '')), '');

  select aa.branch
  into v_area_branch
  from public.appointment_areas aa
  where aa.id = p_area_id
    and aa.is_active = true;

  if v_area_branch is null then
    raise exception 'The selected appointment area is not available.';
  end if;

  if v_area_branch <> v_target_branch then
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

  perform public.assert_appointment_within_bookable_hours(
    v_site_id,
    p_start_at,
    v_end_at
  );

  if exists (
    select 1
    from public.appointments a
    where a.id <> p_appointment_id
      and a.branch = v_target_branch
      and a.area_id = p_area_id
      and a.status <> 'cancelled'
      and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(p_start_at, v_end_at, '[)')
  ) then
    raise exception 'That appointment overlaps an existing booking in this area.';
  end if;

  if exists (
    select 1
    from public.appointment_blocks b
    where b.branch = v_target_branch
      and (b.area_id = p_area_id or b.area_id is null)
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_at, v_end_at, '[)')
  ) then
    raise exception 'That appointment overlaps a blocked-out period.';
  end if;

  v_has_changes :=
    v_existing.branch is distinct from v_target_branch or
    v_existing.area_id is distinct from p_area_id or
    v_existing.appointment_type_id is distinct from p_appointment_type_id or
    v_existing.start_at is distinct from p_start_at or
    v_existing.end_at is distinct from v_end_at or
    v_existing.customer_name is distinct from v_customer_name or
    v_existing.customer_email is distinct from v_customer_email or
    v_existing.customer_phone is distinct from v_customer_phone or
    v_existing.customer_id is distinct from v_customer_id or
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
      v_existing.customer_email,
      v_existing.customer_id;
    return;
  end if;

  begin
    update public.appointments as a
    set
      branch = v_target_branch,
      area_id = p_area_id,
      appointment_type_id = p_appointment_type_id,
      start_at = p_start_at,
      end_at = v_end_at,
      customer_name = v_customer_name,
      customer_email = v_customer_email,
      customer_phone = v_customer_phone,
      customer_id = v_customer_id,
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
    v_updated.customer_email,
    v_updated.customer_id;
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
  text,
  timestamp with time zone,
  uuid,
  text
) to authenticated;

commit;
