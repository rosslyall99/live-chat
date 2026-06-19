begin;

alter table public.appointment_categories
  add column if not exists code text;

alter table public.appointment_types
  add column if not exists code text;

with category_code_map(match_name, code, priority) as (
  values
    ('hire', 'hire', 10),
    ('purchase', 'purchase', 10),
    ('retail collection', 'retail_collection', 10),
    ('collection', 'retail_collection', 20),
    ('other', 'other', 10)
),
ranked_category_matches as (
  select
    c.id,
    m.code,
    row_number() over (
      partition by m.code
      order by m.priority, c.sort_order nulls last, c.created_at, c.id
    ) as code_rank
  from public.appointment_categories c
  join category_code_map m
    on lower(c.name) = m.match_name
  where c.code is null or btrim(c.code) = ''
)
update public.appointment_categories c
set code = r.code
from ranked_category_matches r
where c.id = r.id
  and r.code_rank = 1;

with type_code_map(match_name, code, priority) as (
  values
    ('hire measurement', 'hire_measurement', 10),
    ('hire remeasure', 'hire_remeasure', 10),
    ('remeasure', 'hire_remeasure', 20),
    ('collection', 'hire_collection', 10),
    ('hire collection', 'hire_collection', 20),
    ('party collection try on', 'hire_collection', 30),
    ('style & fit', 'hire_style_fit', 10),
    ('full try on', 'hire_full_try_on', 10),
    ('retail purchase - full kilt package', 'retail_purchase_full_kilt_package', 10),
    ('retail purchase - kilt only', 'retail_purchase_kilt_only', 10),
    ('retail purchase - trousers', 'retail_purchase_trousers', 10),
    ('retail purchase - jacket & waistcoat', 'retail_purchase_jacket_waistcoat', 10),
    ('retail purchase - accessories', 'retail_purchase_accessories', 10),
    ('retail collection - full kilt outfit', 'retail_collection_full_kilt_outfit', 10),
    ('retail collection - kilt only', 'retail_collection_kilt_only', 10),
    ('retail collection - trousers', 'retail_collection_trousers', 10),
    ('retail collection - jacket & waistcoat', 'retail_collection_jacket_waistcoat', 10),
    ('retail collection - accessories', 'retail_collection_accessories', 10),
    ('alteration - kilt', 'alteration_kilt', 10),
    ('alteration - trews', 'alteration_trews', 10),
    ('custom appointment', 'custom_appointment', 10)
),
ranked_type_matches as (
  select
    t.id,
    m.code,
    row_number() over (
      partition by m.code
      order by m.priority, t.sort_order nulls last, t.created_at, t.id
    ) as code_rank
  from public.appointment_types t
  join type_code_map m
    on lower(t.name) = m.match_name
  where t.code is null or btrim(t.code) = ''
)
update public.appointment_types t
set code = r.code
from ranked_type_matches r
where t.id = r.id
  and r.code_rank = 1;

create unique index if not exists appointment_categories_code_key
  on public.appointment_categories (lower(code))
  where code is not null and btrim(code) <> '';

create unique index if not exists appointment_types_code_key
  on public.appointment_types (lower(code))
  where code is not null and btrim(code) <> '';

insert into public.appointment_types (
  category_id,
  code,
  name,
  duration_minutes,
  is_active,
  sort_order,
  color,
  description
)
select
  c.id,
  'custom_appointment',
  'Custom Appointment',
  30,
  true,
  390,
  '#475569',
  'General fallback for custom staff-led bookings.'
from public.appointment_categories c
where lower(coalesce(c.code, '')) = 'other'
  and not exists (
    select 1
    from public.appointment_types t
    where lower(coalesce(t.code, '')) = 'custom_appointment'
  );

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
    at.code as appointment_type_code,
    at.color as appointment_type_color,
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

grant execute on function public.get_calendar_day_agent(public.branch_code, date) to authenticated;

commit;
