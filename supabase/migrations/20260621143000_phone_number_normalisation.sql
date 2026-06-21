begin;

create or replace function public.normalize_appointment_phone(
  p_phone text
)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if nullif(v_digits, '') is null then
    return null;
  end if;

  if left(v_digits, 4) = '0044' and length(v_digits) > 4 then
    return '0' || substring(v_digits from 5);
  end if;

  if left(v_digits, 2) = '44' and length(v_digits) > 2 then
    return '0' || substring(v_digits from 3);
  end if;

  return v_digits;
end;
$function$;

create or replace function public.normalize_appointment_phone_trigger()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_table_name = 'appointment_customers' then
    new.phone := public.normalize_appointment_phone(new.phone);
  elsif tg_table_name = 'appointments' then
    new.customer_phone := public.normalize_appointment_phone(new.customer_phone);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_appointment_customers_normalize_phone
  on public.appointment_customers;

create trigger trg_appointment_customers_normalize_phone
  before insert or update of phone on public.appointment_customers
  for each row execute function public.normalize_appointment_phone_trigger();

drop trigger if exists trg_appointments_normalize_customer_phone
  on public.appointments;

create trigger trg_appointments_normalize_customer_phone
  before insert or update of customer_phone on public.appointments
  for each row execute function public.normalize_appointment_phone_trigger();

update public.appointment_customers
set phone = public.normalize_appointment_phone(phone)
where phone is distinct from public.normalize_appointment_phone(phone);

update public.appointments
set customer_phone = public.normalize_appointment_phone(customer_phone)
where customer_phone is distinct from public.normalize_appointment_phone(customer_phone);

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
  v_customer_phone text := public.normalize_appointment_phone(p_customer_phone);
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
  v_digits text := public.normalize_appointment_phone(p_query);
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
      or (
        length(coalesce(v_digits, '')) >= 2
        and coalesce(c.phone, '') like '%' || v_digits || '%'
      )
    )
  order by
    case
      when lower(c.full_name) = v_query then 0
      when lower(c.full_name) like v_query || '%' then 1
      when lower(coalesce(c.email, '')) = v_query then 2
      when lower(coalesce(c.email, '')) like v_query || '%' then 3
      when coalesce(c.phone, '') like coalesce(v_digits, '') || '%' then 4
      else 5
    end,
    c.updated_at desc,
    c.full_name asc
  limit 8;
end;
$function$;

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
  v_digits text := public.normalize_appointment_phone(p_query);
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
      or (
        length(coalesce(v_digits, '')) >= 2
        and coalesce(c.phone, '') like '%' || v_digits || '%'
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
      when coalesce(c.phone, '') like coalesce(v_digits, '') || '%' then 4
      else 5
    end,
    max(a.start_at) desc nulls last,
    c.updated_at desc,
    c.full_name asc
  limit v_limit;
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
  v_phone text := public.normalize_appointment_phone(p_phone);
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
  v_phone text := public.normalize_appointment_phone(p_phone);
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

grant execute on function public.normalize_appointment_phone(text) to authenticated;
grant execute on function public.search_appointment_customers_staff(text) to authenticated;
revoke execute on function public.resolve_appointment_customer_staff(
  uuid,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;
grant execute on function public.list_appointment_customers_cms_staff(text, integer, boolean) to authenticated;
grant execute on function public.create_appointment_customer_staff(text, text, text) to authenticated;
grant execute on function public.update_appointment_customer_staff(uuid, text, text, text) to authenticated;

commit;
