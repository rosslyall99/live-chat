begin;

create table if not exists public.appointment_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null
);

alter table public.appointment_customers enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_appointment_customers_updated_at'
      and tgrelid = 'public.appointment_customers'::regclass
  ) then
    create trigger trg_appointment_customers_updated_at
      before update on public.appointment_customers
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.appointments
  add column if not exists customer_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_customer_id_fkey'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_customer_id_fkey
      foreign key (customer_id)
      references public.appointment_customers(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_appointment_customers_lower_full_name
  on public.appointment_customers (lower(full_name));

create index if not exists idx_appointment_customers_lower_email
  on public.appointment_customers (lower(email));

create index if not exists idx_appointment_customers_phone
  on public.appointment_customers (phone);

create index if not exists idx_appointments_customer_id
  on public.appointments (customer_id);

insert into public.appointment_customers (
  full_name,
  email,
  phone,
  created_at,
  updated_at,
  created_by_user_id,
  updated_by_user_id
)
select distinct on (lower(a.customer_email))
  trim(a.customer_name),
  trim(a.customer_email),
  nullif(trim(coalesce(a.customer_phone, '')), ''),
  coalesce(a.created_at, now()),
  coalesce(a.updated_at, now()),
  a.booked_by_user_id,
  a.booked_by_user_id
from public.appointments a
where nullif(trim(coalesce(a.customer_name, '')), '') is not null
  and nullif(trim(coalesce(a.customer_email, '')), '') is not null
  and not exists (
    select 1
    from public.appointment_customers c
    where lower(c.email) = lower(trim(a.customer_email))
  )
order by lower(a.customer_email), a.updated_at desc;

update public.appointments a
set customer_id = c.id
from public.appointment_customers c
where a.customer_id is null
  and lower(c.email) = lower(trim(a.customer_email));

create or replace function public.search_appointment_customers_staff(
  p_query text
)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  if public.current_staff_role() not in ('admin','manager','agent') then
    raise exception 'Not authorised';
  end if;

  if length(v_query) < 2 then
    return;
  end if;

  return query
  select
    c.id,
    c.full_name,
    c.email,
    c.phone
  from public.appointment_customers c
  where
    lower(c.full_name) like '%' || v_query || '%'
    or lower(coalesce(c.email, '')) like '%' || v_query || '%'
    or coalesce(c.phone, '') ilike '%' || p_query || '%'
    or (
      length(v_digits) >= 2
      and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'
    )
  order by
    case
      when lower(c.full_name) = v_query then 0
      when lower(c.full_name) like v_query || '%' then 1
      when lower(coalesce(c.email, '')) = v_query then 2
      when lower(coalesce(c.email, '')) like v_query || '%' then 3
      when coalesce(c.phone, '') like p_query || '%' then 4
      else 5
    end,
    c.updated_at desc,
    c.full_name asc
  limit 8;
end;
$function$;

create or replace function public.resolve_appointment_customer_staff(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_customer_id uuid;
  v_customer_name text := trim(coalesce(p_customer_name, ''));
  v_customer_email text := trim(coalesce(p_customer_email, ''));
  v_customer_phone text := nullif(trim(coalesce(p_customer_phone, '')), '');
begin
  if p_customer_id is not null then
    select c.id
    into v_customer_id
    from public.appointment_customers c
    where c.id = p_customer_id;

    if v_customer_id is null then
      raise exception 'The selected customer could not be found.';
    end if;

    return v_customer_id;
  end if;

  select c.id
  into v_customer_id
  from public.appointment_customers c
  where lower(c.email) = lower(v_customer_email)
  order by c.updated_at desc
  limit 1;

  if v_customer_id is not null then
    return v_customer_id;
  end if;

  insert into public.appointment_customers (
    full_name,
    email,
    phone,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    v_customer_name,
    v_customer_email,
    v_customer_phone,
    p_user_id,
    p_user_id
  )
  returning appointment_customers.id
  into v_customer_id;

  return v_customer_id;
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
  text,
  timestamp with time zone
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
  p_end_at timestamp with time zone default null,
  p_customer_id uuid default null
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
  v_branch public.branch_code;
  v_site_id text;
  v_area_branch public.branch_code;
  v_duration integer;
  v_end_at timestamp with time zone;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_customer_id uuid;
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

  v_site_id := public.appointment_branch_to_site_id(v_branch);

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
    v_site_id,
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
    customer_id,
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
    v_customer_name,
    v_customer_email,
    v_customer_phone,
    v_customer_id,
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
    v_inserted.customer_email,
    v_inserted.customer_id;

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
  text,
  timestamp with time zone
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
  p_customer_id uuid default null
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

grant execute on function public.search_appointment_customers_staff(text) to authenticated;
revoke execute on function public.resolve_appointment_customer_staff(
  uuid,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;
grant execute on function public.get_calendar_day_agent(public.branch_code, date) to authenticated;
grant execute on function public.create_appointment_staff(
  text,
  uuid,
  uuid,
  timestamp with time zone,
  text,
  text,
  text,
  text,
  timestamp with time zone,
  uuid
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
  timestamp with time zone,
  uuid
) to authenticated;

commit;
