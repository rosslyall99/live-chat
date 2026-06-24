begin;

alter table public.price_matrix_columns
  add column if not exists matrix_key text;

alter table public.price_products
  add column if not exists matrix_key text;

create unique index if not exists price_matrix_columns_price_list_matrix_key_key
  on public.price_matrix_columns (price_list_id, matrix_key)
  where matrix_key is not null;

create unique index if not exists price_products_price_list_matrix_key_key
  on public.price_products (price_list_id, matrix_key)
  where matrix_key is not null;

create unique index if not exists price_sections_price_list_name_exact_key
  on public.price_sections (price_list_id, name);

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
      coalesce(c.matrix_key, c.id::text) as public_id,
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
            select jsonb_agg(product_payload order by product_sort_order, product_name, product_public_id)
            from (
              select
                p.sort_order as product_sort_order,
                p.name as product_name,
                coalesce(p.matrix_key, p.id::text) as product_public_id,
                jsonb_build_object(
                  'id', coalesce(p.matrix_key, p.id::text),
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
                      select jsonb_object_agg(coalesce(mc.matrix_key, mc.id::text), pc.retail_price)
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
            'id', c.public_id,
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

  return coalesce(
    v_payload,
    jsonb_build_object(
      'version', v_price_list.version,
      'columns', '[]'::jsonb,
      'sections', '[]'::jsonb
    )
  );
end;
$function$;

create temporary table tmp_prices_seed_columns (
  id uuid primary key,
  matrix_key text not null,
  supplier text not null,
  range text not null,
  width text,
  weight text,
  supplier_sort_order integer not null,
  sort_order integer not null,
  external_weaver_id integer,
  external_range_id integer
) on commit drop;

insert into tmp_prices_seed_columns (
  id,
  matrix_key,
  supplier,
  range,
  width,
  weight,
  supplier_sort_order,
  sort_order,
  external_weaver_id,
  external_range_id
)
values
  ('00000000-0000-0000-0000-000000000101', 'marton-balmoral', 'Marton Mills', 'Balmoral', 'DW', '8', 10, 10, null, null),
  ('00000000-0000-0000-0000-000000000102', 'marton-bute', 'Marton Mills', 'Bute', 'DW', '13', 10, 20, null, null),
  ('00000000-0000-0000-0000-000000000103', 'marton-jura', 'Marton Mills', 'Jura', 'DW', '16', 10, 30, null, null),
  ('00000000-0000-0000-0000-000000000104', 'marton-tweed', 'Marton Mills', 'Tweed', 'DW', 'Var', 10, 40, null, null),
  ('00000000-0000-0000-0000-000000000105', 'loch-rv150', 'Lochcarron', 'RV150', 'DW', '11', 20, 50, null, null),
  ('00000000-0000-0000-0000-000000000106', 'loch-braeriach', 'Lochcarron', 'Braeriach', 'DW', '13', 20, 60, null, null),
  ('00000000-0000-0000-0000-000000000107', 'loch-strome', 'Lochcarron', 'Strome', 'DW', '16', 20, 70, null, null),
  ('00000000-0000-0000-0000-000000000108', 'edgar-med-old-rare', 'House of Edgar', 'Med/O&R', 'SW', '13', 30, 80, null, null),
  ('00000000-0000-0000-0000-000000000109', 'edgar-nevis', 'House of Edgar', 'Nevis', 'DW', '16', 30, 90, null, null),
  ('00000000-0000-0000-0000-00000000010a', 'edgar-heavy', 'House of Edgar', 'Heavy', 'SW', '16', 30, 100, null, null),
  ('00000000-0000-0000-0000-00000000010b', 'edgar-hebridean', 'House of Edgar', 'Hebridean', 'SW', '13', 30, 110, null, null),
  ('00000000-0000-0000-0000-00000000010c', 'edgar-clunie', 'House of Edgar', 'Clunie', 'DW', '16', 30, 120, null, null),
  ('00000000-0000-0000-0000-00000000010d', 'strathmore-t7', 'Strathmore', 'T7', 'DW', '11', 40, 130, null, null),
  ('00000000-0000-0000-0000-00000000010e', 'strathmore-w60', 'Strathmore', 'W60', 'DW', '13', 40, 140, null, null),
  ('00000000-0000-0000-0000-00000000010f', 'strathmore-stock', 'Strathmore', 'Stock', 'DW', '13', 40, 150, null, null),
  ('00000000-0000-0000-0000-000000000110', 'welsh-rare', 'Welsh', 'Rare', 'DW', '13', 50, 160, null, null);

create temporary table tmp_prices_seed_sections (
  id uuid primary key,
  name text not null,
  sort_order integer not null
) on commit drop;

insert into tmp_prices_seed_sections (id, name, sort_order)
values
  ('00000000-0000-0000-0000-000000000201', 'KILTS', 10),
  ('00000000-0000-0000-0000-000000000202', 'TIES', 20),
  ('00000000-0000-0000-0000-000000000203', 'TROUSERS', 30),
  ('00000000-0000-0000-0000-000000000204', 'CHILDREN', 40),
  ('00000000-0000-0000-0000-000000000205', 'LADIESWEAR', 50);

create temporary table tmp_prices_seed_products (
  id uuid primary key,
  section_name text not null,
  matrix_key text not null,
  name text not null,
  sort_order integer not null,
  cloth_required text,
  cmt_price numeric,
  delivery_weeks_min integer,
  delivery_weeks_max integer,
  notes text
) on commit drop;

insert into tmp_prices_seed_products (
  id,
  section_name,
  matrix_key,
  name,
  sort_order,
  cloth_required,
  cmt_price,
  delivery_weeks_min,
  delivery_weeks_max,
  notes
)
values
  ('00000000-0000-0000-0000-000000000301', 'KILTS', 'full-kilt-9-yard', 'Full Kilt - 9 Yard', 10, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000302', 'KILTS', 'full-kilt-8-yard', 'Full Kilt - 8 Yard', 20, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000303', 'KILTS', 'full-kilt-7-yard', 'Full Kilt - 7 Yard', 30, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000304', 'KILTS', 'casual-kilt-6-yard', 'Casual Kilt - 6 Yard', 40, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000305', 'KILTS', 'handfasting', 'Handfasting', 50, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000306', 'KILTS', 'pocket-square', 'Pocket Square', 60, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000307', 'KILTS', 'plaid', 'Plaid', 70, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000308', 'KILTS', 'cloth-per-metre', 'Cloth per metre', 80, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000309', 'TIES', 'mto-tie-qty-1', 'MTO Tie - qty 1', 10, null, null, null, null, null),
  ('00000000-0000-0000-0000-00000000030a', 'TIES', 'mto-tie-qty-2', 'MTO Tie - qty 2', 20, null, null, null, null, null),
  ('00000000-0000-0000-0000-00000000030b', 'TIES', 'regular-tie', 'Regular Tie', 30, null, null, null, null, null),
  ('00000000-0000-0000-0000-00000000030c', 'TIES', 'ready-tied-bowtie', 'Ready Tied Bowtie', 40, null, null, null, null, null),
  ('00000000-0000-0000-0000-00000000030d', 'TROUSERS', 'standard-up-to-waist-41', 'Standard (up to waist 41")', 10, null, null, null, null, null),
  ('00000000-0000-0000-0000-00000000030e', 'TROUSERS', 'waistcoat-up-to-chest-47', 'Waistcoat (up to chest 47")', 20, null, null, null, null, null),
  ('00000000-0000-0000-0000-00000000030f', 'CHILDREN', 'baby-kilt-4-12m-l8', 'Baby Kilt 4-12m - L8"', 10, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000310', 'CHILDREN', 'wee-man-1', 'Wee Man 1', 20, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000311', 'LADIESWEAR', 'coorie', 'Coorie', 10, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000312', 'LADIESWEAR', 'sash', 'Sash', 20, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000313', 'LADIESWEAR', 'stole', 'Stole', 30, null, null, null, null, null),
  ('00000000-0000-0000-0000-000000000314', 'LADIESWEAR', 'shawl', 'Shawl', 40, null, null, null, null, null);

create temporary table tmp_prices_seed_cells (
  product_matrix_key text not null,
  column_matrix_key text not null,
  retail_price numeric not null
) on commit drop;

insert into tmp_prices_seed_cells (product_matrix_key, column_matrix_key, retail_price)
values
  ('full-kilt-9-yard', 'marton-balmoral', 420),
  ('full-kilt-9-yard', 'marton-bute', 590),
  ('full-kilt-9-yard', 'marton-jura', 590),
  ('full-kilt-9-yard', 'marton-tweed', 590),
  ('full-kilt-9-yard', 'loch-rv150', 640),
  ('full-kilt-9-yard', 'loch-braeriach', 640),
  ('full-kilt-9-yard', 'loch-strome', 650),
  ('full-kilt-9-yard', 'edgar-med-old-rare', 760),
  ('full-kilt-9-yard', 'edgar-nevis', 590),
  ('full-kilt-9-yard', 'edgar-heavy', 660),
  ('full-kilt-9-yard', 'edgar-hebridean', 600),
  ('full-kilt-9-yard', 'edgar-clunie', 710),
  ('full-kilt-9-yard', 'strathmore-t7', 550),
  ('full-kilt-9-yard', 'strathmore-w60', 550),
  ('full-kilt-9-yard', 'strathmore-stock', 600),
  ('full-kilt-9-yard', 'welsh-rare', 660),
  ('full-kilt-8-yard', 'marton-balmoral', 400),
  ('full-kilt-8-yard', 'marton-bute', 550),
  ('full-kilt-8-yard', 'marton-jura', 550),
  ('full-kilt-8-yard', 'marton-tweed', 550),
  ('full-kilt-8-yard', 'loch-rv150', 600),
  ('full-kilt-8-yard', 'loch-braeriach', 600),
  ('full-kilt-8-yard', 'loch-strome', 600),
  ('full-kilt-8-yard', 'edgar-med-old-rare', 700),
  ('full-kilt-8-yard', 'edgar-nevis', 550),
  ('full-kilt-8-yard', 'edgar-heavy', 600),
  ('full-kilt-8-yard', 'edgar-hebridean', 550),
  ('full-kilt-8-yard', 'edgar-clunie', 650),
  ('full-kilt-8-yard', 'strathmore-t7', 500),
  ('full-kilt-8-yard', 'strathmore-w60', 500),
  ('full-kilt-8-yard', 'strathmore-stock', 500),
  ('full-kilt-8-yard', 'welsh-rare', 550),
  ('full-kilt-7-yard', 'marton-balmoral', 380),
  ('full-kilt-7-yard', 'marton-bute', 510),
  ('full-kilt-7-yard', 'marton-jura', 515),
  ('full-kilt-7-yard', 'marton-tweed', 515),
  ('full-kilt-7-yard', 'loch-rv150', 560),
  ('full-kilt-7-yard', 'loch-braeriach', 560),
  ('full-kilt-7-yard', 'loch-strome', 575),
  ('full-kilt-7-yard', 'edgar-med-old-rare', 650),
  ('full-kilt-7-yard', 'edgar-nevis', 515),
  ('full-kilt-7-yard', 'edgar-heavy', 570),
  ('full-kilt-7-yard', 'edgar-hebridean', 520),
  ('full-kilt-7-yard', 'edgar-clunie', 610),
  ('full-kilt-7-yard', 'strathmore-t7', 475),
  ('full-kilt-7-yard', 'strathmore-w60', 475),
  ('full-kilt-7-yard', 'strathmore-stock', 485),
  ('full-kilt-7-yard', 'welsh-rare', 520),
  ('casual-kilt-6-yard', 'marton-balmoral', 290),
  ('casual-kilt-6-yard', 'marton-bute', 410),
  ('casual-kilt-6-yard', 'marton-jura', 400),
  ('casual-kilt-6-yard', 'marton-tweed', 400),
  ('casual-kilt-6-yard', 'loch-rv150', 450),
  ('casual-kilt-6-yard', 'loch-braeriach', 450),
  ('casual-kilt-6-yard', 'loch-strome', 440),
  ('casual-kilt-6-yard', 'edgar-med-old-rare', 520),
  ('casual-kilt-6-yard', 'edgar-nevis', 400),
  ('casual-kilt-6-yard', 'edgar-heavy', 420),
  ('casual-kilt-6-yard', 'edgar-hebridean', 390),
  ('casual-kilt-6-yard', 'edgar-clunie', 460),
  ('casual-kilt-6-yard', 'strathmore-t7', 340),
  ('casual-kilt-6-yard', 'strathmore-w60', 330),
  ('casual-kilt-6-yard', 'strathmore-stock', 390),
  ('casual-kilt-6-yard', 'welsh-rare', 410),
  ('handfasting', 'marton-balmoral', 35),
  ('handfasting', 'marton-bute', 45),
  ('handfasting', 'marton-jura', 45),
  ('handfasting', 'marton-tweed', 45),
  ('handfasting', 'loch-rv150', 45),
  ('handfasting', 'loch-braeriach', 50),
  ('handfasting', 'loch-strome', 50),
  ('handfasting', 'edgar-med-old-rare', 55),
  ('handfasting', 'edgar-nevis', 50),
  ('handfasting', 'edgar-heavy', 55),
  ('handfasting', 'edgar-hebridean', 55),
  ('handfasting', 'edgar-clunie', 60),
  ('handfasting', 'strathmore-t7', 45),
  ('handfasting', 'strathmore-w60', 45),
  ('handfasting', 'strathmore-stock', 45),
  ('handfasting', 'welsh-rare', 55),
  ('pocket-square', 'marton-balmoral', 18),
  ('pocket-square', 'marton-bute', 24),
  ('pocket-square', 'marton-jura', 24),
  ('pocket-square', 'marton-tweed', 24),
  ('pocket-square', 'loch-rv150', 25),
  ('pocket-square', 'loch-braeriach', 28),
  ('pocket-square', 'loch-strome', 28),
  ('pocket-square', 'edgar-med-old-rare', 30),
  ('pocket-square', 'edgar-nevis', 28),
  ('pocket-square', 'edgar-heavy', 30),
  ('pocket-square', 'edgar-hebridean', 30),
  ('pocket-square', 'edgar-clunie', 32),
  ('pocket-square', 'strathmore-t7', 25),
  ('pocket-square', 'strathmore-w60', 25),
  ('pocket-square', 'strathmore-stock', 25),
  ('pocket-square', 'welsh-rare', 30),
  ('plaid', 'marton-balmoral', 160),
  ('plaid', 'marton-bute', 210),
  ('plaid', 'marton-jura', 220),
  ('plaid', 'marton-tweed', 220),
  ('plaid', 'loch-rv150', 235),
  ('plaid', 'loch-braeriach', 240),
  ('plaid', 'loch-strome', 250),
  ('plaid', 'edgar-med-old-rare', 290),
  ('plaid', 'edgar-nevis', 245),
  ('plaid', 'edgar-heavy', 275),
  ('plaid', 'edgar-hebridean', 255),
  ('plaid', 'edgar-clunie', 310),
  ('plaid', 'strathmore-t7', 230),
  ('plaid', 'strathmore-w60', 230),
  ('plaid', 'strathmore-stock', 240),
  ('plaid', 'welsh-rare', 275),
  ('cloth-per-metre', 'marton-balmoral', 45),
  ('cloth-per-metre', 'marton-bute', 65),
  ('cloth-per-metre', 'marton-jura', 72),
  ('cloth-per-metre', 'marton-tweed', 72),
  ('cloth-per-metre', 'loch-rv150', 76),
  ('cloth-per-metre', 'loch-braeriach', 82),
  ('cloth-per-metre', 'loch-strome', 88),
  ('cloth-per-metre', 'edgar-med-old-rare', 95),
  ('cloth-per-metre', 'edgar-nevis', 86),
  ('cloth-per-metre', 'edgar-heavy', 95),
  ('cloth-per-metre', 'edgar-hebridean', 90),
  ('cloth-per-metre', 'edgar-clunie', 98),
  ('cloth-per-metre', 'strathmore-t7', 72),
  ('cloth-per-metre', 'strathmore-w60', 74),
  ('cloth-per-metre', 'strathmore-stock', 74),
  ('cloth-per-metre', 'welsh-rare', 95),
  ('mto-tie-qty-1', 'loch-rv150', 55),
  ('mto-tie-qty-1', 'loch-braeriach', 65),
  ('mto-tie-qty-1', 'loch-strome', 70),
  ('mto-tie-qty-1', 'edgar-med-old-rare', 60),
  ('mto-tie-qty-1', 'edgar-hebridean', 60),
  ('mto-tie-qty-1', 'strathmore-stock', 60),
  ('mto-tie-qty-1', 'welsh-rare', 65),
  ('mto-tie-qty-2', 'loch-rv150', 95),
  ('mto-tie-qty-2', 'loch-braeriach', 115),
  ('mto-tie-qty-2', 'loch-strome', 125),
  ('mto-tie-qty-2', 'edgar-med-old-rare', 105),
  ('mto-tie-qty-2', 'edgar-hebridean', 105),
  ('mto-tie-qty-2', 'strathmore-stock', 105),
  ('mto-tie-qty-2', 'welsh-rare', 115),
  ('regular-tie', 'loch-rv150', 25),
  ('regular-tie', 'loch-braeriach', 55),
  ('regular-tie', 'loch-strome', 55),
  ('regular-tie', 'edgar-med-old-rare', 30),
  ('regular-tie', 'edgar-hebridean', 30),
  ('regular-tie', 'strathmore-stock', 30),
  ('regular-tie', 'welsh-rare', 30),
  ('ready-tied-bowtie', 'marton-balmoral', 25),
  ('ready-tied-bowtie', 'marton-bute', 25),
  ('ready-tied-bowtie', 'marton-jura', 25),
  ('ready-tied-bowtie', 'marton-tweed', 25),
  ('ready-tied-bowtie', 'loch-rv150', 25),
  ('ready-tied-bowtie', 'loch-braeriach', 25),
  ('ready-tied-bowtie', 'loch-strome', 25),
  ('ready-tied-bowtie', 'edgar-med-old-rare', 25),
  ('ready-tied-bowtie', 'edgar-hebridean', 25),
  ('ready-tied-bowtie', 'strathmore-t7', 25),
  ('ready-tied-bowtie', 'strathmore-w60', 25),
  ('ready-tied-bowtie', 'strathmore-stock', 25),
  ('ready-tied-bowtie', 'welsh-rare', 25),
  ('standard-up-to-waist-41', 'marton-balmoral', 180),
  ('standard-up-to-waist-41', 'marton-bute', 245),
  ('standard-up-to-waist-41', 'marton-jura', 255),
  ('standard-up-to-waist-41', 'marton-tweed', 255),
  ('standard-up-to-waist-41', 'loch-rv150', 270),
  ('standard-up-to-waist-41', 'loch-braeriach', 270),
  ('standard-up-to-waist-41', 'loch-strome', 285),
  ('standard-up-to-waist-41', 'edgar-med-old-rare', 320),
  ('standard-up-to-waist-41', 'edgar-nevis', 270),
  ('standard-up-to-waist-41', 'edgar-heavy', 325),
  ('standard-up-to-waist-41', 'edgar-hebridean', 285),
  ('standard-up-to-waist-41', 'edgar-clunie', 340),
  ('standard-up-to-waist-41', 'strathmore-t7', 285),
  ('standard-up-to-waist-41', 'strathmore-w60', 290),
  ('standard-up-to-waist-41', 'strathmore-stock', 285),
  ('standard-up-to-waist-41', 'welsh-rare', 335),
  ('waistcoat-up-to-chest-47', 'marton-balmoral', 185),
  ('waistcoat-up-to-chest-47', 'marton-bute', 255),
  ('waistcoat-up-to-chest-47', 'marton-jura', 265),
  ('waistcoat-up-to-chest-47', 'marton-tweed', 265),
  ('waistcoat-up-to-chest-47', 'loch-rv150', 275),
  ('waistcoat-up-to-chest-47', 'loch-braeriach', 285),
  ('waistcoat-up-to-chest-47', 'loch-strome', 300),
  ('waistcoat-up-to-chest-47', 'edgar-med-old-rare', 335),
  ('waistcoat-up-to-chest-47', 'edgar-nevis', 285),
  ('waistcoat-up-to-chest-47', 'edgar-heavy', 330),
  ('waistcoat-up-to-chest-47', 'edgar-hebridean', 295),
  ('waistcoat-up-to-chest-47', 'edgar-clunie', 350),
  ('waistcoat-up-to-chest-47', 'strathmore-t7', 290),
  ('waistcoat-up-to-chest-47', 'strathmore-w60', 295),
  ('waistcoat-up-to-chest-47', 'strathmore-stock', 290),
  ('waistcoat-up-to-chest-47', 'welsh-rare', 340),
  ('baby-kilt-4-12m-l8', 'marton-balmoral', 75),
  ('baby-kilt-4-12m-l8', 'marton-bute', 105),
  ('baby-kilt-4-12m-l8', 'marton-jura', 110),
  ('baby-kilt-4-12m-l8', 'marton-tweed', 110),
  ('baby-kilt-4-12m-l8', 'loch-rv150', 120),
  ('baby-kilt-4-12m-l8', 'loch-braeriach', 120),
  ('baby-kilt-4-12m-l8', 'loch-strome', 130),
  ('baby-kilt-4-12m-l8', 'edgar-med-old-rare', 145),
  ('baby-kilt-4-12m-l8', 'edgar-nevis', 120),
  ('baby-kilt-4-12m-l8', 'edgar-heavy', 150),
  ('baby-kilt-4-12m-l8', 'edgar-hebridean', 130),
  ('baby-kilt-4-12m-l8', 'edgar-clunie', 165),
  ('baby-kilt-4-12m-l8', 'strathmore-t7', 125),
  ('baby-kilt-4-12m-l8', 'strathmore-w60', 125),
  ('baby-kilt-4-12m-l8', 'strathmore-stock', 125),
  ('baby-kilt-4-12m-l8', 'welsh-rare', 150),
  ('wee-man-1', 'marton-balmoral', 110),
  ('wee-man-1', 'marton-bute', 160),
  ('wee-man-1', 'marton-jura', 170),
  ('wee-man-1', 'marton-tweed', 170),
  ('wee-man-1', 'loch-rv150', 180),
  ('wee-man-1', 'loch-braeriach', 180),
  ('wee-man-1', 'loch-strome', 190),
  ('wee-man-1', 'edgar-med-old-rare', 210),
  ('wee-man-1', 'edgar-nevis', 180),
  ('wee-man-1', 'edgar-heavy', 220),
  ('wee-man-1', 'edgar-hebridean', 190),
  ('wee-man-1', 'edgar-clunie', 280),
  ('wee-man-1', 'strathmore-t7', 190),
  ('wee-man-1', 'strathmore-w60', 190),
  ('wee-man-1', 'strathmore-stock', 190),
  ('wee-man-1', 'welsh-rare', 220),
  ('coorie', 'loch-rv150', 45),
  ('coorie', 'strathmore-t7', 45),
  ('sash', 'loch-rv150', 75),
  ('stole', 'loch-rv150', 130),
  ('shawl', 'loch-rv150', 155);

update public.price_lists
set is_active = false
where is_active = true
  and id <> '00000000-0000-0000-0000-000000000001';

insert into public.price_lists (
  id,
  version,
  name,
  status,
  effective_from,
  is_active
)
values (
  '00000000-0000-0000-0000-000000000001',
  '2026-01',
  '2026 Price List',
  'published',
  date '2026-01-01',
  true
)
on conflict (id) do update
set
  version = excluded.version,
  name = excluded.name,
  status = excluded.status,
  effective_from = excluded.effective_from,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.price_matrix_columns (
  id,
  price_list_id,
  matrix_key,
  supplier,
  range,
  width,
  weight,
  supplier_sort_order,
  sort_order,
  external_weaver_id,
  external_range_id
)
select
  c.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  c.matrix_key,
  c.supplier,
  c.range,
  c.width,
  c.weight,
  c.supplier_sort_order,
  c.sort_order,
  c.external_weaver_id,
  c.external_range_id
from tmp_prices_seed_columns c
on conflict (id) do update
set
  price_list_id = excluded.price_list_id,
  matrix_key = excluded.matrix_key,
  supplier = excluded.supplier,
  range = excluded.range,
  width = excluded.width,
  weight = excluded.weight,
  supplier_sort_order = excluded.supplier_sort_order,
  sort_order = excluded.sort_order,
  external_weaver_id = excluded.external_weaver_id,
  external_range_id = excluded.external_range_id,
  updated_at = now();

insert into public.price_sections (
  id,
  price_list_id,
  name,
  sort_order
)
select
  s.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  s.name,
  s.sort_order
from tmp_prices_seed_sections s
on conflict (id) do update
set
  price_list_id = excluded.price_list_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.price_products (
  id,
  price_list_id,
  section_id,
  matrix_key,
  name,
  sort_order,
  cloth_required,
  cmt_price,
  delivery_weeks_min,
  delivery_weeks_max,
  notes
)
select
  p.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  s.id,
  p.matrix_key,
  p.name,
  p.sort_order,
  p.cloth_required,
  p.cmt_price,
  p.delivery_weeks_min,
  p.delivery_weeks_max,
  p.notes
from tmp_prices_seed_products p
join public.price_sections s
  on s.price_list_id = '00000000-0000-0000-0000-000000000001'::uuid
 and s.name = p.section_name
on conflict (id) do update
set
  price_list_id = excluded.price_list_id,
  section_id = excluded.section_id,
  matrix_key = excluded.matrix_key,
  name = excluded.name,
  sort_order = excluded.sort_order,
  cloth_required = excluded.cloth_required,
  cmt_price = excluded.cmt_price,
  delivery_weeks_min = excluded.delivery_weeks_min,
  delivery_weeks_max = excluded.delivery_weeks_max,
  notes = excluded.notes,
  updated_at = now();

delete from public.price_cells pc
using public.price_products p
where pc.product_id = p.id
  and p.price_list_id = '00000000-0000-0000-0000-000000000001'::uuid;

insert into public.price_cells (
  product_id,
  column_id,
  retail_price
)
select
  p.id,
  c.id,
  sc.retail_price
from tmp_prices_seed_cells sc
join public.price_products p
  on p.price_list_id = '00000000-0000-0000-0000-000000000001'::uuid
 and p.matrix_key = sc.product_matrix_key
join public.price_matrix_columns c
  on c.price_list_id = '00000000-0000-0000-0000-000000000001'::uuid
 and c.matrix_key = sc.column_matrix_key
on conflict (product_id, column_id) do update
set
  retail_price = excluded.retail_price,
  updated_at = now();

commit;
