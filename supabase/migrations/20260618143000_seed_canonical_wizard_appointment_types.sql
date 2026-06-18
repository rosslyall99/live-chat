begin;

with seed(name, duration_minutes, sort_order) as (
  values
    ('Hire Measurement', 30, 10),
    ('Style & Fit', 30, 20),
    ('Full Try On', 30, 30),
    ('Hire Remeasure', 30, 40),
    ('Hire Any Tartan', 30, 50),
    ('Party Collection Try On', 15, 60),
    ('Childs Hire Measurement', 30, 70),
    ('Communion Hire Measurement', 30, 80),
    ('Childs Hire Remeasure', 30, 90),
    ('Retail Purchase - Full Kilt Package', 60, 110),
    ('Retail Purchase - Kilt Only', 30, 120),
    ('Retail Purchase - Trousers', 30, 130),
    ('Retail Purchase - Jacket & Waistcoat', 30, 140),
    ('Retail Purchase - Accessories', 20, 150),
    ('Retail Collection - Full Kilt Outfit', 60, 210),
    ('Retail Collection - Kilt Only', 30, 220),
    ('Retail Collection - Trousers', 30, 230),
    ('Retail Collection - Jacket & Waistcoat', 15, 240),
    ('Retail Collection - Accessories', 15, 250),
    ('Alteration - Kilt', 20, 310),
    ('Alteration - Trews', 20, 320)
),
updated as (
  update public.appointment_types at
  set
    duration_minutes = seed.duration_minutes,
    sort_order = seed.sort_order,
    is_active = true,
    updated_at = now()
  from seed
  where lower(at.name) = lower(seed.name)
  returning at.id
)
insert into public.appointment_types (
  name,
  duration_minutes,
  is_active,
  sort_order
)
select
  seed.name,
  seed.duration_minutes,
  true,
  seed.sort_order
from seed
where not exists (
  select 1
  from public.appointment_types existing
  where lower(existing.name) = lower(seed.name)
);

commit;
