begin;

create table if not exists public.price_column_external_ranges (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.price_matrix_columns(id) on delete cascade,
  external_weaver_id integer not null,
  external_range_id integer not null,
  external_range_label text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.price_column_external_ranges enable row level security;

create unique index if not exists price_column_external_ranges_column_range_key
  on public.price_column_external_ranges (column_id, external_range_id);

create index if not exists idx_price_column_external_ranges_column_sort
  on public.price_column_external_ranges (column_id, sort_order, external_range_label, external_range_id);

drop trigger if exists trg_price_column_external_ranges_updated_at
  on public.price_column_external_ranges;
create trigger trg_price_column_external_ranges_updated_at
before update on public.price_column_external_ranges
for each row execute function public.set_updated_at();

comment on table public.price_column_external_ranges is
  'Internal HUB bridge table mapping one HUB price matrix column to one or more external tartan catalogue ranges.';

create temporary table tmp_price_column_external_range_seed (
  column_matrix_key text not null,
  external_weaver_id integer not null,
  external_range_id integer not null,
  external_range_label text,
  sort_order integer not null
) on commit drop;

insert into tmp_price_column_external_range_seed (
  column_matrix_key,
  external_weaver_id,
  external_range_id,
  external_range_label,
  sort_order
)
values
  ('marton-balmoral', 3, 14, 'Balmoral', 10),
  ('marton-bute', 3, 15, 'Bute', 10),
  ('marton-jura', 3, 16, 'Jura', 10),
  ('loch-braeriach', 2, 12, 'Braeriach', 10),
  ('loch-strome', 2, 13, 'Strome', 10),
  ('edgar-med-old-rare', 1, 6, 'Mediumweight', 10),
  ('edgar-med-old-rare', 1, 7, 'Old & Rare', 20),
  ('edgar-nevis', 1, 8, 'Nevis', 10),
  ('edgar-heavy', 1, 2, 'Heavyweight', 10),
  ('edgar-hebridean', 1, 3, 'Hebridean', 10),
  ('strathmore-t7', 4, 17, 'T7', 10),
  ('strathmore-w60', 4, 18, 'W60', 10),
  ('welsh-rare', 5, 19, 'Welsh', 10);

insert into public.price_column_external_ranges (
  column_id,
  external_weaver_id,
  external_range_id,
  external_range_label,
  sort_order
)
select
  c.id,
  seed.external_weaver_id,
  seed.external_range_id,
  seed.external_range_label,
  seed.sort_order
from tmp_price_column_external_range_seed seed
join public.price_matrix_columns c
  on c.matrix_key = seed.column_matrix_key
on conflict (column_id, external_range_id) do update
set
  external_weaver_id = excluded.external_weaver_id,
  external_range_label = excluded.external_range_label,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.price_matrix_columns c
set
  external_weaver_id = mapped.external_weaver_id,
  external_range_id = mapped.external_range_id,
  updated_at = now()
from (
  values
    ('marton-balmoral', 3, 14),
    ('marton-bute', 3, 15),
    ('marton-jura', 3, 16),
    ('loch-braeriach', 2, 12),
    ('loch-strome', 2, 13),
    ('edgar-nevis', 1, 8),
    ('edgar-heavy', 1, 2),
    ('edgar-hebridean', 1, 3),
    ('strathmore-t7', 4, 17),
    ('strathmore-w60', 4, 18),
    ('welsh-rare', 5, 19)
) as mapped(matrix_key, external_weaver_id, external_range_id)
where c.matrix_key = mapped.matrix_key;

update public.price_matrix_columns
set
  external_weaver_id = 1,
  external_range_id = null,
  updated_at = now()
where matrix_key = 'edgar-med-old-rare';

drop function if exists public.get_price_column_mapping_status_staff();
create or replace function public.get_price_column_mapping_status_staff()
returns table(
  price_list_id uuid,
  price_list_version text,
  column_id uuid,
  matrix_key text,
  supplier text,
  range text,
  width text,
  weight text,
  external_weaver_id integer,
  external_range_id integer,
  external_mapping_count integer,
  external_mapping_complete boolean,
  external_ranges jsonb
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_price_list public.price_lists%rowtype;
begin
  perform public.ensure_prices_mapping_staff_access();

  select *
  into v_price_list
  from public.price_lists pl
  where pl.is_active = true
  order by pl.effective_from desc nulls last, pl.created_at desc, pl.id desc
  limit 1;

  if not found then
    raise exception 'No active HUB price list is configured.';
  end if;

  return query
  with mapping_rollup as (
    select
      per.column_id,
      count(*)::integer as external_mapping_count,
      jsonb_agg(
        jsonb_build_object(
          'external_weaver_id', per.external_weaver_id,
          'external_range_id', per.external_range_id,
          'external_range_label', per.external_range_label,
          'sort_order', per.sort_order
        )
        order by per.sort_order asc, per.external_range_id asc
      ) as external_ranges
    from public.price_column_external_ranges per
    group by per.column_id
  )
  select
    v_price_list.id as price_list_id,
    v_price_list.version as price_list_version,
    c.id as column_id,
    c.matrix_key,
    c.supplier,
    c.range,
    c.width,
    c.weight,
    c.external_weaver_id,
    c.external_range_id,
    coalesce(mr.external_mapping_count, 0) as external_mapping_count,
    (
      c.external_range_id is not null
      or coalesce(mr.external_mapping_count, 0) > 0
    ) as external_mapping_complete,
    coalesce(mr.external_ranges, '[]'::jsonb) as external_ranges
  from public.price_matrix_columns c
  left join mapping_rollup mr
    on mr.column_id = c.id
  where c.price_list_id = v_price_list.id
  order by
    c.supplier_sort_order asc,
    c.sort_order asc,
    c.supplier asc,
    c.range asc,
    c.id asc;
end;
$function$;

comment on function public.get_price_column_mapping_status_staff() is
  'Read-only HUB helper for admins/managers to inspect external tartan mapping readiness on active price matrix columns, including multi-range bridge rows. Queries HUB pricing tables only.';

commit;
