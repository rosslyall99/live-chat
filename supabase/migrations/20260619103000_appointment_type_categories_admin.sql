begin;

create table if not exists public.appointment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.appointment_categories enable row level security;

create unique index if not exists appointment_categories_name_lower_key
  on public.appointment_categories (lower(name));

create index if not exists idx_appointment_categories_active_sort
  on public.appointment_categories (is_active, sort_order, name);

grant select, insert, update, delete on table public.appointment_categories to authenticated;
grant select, insert, update, delete on table public.appointment_categories to service_role;

drop trigger if exists trg_appointment_categories_updated_at on public.appointment_categories;
create trigger trg_appointment_categories_updated_at
before update on public.appointment_categories
for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_categories'
      and policyname = 'appointment_categories_admin_manage'
  ) then
    create policy appointment_categories_admin_manage
    on public.appointment_categories
    as permissive
    for all
    to authenticated
    using (public.current_staff_role() = 'admin')
    with check (public.current_staff_role() = 'admin');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_categories'
      and policyname = 'appointment_categories_staff_read'
  ) then
    create policy appointment_categories_staff_read
    on public.appointment_categories
    as permissive
    for select
    to authenticated
    using ((is_active = true) and public.is_staff());
  end if;
end $$;

alter table public.appointment_types
  add column if not exists category_id uuid references public.appointment_categories(id) on delete restrict,
  add column if not exists color text,
  add column if not exists description text;

create index if not exists idx_appointment_types_category_sort
  on public.appointment_types (category_id, sort_order, name);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointment_types_color_check'
      and conrelid = 'public.appointment_types'::regclass
  ) then
    alter table public.appointment_types
      add constraint appointment_types_color_check
      check (
        color is null
        or btrim(color) = ''
        or color ~ '^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$'
      );
  end if;
end $$;

with category_seed(name, sort_order) as (
  values
    ('Hire', 10),
    ('Purchase', 20),
    ('Retail Collection', 30),
    ('Other', 40)
)
insert into public.appointment_categories (name, sort_order, is_active)
select seed.name, seed.sort_order, true
from category_seed seed
where not exists (
  select 1
  from public.appointment_categories existing
  where lower(existing.name) = lower(seed.name)
);

with type_seed(name, category_name, duration_minutes, sort_order, color, description) as (
  values
    ('Hire Measurement', 'Hire', 30, 10, '#2563eb', 'Base duration only. The wizard may adjust timing from quantity rules.'),
    ('Style & Fit', 'Hire', 30, 20, '#0f766e', null),
    ('Full Try On', 'Hire', 30, 30, '#7c3aed', null),
    ('Hire Remeasure', 'Hire', 30, 40, '#1d4ed8', 'Base duration only. The wizard may adjust timing from quantity rules.'),
    ('Collection', 'Hire', 15, 60, '#0891b2', 'Base duration only. The wizard may adjust timing from quantity rules.'),
    ('Retail Purchase - Full Kilt Package', 'Purchase', 60, 110, '#b45309', null),
    ('Retail Purchase - Kilt Only', 'Purchase', 30, 120, '#d97706', null),
    ('Retail Purchase - Trousers', 'Purchase', 30, 130, '#ea580c', null),
    ('Retail Purchase - Jacket & Waistcoat', 'Purchase', 30, 140, '#f97316', null),
    ('Retail Purchase - Accessories', 'Purchase', 20, 150, '#fb923c', null),
    ('Retail Collection - Full Kilt Outfit', 'Retail Collection', 60, 210, '#15803d', null),
    ('Retail Collection - Kilt Only', 'Retail Collection', 30, 220, '#16a34a', null),
    ('Retail Collection - Trousers', 'Retail Collection', 30, 230, '#22c55e', null),
    ('Retail Collection - Jacket & Waistcoat', 'Retail Collection', 15, 240, '#4ade80', null),
    ('Retail Collection - Accessories', 'Retail Collection', 15, 250, '#86efac', null),
    ('Alteration - Kilt', 'Other', 20, 310, '#be123c', null),
    ('Alteration - Trews', 'Other', 20, 320, '#e11d48', null)
),
category_lookup as (
  select id, name
  from public.appointment_categories
),
updated as (
  update public.appointment_types at
  set
    category_id = cl.id,
    duration_minutes = seed.duration_minutes,
    sort_order = seed.sort_order,
    color = seed.color,
    description = seed.description,
    is_active = true
  from type_seed seed
  join category_lookup cl
    on lower(cl.name) = lower(seed.category_name)
  where lower(at.name) = lower(seed.name)
  returning at.id
)
insert into public.appointment_types (
  category_id,
  name,
  duration_minutes,
  is_active,
  sort_order,
  color,
  description
)
select
  cl.id,
  seed.name,
  seed.duration_minutes,
  true,
  seed.sort_order,
  seed.color,
  seed.description
from type_seed seed
join category_lookup cl
  on lower(cl.name) = lower(seed.category_name)
where not exists (
  select 1
  from public.appointment_types existing
  where lower(existing.name) = lower(seed.name)
);

commit;
