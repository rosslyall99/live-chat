begin;

create table if not exists public.price_audit_log (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamp with time zone not null default now()
);

alter table public.price_audit_log enable row level security;

create index if not exists idx_price_audit_log_price_list_created_at
  on public.price_audit_log (price_list_id, created_at desc);

create index if not exists idx_price_audit_log_entity
  on public.price_audit_log (entity_type, entity_id);

create index if not exists idx_price_audit_log_changed_by_created_at
  on public.price_audit_log (changed_by_user_id, created_at desc);

comment on table public.price_audit_log is
  'Audit trail for HUB Prices draft/version actions and future admin price edits.';

create or replace function public.ensure_price_lists_admin_access()
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if public.current_staff_role() not in ('admin', 'manager') then
    raise exception 'Only admins and managers can view HUB price list versions.';
  end if;
end;
$function$;

create or replace function public.ensure_price_lists_admin_write_access()
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can create HUB price list drafts.';
  end if;
end;
$function$;

create or replace function public.get_price_lists_admin()
returns table(
  id uuid,
  version text,
  name text,
  status text,
  effective_from date,
  is_active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  column_count bigint,
  section_count bigint,
  product_count bigint,
  cell_count bigint
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  perform public.ensure_price_lists_admin_access();

  return query
  with column_counts as (
    select c.price_list_id, count(*)::bigint as column_count
    from public.price_matrix_columns c
    group by c.price_list_id
  ),
  section_counts as (
    select s.price_list_id, count(*)::bigint as section_count
    from public.price_sections s
    group by s.price_list_id
  ),
  product_counts as (
    select p.price_list_id, count(*)::bigint as product_count
    from public.price_products p
    group by p.price_list_id
  ),
  cell_counts as (
    select p.price_list_id, count(*)::bigint as cell_count
    from public.price_cells pc
    join public.price_products p
      on p.id = pc.product_id
    group by p.price_list_id
  )
  select
    pl.id,
    pl.version,
    pl.name,
    pl.status,
    pl.effective_from,
    pl.is_active,
    pl.created_at,
    pl.updated_at,
    coalesce(cc.column_count, 0) as column_count,
    coalesce(sc.section_count, 0) as section_count,
    coalesce(pc.product_count, 0) as product_count,
    coalesce(celc.cell_count, 0) as cell_count
  from public.price_lists pl
  left join column_counts cc
    on cc.price_list_id = pl.id
  left join section_counts sc
    on sc.price_list_id = pl.id
  left join product_counts pc
    on pc.price_list_id = pl.id
  left join cell_counts celc
    on celc.price_list_id = pl.id
  order by
    pl.is_active desc,
    case when pl.status = 'draft' then 0 else 1 end asc,
    pl.effective_from desc nulls last,
    pl.updated_at desc,
    pl.created_at desc,
    pl.id desc;
end;
$function$;

create or replace function public.create_price_list_draft_from_active_admin(
  p_version text default null,
  p_name text default null,
  p_reason text default null
)
returns table(
  id uuid,
  version text,
  name text,
  status text,
  effective_from date,
  is_active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  column_count bigint,
  section_count bigint,
  product_count bigint,
  cell_count bigint
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_active public.price_lists%rowtype;
  v_new public.price_lists%rowtype;
  v_version text := nullif(trim(coalesce(p_version, '')), '');
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_version is not null and v_version is null then
    raise exception 'Draft version cannot be empty.';
  end if;

  if p_name is not null and v_name is null then
    raise exception 'Draft name cannot be empty.';
  end if;

  select *
  into v_active
  from public.price_lists pl
  where pl.is_active = true
  order by pl.effective_from desc nulls last, pl.created_at desc, pl.id desc
  limit 1;

  if not found then
    raise exception 'No active HUB price list is configured.';
  end if;

  v_version := coalesce(
    v_version,
    format('%s-draft-%s', v_active.version, to_char(now(), 'YYYYMMDDHH24MISS'))
  );
  v_name := coalesce(
    v_name,
    format('%s Draft %s', v_active.name, to_char(now(), 'YYYY-MM-DD HH24:MI'))
  );

  insert into public.price_lists (
    version,
    name,
    status,
    effective_from,
    is_active
  )
  values (
    v_version,
    v_name,
    'draft',
    v_active.effective_from,
    false
  )
  returning *
  into v_new;

  create temporary table tmp_price_clone_columns (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  create temporary table tmp_price_clone_sections (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  create temporary table tmp_price_clone_products (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  insert into tmp_price_clone_columns (old_id, new_id)
  select
    c.id,
    gen_random_uuid()
  from public.price_matrix_columns c
  where c.price_list_id = v_active.id;

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
    external_range_id,
    is_active
  )
  select
    tc.new_id,
    v_new.id,
    c.matrix_key,
    c.supplier,
    c.range,
    c.width,
    c.weight,
    c.supplier_sort_order,
    c.sort_order,
    c.external_weaver_id,
    c.external_range_id,
    c.is_active
  from public.price_matrix_columns c
  join tmp_price_clone_columns tc
    on tc.old_id = c.id;

  insert into tmp_price_clone_sections (old_id, new_id)
  select
    s.id,
    gen_random_uuid()
  from public.price_sections s
  where s.price_list_id = v_active.id;

  insert into public.price_sections (
    id,
    price_list_id,
    name,
    sort_order
  )
  select
    ts.new_id,
    v_new.id,
    s.name,
    s.sort_order
  from public.price_sections s
  join tmp_price_clone_sections ts
    on ts.old_id = s.id;

  insert into tmp_price_clone_products (old_id, new_id)
  select
    p.id,
    gen_random_uuid()
  from public.price_products p
  where p.price_list_id = v_active.id;

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
    tp.new_id,
    v_new.id,
    ts.new_id,
    p.matrix_key,
    p.name,
    p.sort_order,
    p.cloth_required,
    p.cmt_price,
    p.delivery_weeks_min,
    p.delivery_weeks_max,
    p.notes
  from public.price_products p
  join tmp_price_clone_products tp
    on tp.old_id = p.id
  join tmp_price_clone_sections ts
    on ts.old_id = p.section_id;

  insert into public.price_cells (
    product_id,
    column_id,
    retail_price
  )
  select
    tp.new_id,
    tc.new_id,
    pc.retail_price
  from public.price_cells pc
  join tmp_price_clone_products tp
    on tp.old_id = pc.product_id
  join tmp_price_clone_columns tc
    on tc.old_id = pc.column_id;

  insert into public.price_column_external_ranges (
    column_id,
    external_weaver_id,
    external_range_id,
    external_range_label,
    sort_order
  )
  select
    tc.new_id,
    per.external_weaver_id,
    per.external_range_id,
    per.external_range_label,
    per.sort_order
  from public.price_column_external_ranges per
  join tmp_price_clone_columns tc
    on tc.old_id = per.column_id;

  insert into public.price_audit_log (
    price_list_id,
    entity_type,
    entity_id,
    action,
    changed_by_user_id,
    before_data,
    after_data,
    reason
  )
  values (
    v_new.id,
    'price_list',
    v_new.id,
    'draft_created',
    v_uid,
    jsonb_build_object(
      'source_price_list_id', v_active.id,
      'source_version', v_active.version,
      'source_name', v_active.name,
      'source_status', v_active.status,
      'source_effective_from', v_active.effective_from,
      'source_is_active', v_active.is_active
    ),
    jsonb_build_object(
      'draft_price_list_id', v_new.id,
      'version', v_new.version,
      'name', v_new.name,
      'status', v_new.status,
      'effective_from', v_new.effective_from,
      'is_active', v_new.is_active
    ),
    v_reason
  );

  return query
  select
    pl.id,
    pl.version,
    pl.name,
    pl.status,
    pl.effective_from,
    pl.is_active,
    pl.created_at,
    pl.updated_at,
    coalesce((
      select count(*)::bigint
      from public.price_matrix_columns c
      where c.price_list_id = pl.id
    ), 0) as column_count,
    coalesce((
      select count(*)::bigint
      from public.price_sections s
      where s.price_list_id = pl.id
    ), 0) as section_count,
    coalesce((
      select count(*)::bigint
      from public.price_products p
      where p.price_list_id = pl.id
    ), 0) as product_count,
    coalesce((
      select count(*)::bigint
      from public.price_cells pc
      join public.price_products p
        on p.id = pc.product_id
      where p.price_list_id = pl.id
    ), 0) as cell_count
  from public.price_lists pl
  where pl.id = v_new.id;
end;
$function$;

grant execute on function public.get_price_lists_admin() to authenticated;
grant execute on function public.create_price_list_draft_from_active_admin(text, text, text) to authenticated;

revoke execute on function public.ensure_price_lists_admin_access()
  from public, anon, authenticated;
revoke execute on function public.ensure_price_lists_admin_write_access()
  from public, anon, authenticated;

comment on function public.get_price_lists_admin() is
  'Admin/manager read helper listing HUB price list versions and drafts with row counts.';

comment on function public.create_price_list_draft_from_active_admin(text, text, text) is
  'Admin-only helper that clones the current active HUB price list into a new draft copy, including columns, sections, products, cells, and HUB tartan mapping bridge rows.';

commit;
