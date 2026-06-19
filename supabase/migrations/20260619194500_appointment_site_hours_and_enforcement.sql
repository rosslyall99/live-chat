begin;

create or replace function public.default_appointment_opening_hours(
  p_site_id text
)
returns jsonb
language sql
stable
as $function$
  select case lower(trim(coalesce(p_site_id, '')))
    when 'duke' then jsonb_build_object(
      '0', jsonb_build_object('is_closed', true, 'open_time', null, 'close_time', null),
      '1', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '2', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '3', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '4', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '5', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '6', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30')
    )
    when 'sten' then jsonb_build_object(
      '0', jsonb_build_object('is_closed', false, 'open_time', '11:00', 'close_time', '16:00'),
      '1', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '2', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '3', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '4', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '5', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '6', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30')
    )
    else null
  end;
$function$;

create or replace function public.resolve_appointment_opening_hours(
  p_site_id text
)
returns jsonb
language sql
stable
as $function$
  select coalesce(
    (
      select ss.opening_hours
      from public.site_settings ss
      where ss.site_id = p_site_id
        and ss.opening_hours is not null
    ),
    public.default_appointment_opening_hours(p_site_id)
  );
$function$;

create or replace function public.appointment_branch_to_site_id(
  p_branch public.branch_code
)
returns text
language sql
stable
as $function$
  select case upper(trim(coalesce(p_branch::text, '')))
    when 'DUK' then 'duke'
    when 'STE' then 'sten'
    else null
  end;
$function$;

create or replace function public.get_appointment_bookable_window(
  p_site_id text,
  p_day date
)
returns table(
  is_closed boolean,
  open_time time,
  close_time time,
  source text
)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_hours jsonb;
  v_day_key text;
  v_day_hours jsonb;
begin
  v_hours := public.resolve_appointment_opening_hours(p_site_id);

  if v_hours is null then
    return query
    select true, null::time, null::time, 'missing';
    return;
  end if;

  v_day_key := extract(dow from p_day)::int::text;
  v_day_hours := v_hours -> v_day_key;

  if v_day_hours is null then
    return query
    select true, null::time, null::time, 'missing_day';
    return;
  end if;

  return query
  select
    coalesce((v_day_hours ->> 'is_closed')::boolean, false),
    nullif(v_day_hours ->> 'open_time', '')::time,
    nullif(v_day_hours ->> 'close_time', '')::time,
    case
      when exists (
        select 1
        from public.site_settings ss
        where ss.site_id = p_site_id
          and ss.opening_hours is not null
      ) then 'site_settings'
      else 'fallback'
    end;
end;
$function$;

create or replace function public.assert_appointment_within_bookable_hours(
  p_site_id text,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone
)
returns void
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_local_day date;
  v_end_local_day date;
  v_start_local_time time;
  v_end_local_time time;
  v_is_closed boolean;
  v_open_time time;
  v_close_time time;
  v_source text;
begin
  v_local_day := (p_start_at at time zone 'Europe/London')::date;
  v_end_local_day := (p_end_at at time zone 'Europe/London')::date;
  v_start_local_time := (p_start_at at time zone 'Europe/London')::time;
  v_end_local_time := (p_end_at at time zone 'Europe/London')::time;

  select bw.is_closed, bw.open_time, bw.close_time, bw.source
  into v_is_closed, v_open_time, v_close_time, v_source
  from public.get_appointment_bookable_window(p_site_id, v_local_day) bw;

  if coalesce(v_source, '') like 'missing%' or v_open_time is null or v_close_time is null then
    raise exception 'Bookable hours are not configured for this site and day.';
  end if;

  if v_is_closed then
    raise exception 'This branch is closed on the selected date.';
  end if;

  if v_end_local_day <> v_local_day then
    raise exception 'Appointments must finish within the same branch day.';
  end if;

  if v_start_local_time < v_open_time then
    raise exception 'Appointments cannot start before the branch opens.';
  end if;

  if v_end_local_time > v_close_time then
    raise exception 'Appointments cannot end after the branch closes.';
  end if;
end;
$function$;

insert into public.site_settings (site_id, manual_status, opening_hours, updated_at)
values
  ('duke', 'online', public.default_appointment_opening_hours('duke'), now()),
  ('sten', 'online', public.default_appointment_opening_hours('sten'), now())
on conflict (site_id) do update
set
  opening_hours = coalesce(public.site_settings.opening_hours, excluded.opening_hours),
  updated_at = now();

create or replace function public.get_appointment_site_hours_admin()
returns table(
  site_id text,
  site_name text,
  opening_hours jsonb,
  source text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can manage appointment hours.';
  end if;

  return query
  select
    s.id,
    s.name,
    public.resolve_appointment_opening_hours(s.id) as opening_hours,
    case
      when exists (
        select 1
        from public.site_settings ss
        where ss.site_id = s.id
          and ss.opening_hours is not null
      ) then 'site_settings'
      else 'fallback'
    end as source
  from public.sites s
  where public.site_to_appointment_branch(s.id) is not null
  order by s.name asc;
end;
$function$;

create or replace function public.save_appointment_site_hours_admin(
  p_site_id text,
  p_opening_hours jsonb
)
returns table(
  site_id text,
  opening_hours jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can manage appointment hours.';
  end if;

  if public.site_to_appointment_branch(p_site_id) is null then
    raise exception 'This site does not support appointments.';
  end if;

  insert into public.site_settings (site_id, manual_status, opening_hours, updated_at)
  values (p_site_id, 'online', p_opening_hours, now())
  on conflict (site_id) do update
  set
    opening_hours = excluded.opening_hours,
    updated_at = now();

  return query
  select p_site_id, p_opening_hours;
end;
$function$;

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

  perform public.assert_appointment_within_bookable_hours(
    p_site_id,
    p_start_at,
    v_end_at
  );

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

  v_site_id := public.appointment_branch_to_site_id(v_existing.branch);
  perform public.assert_appointment_within_bookable_hours(
    v_site_id,
    p_start_at,
    v_end_at
  );

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

grant execute on function public.default_appointment_opening_hours(text) to authenticated;
grant execute on function public.resolve_appointment_opening_hours(text) to authenticated;
grant execute on function public.appointment_branch_to_site_id(public.branch_code) to authenticated;
grant execute on function public.get_appointment_bookable_window(text, date) to authenticated;
grant execute on function public.assert_appointment_within_bookable_hours(text, timestamp with time zone, timestamp with time zone) to authenticated;
grant execute on function public.get_appointment_site_hours_admin() to authenticated;
grant execute on function public.save_appointment_site_hours_admin(text, jsonb) to authenticated;
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
