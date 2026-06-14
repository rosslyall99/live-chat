-- Stage 2: inspect and seed appointment branches/resources/types

-- Inspect current data
select id, name, notify_email
from public.sites
order by name;

select user_id, username, display_name, site_id, role, is_active
from public.staff_profiles
order by display_name, username;

select id, branch, name, is_active, sort_order
from public.appointment_areas
order by branch, sort_order, name;

select id, name, duration_minutes, is_active, sort_order
from public.appointment_types
order by sort_order, name;

-- Seed appointment areas/resources
insert into public.appointment_areas (branch, name, is_active, sort_order)
values
  ('DUK', 'Column 1', true, 10),
  ('DUK', 'Column 2', true, 20),
  ('STE', 'Column 1', true, 10),
  ('STE', 'Column 2', true, 20),
  ('STE', 'Column 3', true, 30)
on conflict (branch, name)
do update
set
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

-- Seed appointment types
insert into public.appointment_types (name, duration_minutes, is_active, sort_order)
select seed.name, seed.duration_minutes, true, seed.sort_order
from (
  values
    ('Hire Measurement', 30, 10),
    ('Style & Fit', 45, 20),
    ('Full Try On', 60, 30),
    ('Remeasure', 15, 40),
    ('HAT Appointment', 60, 50)
) as seed(name, duration_minutes, sort_order)
where not exists (
  select 1
  from public.appointment_types existing
  where lower(existing.name) = lower(seed.name)
);
