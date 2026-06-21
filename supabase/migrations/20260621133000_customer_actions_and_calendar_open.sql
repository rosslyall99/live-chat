begin;

alter table public.appointment_customers
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists merged_into_customer_id uuid references public.appointment_customers(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merged_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_appointment_customers_is_active
  on public.appointment_customers (is_active);

create index if not exists idx_appointment_customers_merged_into
  on public.appointment_customers (merged_into_customer_id);

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
  where c.is_active = true
    and c.merged_into_customer_id is null
    and (
      lower(c.full_name) like '%' || v_query || '%'
      or lower(coalesce(c.email, '')) like '%' || v_query || '%'
      or coalesce(c.phone, '') ilike '%' || p_query || '%'
      or (
        length(v_digits) >= 2
        and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'
      )
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
    where c.id = p_customer_id
      and c.is_active = true
      and c.merged_into_customer_id is null;

    if v_customer_id is null then
      raise exception 'The selected customer could not be found.';
    end if;

    return v_customer_id;
  end if;

  select c.id
  into v_customer_id
  from public.appointment_customers c
  where lower(c.email) = lower(v_customer_email)
    and c.is_active = true
    and c.merged_into_customer_id is null
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

drop function if exists public.list_appointment_customers_cms_staff(text, integer);

create or replace function public.list_appointment_customers_cms_staff(
  p_query text default '',
  p_limit integer default 50,
  p_include_archived boolean default false
)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text,
  is_active boolean,
  archived_at timestamp with time zone,
  merged_into_customer_id uuid,
  merged_at timestamp with time zone,
  appointment_count bigint,
  last_appointment_at timestamp with time zone,
  duplicate_email_count bigint,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  perform public.ensure_appointment_customer_cms_access();

  return query
  select
    c.id,
    c.full_name,
    c.email,
    c.phone,
    c.is_active,
    c.archived_at,
    c.merged_into_customer_id,
    c.merged_at,
    count(distinct a.id)::bigint as appointment_count,
    max(a.start_at) as last_appointment_at,
    case
      when nullif(trim(coalesce(c.email, '')), '') is null then 0::bigint
      else count(distinct c2.id) filter (
        where c2.id is not null
          and c2.is_active = true
          and c2.merged_into_customer_id is null
      )::bigint
    end as duplicate_email_count,
    c.updated_at
  from public.appointment_customers c
  left join public.appointments a
    on a.customer_id = c.id
  left join public.appointment_customers c2
    on c2.id <> c.id
    and lower(c2.email) = lower(c.email)
  where
    (p_include_archived or (c.is_active = true and c.merged_into_customer_id is null))
    and (
      v_query = ''
      or lower(c.full_name) like '%' || v_query || '%'
      or lower(coalesce(c.email, '')) like '%' || v_query || '%'
      or coalesce(c.phone, '') ilike '%' || p_query || '%'
      or (
        length(v_digits) >= 2
        and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'
      )
    )
  group by
    c.id,
    c.full_name,
    c.email,
    c.phone,
    c.is_active,
    c.archived_at,
    c.merged_into_customer_id,
    c.merged_at,
    c.updated_at
  order by
    c.is_active desc,
    case
      when v_query = '' then 5
      when lower(c.full_name) = v_query then 0
      when lower(c.full_name) like v_query || '%' then 1
      when lower(coalesce(c.email, '')) = v_query then 2
      when lower(coalesce(c.email, '')) like v_query || '%' then 3
      when coalesce(c.phone, '') like p_query || '%' then 4
      else 5
    end,
    max(a.start_at) desc nulls last,
    c.updated_at desc,
    c.full_name asc
  limit v_limit;
end;
$function$;

drop function if exists public.get_appointment_customer_detail_staff(uuid);

create or replace function public.get_appointment_customer_detail_staff(
  p_customer_id uuid
)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text,
  is_active boolean,
  archived_at timestamp with time zone,
  merged_into_customer_id uuid,
  merged_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  appointment_count bigint,
  last_appointment_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  perform public.ensure_appointment_customer_cms_access();

  return query
  select
    c.id,
    c.full_name,
    c.email,
    c.phone,
    c.is_active,
    c.archived_at,
    c.merged_into_customer_id,
    c.merged_at,
    c.created_at,
    c.updated_at,
    count(a.id)::bigint as appointment_count,
    max(a.start_at) as last_appointment_at
  from public.appointment_customers c
  left join public.appointments a
    on a.customer_id = c.id
  where c.id = p_customer_id
  group by
    c.id,
    c.full_name,
    c.email,
    c.phone,
    c.is_active,
    c.archived_at,
    c.merged_into_customer_id,
    c.merged_at,
    c.created_at,
    c.updated_at;
end;
$function$;

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
  customer_phone text
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
    a.customer_phone
  from public.appointments a
  left join public.appointment_types at
    on at.id = a.appointment_type_id
  where a.customer_id = p_customer_id
  order by a.start_at desc
  limit v_limit;
end;
$function$;

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

create or replace function public.cancel_customer_appointment_staff(
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
begin
  return query
  select c.id, c.status
  from public.cancel_appointment_staff(p_appointment_id) c;
end;
$function$;

create or replace function public.archive_appointment_customer_staff(
  p_customer_id uuid
)
returns table(
  id uuid,
  is_active boolean,
  archived_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_updated public.appointment_customers%rowtype;
begin
  perform public.ensure_appointment_customer_cms_access();

  if v_uid is null then
    raise exception 'You must be signed in to archive a customer.';
  end if;

  update public.appointment_customers as c
  set
    is_active = false,
    archived_at = coalesce(c.archived_at, now()),
    archived_by_user_id = coalesce(c.archived_by_user_id, v_uid),
    updated_by_user_id = v_uid
  where c.id = p_customer_id
  returning *
  into v_updated;

  if not found then
    raise exception 'That customer could not be found.';
  end if;

  return query
  select v_updated.id, v_updated.is_active, v_updated.archived_at;
end;
$function$;

create or replace function public.merge_appointment_customers_staff(
  p_primary_customer_id uuid,
  p_duplicate_customer_id uuid
)
returns table(
  primary_customer_id uuid,
  duplicate_customer_id uuid,
  moved_appointment_count integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_primary public.appointment_customers%rowtype;
  v_duplicate public.appointment_customers%rowtype;
  v_moved integer := 0;
begin
  perform public.ensure_appointment_customer_cms_access();

  if v_uid is null then
    raise exception 'You must be signed in to merge customers.';
  end if;

  if p_primary_customer_id is null or p_duplicate_customer_id is null then
    raise exception 'Choose both customers before merging.';
  end if;

  if p_primary_customer_id = p_duplicate_customer_id then
    raise exception 'Choose two different customers to merge.';
  end if;

  select *
  into v_primary
  from public.appointment_customers c
  where c.id = p_primary_customer_id
  for update;

  if not found then
    raise exception 'The primary customer could not be found.';
  end if;

  select *
  into v_duplicate
  from public.appointment_customers c
  where c.id = p_duplicate_customer_id
  for update;

  if not found then
    raise exception 'The duplicate customer could not be found.';
  end if;

  if v_primary.is_active is not true or v_primary.merged_into_customer_id is not null then
    raise exception 'The primary customer must be an active customer.';
  end if;

  update public.appointments as a
  set customer_id = p_primary_customer_id
  where a.customer_id = p_duplicate_customer_id;

  get diagnostics v_moved = row_count;

  update public.appointment_customers as c
  set
    is_active = false,
    archived_at = coalesce(c.archived_at, now()),
    archived_by_user_id = coalesce(c.archived_by_user_id, v_uid),
    merged_into_customer_id = p_primary_customer_id,
    merged_at = now(),
    merged_by_user_id = v_uid,
    updated_by_user_id = v_uid
  where c.id = p_duplicate_customer_id;

  return query
  select p_primary_customer_id, p_duplicate_customer_id, v_moved;
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
grant execute on function public.list_appointment_customers_cms_staff(text, integer, boolean) to authenticated;
grant execute on function public.get_appointment_customer_detail_staff(uuid) to authenticated;
grant execute on function public.get_appointment_customer_history_staff(uuid, integer) to authenticated;
grant execute on function public.get_appointment_for_calendar_open_staff(uuid) to authenticated;
grant execute on function public.cancel_customer_appointment_staff(uuid) to authenticated;
grant execute on function public.archive_appointment_customer_staff(uuid) to authenticated;
grant execute on function public.merge_appointment_customers_staff(uuid, uuid) to authenticated;

commit;
