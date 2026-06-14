begin;

create or replace function public.site_to_appointment_branch(p_site text)
returns public.branch_code
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when lower(trim(coalesce(p_site, ''))) in ('duke', 'duk', 'duke street') then 'DUK'::public.branch_code
    when lower(trim(coalesce(p_site, ''))) in ('sten', 'stenoch', 'ste', 'st enoch', 'st enochs') then 'STE'::public.branch_code
    else null
  end
$function$;

create or replace function public.staff_can_access_appointment_branch(p_branch public.branch_code)
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
  v_site_id text;
begin
  if v_uid is null then
    return false;
  end if;

  select sp.role, sp.site_id
  into v_role, v_site_id
  from public.staff_profiles sp
  where sp.user_id = v_uid
    and sp.is_active = true;

  if v_role is null then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  return public.site_to_appointment_branch(v_site_id) = p_branch;
end;
$function$;

create table if not exists public.appointment_audit_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'cancelled')),
  changed_by_user_id uuid not null references auth.users(id) on delete restrict,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_appointment_audit_log_appt_created_at
  on public.appointment_audit_log (appointment_id, created_at desc);

alter table public.appointment_audit_log enable row level security;

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
  v_site_id text;
  v_branch public.branch_code;
  v_booked_by uuid;
begin
  if v_uid is null then
    return false;
  end if;

  select sp.role, sp.site_id
  into v_role, v_site_id
  from public.staff_profiles sp
  where sp.user_id = v_uid
    and sp.is_active = true;

  if v_role is null then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  select a.branch, a.booked_by_user_id
  into v_branch, v_booked_by
  from public.appointments a
  where a.id = p_appointment_id;

  if v_branch is null then
    return false;
  end if;

  if v_role = 'manager' then
    return public.site_to_appointment_branch(v_site_id) = v_branch;
  end if;

  if v_role = 'agent' then
    return v_booked_by = v_uid;
  end if;

  return false;
end;
$function$;

create or replace function public.get_blocks_day_agent(
  p_branch public.branch_code,
  p_day date
)
returns table(
  id uuid,
  branch public.branch_code,
  area_id uuid,
  staff_user_id uuid,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  reason text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.staff_can_access_appointment_branch(p_branch) then
    raise exception 'Not authorised';
  end if;

  return query
  select
    b.id,
    b.branch,
    b.area_id,
    b.staff_user_id,
    b.start_at,
    b.end_at,
    b.reason
  from public.appointment_blocks b
  where b.branch = p_branch
    and b.start_at >= (p_day::timestamptz)
    and b.start_at < ((p_day + 1)::timestamptz)
  order by b.start_at asc;
end;
$function$;

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
  internal_notes text,
  assigned_staff_user_id uuid,
  booked_by_user_id uuid,
  booked_by_name text,
  claimed_by_user_id uuid,
  claimed_at timestamp with time zone,
  completed_by_user_id uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.staff_can_access_appointment_branch(p_branch) then
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
    a.internal_notes,
    a.assigned_staff_user_id,
    a.booked_by_user_id,
    coalesce(sp.display_name, sp.username) as booked_by_name,
    a.claimed_by_user_id,
    a.claimed_at,
    a.completed_by_user_id,
    a.completed_at,
    a.created_at,
    a.updated_at
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

create or replace function public.get_appointment_audit_staff(
  p_appointment_id uuid
)
returns table(
  id uuid,
  action text,
  changed_by_user_id uuid,
  changed_by_name text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_branch public.branch_code;
begin
  select a.branch
  into v_branch
  from public.appointments a
  where a.id = p_appointment_id;

  if v_branch is null then
    raise exception 'That appointment could not be found.';
  end if;

  if not public.staff_can_access_appointment_branch(v_branch) then
    raise exception 'Not authorised';
  end if;

  return query
  select
    l.id,
    l.action,
    l.changed_by_user_id,
    coalesce(sp.display_name, sp.username) as changed_by_name,
    l.before_data,
    l.after_data,
    l.created_at
  from public.appointment_audit_log l
  left join public.staff_profiles sp
    on sp.user_id = l.changed_by_user_id
  where l.appointment_id = p_appointment_id
  order by l.created_at desc;
end;
$function$;

grant execute on function public.site_to_appointment_branch(text) to authenticated;
grant execute on function public.staff_can_access_appointment_branch(public.branch_code) to authenticated;
grant execute on function public.staff_manages_appointment(uuid) to authenticated;
grant execute on function public.get_blocks_day_agent(public.branch_code, date) to authenticated;
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
grant execute on function public.get_appointment_audit_staff(uuid) to authenticated;

commit;
