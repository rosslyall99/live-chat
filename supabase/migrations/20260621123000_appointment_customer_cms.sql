begin;

create or replace function public.ensure_appointment_customer_cms_access()
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if public.current_staff_role() not in ('admin','manager') then
    raise exception 'Only admins and managers can manage appointment customers.';
  end if;
end;
$function$;

create or replace function public.list_appointment_customers_cms_staff(
  p_query text default '',
  p_limit integer default 50
)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text,
  appointment_count bigint,
  last_appointment_at timestamp with time zone,
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
    count(a.id)::bigint as appointment_count,
    max(a.start_at) as last_appointment_at,
    c.updated_at
  from public.appointment_customers c
  left join public.appointments a
    on a.customer_id = c.id
  where
    v_query = ''
    or lower(c.full_name) like '%' || v_query || '%'
    or lower(coalesce(c.email, '')) like '%' || v_query || '%'
    or coalesce(c.phone, '') ilike '%' || p_query || '%'
    or (
      length(v_digits) >= 2
      and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'
    )
  group by c.id, c.full_name, c.email, c.phone, c.updated_at
  order by
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

create or replace function public.get_appointment_customer_detail_staff(
  p_customer_id uuid
)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text,
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
    c.created_at,
    c.updated_at,
    count(a.id)::bigint as appointment_count,
    max(a.start_at) as last_appointment_at
  from public.appointment_customers c
  left join public.appointments a
    on a.customer_id = c.id
  where c.id = p_customer_id
  group by c.id, c.full_name, c.email, c.phone, c.created_at, c.updated_at;
end;
$function$;

create or replace function public.create_appointment_customer_staff(
  p_full_name text,
  p_email text default null,
  p_phone text default null
)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_inserted public.appointment_customers%rowtype;
begin
  perform public.ensure_appointment_customer_cms_access();

  if v_uid is null then
    raise exception 'You must be signed in to create a customer.';
  end if;

  if nullif(v_full_name, '') is null then
    raise exception 'Full name is required.';
  end if;

  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  insert into public.appointment_customers (
    full_name,
    email,
    phone,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    v_full_name,
    v_email,
    v_phone,
    v_uid,
    v_uid
  )
  returning *
  into v_inserted;

  return query
  select
    v_inserted.id,
    v_inserted.full_name,
    v_inserted.email,
    v_inserted.phone,
    v_inserted.created_at,
    v_inserted.updated_at;
end;
$function$;

create or replace function public.update_appointment_customer_staff(
  p_customer_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null
)
returns table(
  id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_updated public.appointment_customers%rowtype;
begin
  perform public.ensure_appointment_customer_cms_access();

  if v_uid is null then
    raise exception 'You must be signed in to update a customer.';
  end if;

  if p_customer_id is null then
    raise exception 'Customer is required.';
  end if;

  if nullif(v_full_name, '') is null then
    raise exception 'Full name is required.';
  end if;

  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  update public.appointment_customers as c
  set
    full_name = v_full_name,
    email = v_email,
    phone = v_phone,
    updated_by_user_id = v_uid
  where c.id = p_customer_id
  returning *
  into v_updated;

  if not found then
    raise exception 'That customer could not be found.';
  end if;

  return query
  select
    v_updated.id,
    v_updated.full_name,
    v_updated.email,
    v_updated.phone,
    v_updated.created_at,
    v_updated.updated_at;
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

grant execute on function public.list_appointment_customers_cms_staff(text, integer) to authenticated;
grant execute on function public.get_appointment_customer_detail_staff(uuid) to authenticated;
grant execute on function public.create_appointment_customer_staff(text, text, text) to authenticated;
grant execute on function public.update_appointment_customer_staff(uuid, text, text, text) to authenticated;
grant execute on function public.get_appointment_customer_history_staff(uuid, integer) to authenticated;
revoke execute on function public.ensure_appointment_customer_cms_access()
  from public, anon, authenticated;

commit;
