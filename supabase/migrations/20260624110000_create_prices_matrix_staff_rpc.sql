begin;

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  name text not null,
  status text not null default 'draft',
  effective_from date,
  is_active boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.price_matrix_columns (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  supplier text not null,
  range text not null,
  width text,
  weight text,
  supplier_sort_order integer not null default 0,
  sort_order integer not null default 0,
  external_weaver_id integer,
  external_range_id integer,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.price_sections (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint price_sections_id_price_list_key unique (id, price_list_id)
);

create table if not exists public.price_products (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null,
  section_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  cloth_required text,
  cmt_price numeric,
  delivery_weeks_min integer,
  delivery_weeks_max integer,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint price_products_price_list_id_fkey
    foreign key (price_list_id) references public.price_lists(id) on delete cascade,
  constraint price_products_section_price_list_fkey
    foreign key (section_id, price_list_id)
    references public.price_sections(id, price_list_id)
    on delete cascade
);

create table if not exists public.price_cells (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.price_products(id) on delete cascade,
  column_id uuid not null references public.price_matrix_columns(id) on delete cascade,
  retail_price numeric not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.price_lists enable row level security;
alter table public.price_matrix_columns enable row level security;
alter table public.price_sections enable row level security;
alter table public.price_products enable row level security;
alter table public.price_cells enable row level security;

create unique index if not exists price_lists_single_active_idx
  on public.price_lists (is_active)
  where is_active = true;

create index if not exists idx_price_lists_active_effective
  on public.price_lists (is_active, effective_from desc, created_at desc);

create unique index if not exists price_matrix_columns_price_list_external_range_key
  on public.price_matrix_columns (price_list_id, external_range_id)
  where external_range_id is not null;

create index if not exists idx_price_matrix_columns_price_list_sort
  on public.price_matrix_columns (price_list_id, supplier_sort_order, sort_order, supplier, range);

create unique index if not exists price_sections_price_list_name_key
  on public.price_sections (price_list_id, lower(name));


create index if not exists idx_price_sections_price_list_sort
  on public.price_sections (price_list_id, sort_order, name);

create unique index if not exists price_products_section_name_key
  on public.price_products (section_id, lower(name));

create index if not exists idx_price_products_section_sort
  on public.price_products (section_id, sort_order, name);

create unique index if not exists price_cells_product_column_key
  on public.price_cells (product_id, column_id);

create index if not exists idx_price_cells_column_product
  on public.price_cells (column_id, product_id);

drop trigger if exists trg_price_lists_updated_at on public.price_lists;
create trigger trg_price_lists_updated_at
before update on public.price_lists
for each row execute function public.set_updated_at();

drop trigger if exists trg_price_matrix_columns_updated_at on public.price_matrix_columns;
create trigger trg_price_matrix_columns_updated_at
before update on public.price_matrix_columns
for each row execute function public.set_updated_at();

drop trigger if exists trg_price_sections_updated_at on public.price_sections;
create trigger trg_price_sections_updated_at
before update on public.price_sections
for each row execute function public.set_updated_at();

drop trigger if exists trg_price_products_updated_at on public.price_products;
create trigger trg_price_products_updated_at
before update on public.price_products
for each row execute function public.set_updated_at();

drop trigger if exists trg_price_cells_updated_at on public.price_cells;
create trigger trg_price_cells_updated_at
before update on public.price_cells
for each row execute function public.set_updated_at();

comment on table public.price_lists is
  'Internal HUB price list versions for the staff-facing Prices matrix.';

comment on table public.price_matrix_columns is
  'Internal HUB price matrix columns. Optional external_* ids may reference the separate tartan catalogue project without creating runtime dependencies.';

comment on table public.price_sections is
  'Ordered product sections/categories for a HUB price list.';

comment on table public.price_products is
  'Ordered products within a HUB price section, including future detail-panel metadata.';

comment on table public.price_cells is
  'Retail price values for HUB Prices matrix product/column intersections.';

create or replace function public.ensure_prices_staff_access()
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if public.staff_role() not in ('admin', 'manager', 'agent') then
    raise exception 'Only active staff can read HUB prices.';
  end if;
end;
$function$;

create or replace function public.get_prices_matrix_staff()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_price_list public.price_lists%rowtype;
  v_payload jsonb;
begin
  perform public.ensure_prices_staff_access();

  select *
  into v_price_list
  from public.price_lists pl
  where pl.is_active = true
  order by pl.effective_from desc nulls last, pl.created_at desc, pl.id desc
  limit 1;

  if not found then
    raise exception 'No active HUB price list is configured.';
  end if;

  with ordered_columns as (
    select
      c.id,
      c.price_list_id,
      c.supplier,
      c.range,
      c.width,
      c.weight,
      c.sort_order,
      c.supplier_sort_order,
      c.external_weaver_id,
      c.external_range_id
    from public.price_matrix_columns c
    where c.price_list_id = v_price_list.id
    order by c.supplier_sort_order asc, c.sort_order asc, c.supplier asc, c.range asc, c.id asc
  ),
  ordered_sections as (
    select
      s.id,
      s.price_list_id,
      s.name,
      s.sort_order
    from public.price_sections s
    where s.price_list_id = v_price_list.id
    order by s.sort_order asc, s.name asc, s.id asc
  ),
  section_payloads as (
    select
      s.id,
      jsonb_build_object(
        'name', s.name,
        'sort_order', s.sort_order,
        'products',
        coalesce(
          (
            select jsonb_agg(product_payload order by product_sort_order, product_name, product_id)
            from (
              select
                p.sort_order as product_sort_order,
                p.name as product_name,
                p.id as product_id,
                jsonb_build_object(
                  'id', p.id,
                  'name', p.name,
                  'sort_order', p.sort_order,
                  'cloth_required', p.cloth_required,
                  'cmt_price', p.cmt_price,
                  'delivery_weeks_min', p.delivery_weeks_min,
                  'delivery_weeks_max', p.delivery_weeks_max,
                  'notes', p.notes,
                  'prices',
                  coalesce(
                    (
                      select jsonb_object_agg(pc.column_id::text, pc.retail_price)
                      from public.price_cells pc
                      join public.price_matrix_columns mc
                        on mc.id = pc.column_id
                      where pc.product_id = p.id
                        and mc.price_list_id = v_price_list.id
                    ),
                    '{}'::jsonb
                  )
                ) as product_payload
              from public.price_products p
              where p.section_id = s.id
                and p.price_list_id = v_price_list.id
            ) ordered_products
          ),
          '[]'::jsonb
        )
      ) as section_payload
    from ordered_sections s
  )
  select jsonb_build_object(
    'version', v_price_list.version,
    'columns',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'supplier', c.supplier,
            'range', c.range,
            'width', c.width,
            'weight', c.weight,
            'sort_order', c.sort_order,
            'supplier_sort_order', c.supplier_sort_order,
            'external_weaver_id', c.external_weaver_id,
            'external_range_id', c.external_range_id
          )
          order by c.supplier_sort_order, c.sort_order, c.supplier, c.range, c.id
        )
        from ordered_columns c
      ),
      '[]'::jsonb
    ),
    'sections',
    coalesce(
      (
        select jsonb_agg(sp.section_payload order by os.sort_order, os.name, os.id)
        from ordered_sections os
        join section_payloads sp
          on sp.id = os.id
      ),
      '[]'::jsonb
    )
  )
  into v_payload;

  return coalesce(v_payload, jsonb_build_object('version', v_price_list.version, 'columns', '[]'::jsonb, 'sections', '[]'::jsonb));
end;
$function$;

revoke execute on function public.get_prices_matrix_staff()
  from public, anon;
grant execute on function public.get_prices_matrix_staff() to authenticated;
revoke execute on function public.ensure_prices_staff_access()
  from public, anon, authenticated;

commit;
