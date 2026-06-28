begin;

alter table public.price_products
  add column if not exists is_active boolean not null default true;

update public.price_products
set is_active = true
where is_active is distinct from true;

create index if not exists idx_price_products_price_list_active_section_sort
  on public.price_products (price_list_id, is_active, section_id, sort_order, name);

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
      and c.is_active = true
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
      and exists (
        select 1
        from public.price_products p
        where p.section_id = s.id
          and p.price_list_id = v_price_list.id
          and p.is_active = true
      )
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
                        and mc.is_active = true
                    ),
                    '{}'::jsonb
                  )
                ) as product_payload
              from public.price_products p
              where p.section_id = s.id
                and p.price_list_id = v_price_list.id
                and p.is_active = true
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

  return coalesce(v_payload, jsonb_build_object('version', v_price_list.version, 'columns', '[]'::jsonb, 'sections', '[]'::jsonb));
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
    where c.is_active = true
    group by c.price_list_id
  ),
  section_counts as (
    select s.price_list_id, count(*)::bigint as section_count
    from public.price_sections s
    where exists (
      select 1
      from public.price_products p
      where p.section_id = s.id
        and p.price_list_id = s.price_list_id
        and p.is_active = true
    )
    group by s.price_list_id
  ),
  product_counts as (
    select p.price_list_id, count(*)::bigint as product_count
    from public.price_products p
    where p.is_active = true
    group by p.price_list_id
  ),
  cell_counts as (
    select p.price_list_id, count(*)::bigint as cell_count
    from public.price_cells pc
    join public.price_products p
      on p.id = pc.product_id
    join public.price_matrix_columns c
      on c.id = pc.column_id
    where p.is_active = true
      and c.is_active = true
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
    notes,
    is_active
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
    p.notes,
    p.is_active
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
        and c.is_active = true
    ), 0) as column_count,
    coalesce((
      select count(*)::bigint
      from public.price_sections s
      where s.price_list_id = pl.id
        and exists (
          select 1
          from public.price_products p
          where p.section_id = s.id
            and p.price_list_id = pl.id
            and p.is_active = true
        )
    ), 0) as section_count,
    coalesce((
      select count(*)::bigint
      from public.price_products p
      where p.price_list_id = pl.id
        and p.is_active = true
    ), 0) as product_count,
    coalesce((
      select count(*)::bigint
      from public.price_cells pc
      join public.price_products p
        on p.id = pc.product_id
      join public.price_matrix_columns c
        on c.id = pc.column_id
      where p.price_list_id = pl.id
        and p.is_active = true
        and c.is_active = true
    ), 0) as cell_count
  from public.price_lists pl
  where pl.id = v_new.id;
end;
$function$;

create or replace function public.get_price_list_matrix_admin(p_price_list_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_price_list public.price_lists%rowtype;
  v_payload jsonb;
begin
  perform public.ensure_price_lists_admin_access();

  if p_price_list_id is null then
    raise exception 'Price list id is required.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = p_price_list_id
  limit 1;

  if not found then
    raise exception 'HUB price list % does not exist.', p_price_list_id;
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
      and c.is_active = true
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
      and exists (
        select 1
        from public.price_products p
        where p.section_id = s.id
          and p.price_list_id = v_price_list.id
          and p.is_active = true
      )
    order by s.sort_order asc, s.name asc, s.id asc
  ),
  section_payloads as (
    select
      s.id,
      jsonb_build_object(
        'id', s.id,
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
                  'record_id', p.id,
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
                        and mc.is_active = true
                    ),
                    '{}'::jsonb
                  ),
                  'price_cells',
                  coalesce(
                    (
                      select jsonb_object_agg(
                        coalesce(mc.matrix_key, mc.id::text),
                        jsonb_build_object(
                          'record_id', pc.id,
                          'retail_price', pc.retail_price
                        )
                      )
                      from public.price_cells pc
                      join public.price_matrix_columns mc
                        on mc.id = pc.column_id
                      where pc.product_id = p.id
                        and mc.price_list_id = v_price_list.id
                        and mc.is_active = true
                    ),
                    '{}'::jsonb
                  )
                ) as product_payload
              from public.price_products p
              where p.section_id = s.id
                and p.price_list_id = v_price_list.id
                and p.is_active = true
            ) ordered_products
          ),
          '[]'::jsonb
        )
      ) as section_payload
    from ordered_sections s
  )
  select jsonb_build_object(
    'id', v_price_list.id,
    'version', v_price_list.version,
    'name', v_price_list.name,
    'status', v_price_list.status,
    'is_active', v_price_list.is_active,
    'effective_from', v_price_list.effective_from,
    'columns',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'record_id', c.id,
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
      'id', v_price_list.id,
      'version', v_price_list.version,
      'name', v_price_list.name,
      'status', v_price_list.status,
      'is_active', v_price_list.is_active,
      'effective_from', v_price_list.effective_from,
      'columns', '[]'::jsonb,
      'sections', '[]'::jsonb
    )
  );
end;
$function$;

create or replace function public.update_price_product_admin(
  p_product_id uuid,
  p_name text default null,
  p_cloth_required text default null,
  p_cmt_price numeric default null,
  p_delivery_weeks_min integer default null,
  p_delivery_weeks_max integer default null,
  p_notes text default null,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  section_id uuid,
  matrix_key text,
  name text,
  cloth_required text,
  cmt_price numeric,
  delivery_weeks_min integer,
  delivery_weeks_max integer,
  notes text,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_product public.price_products%rowtype;
  v_updated public.price_products%rowtype;
  v_price_list public.price_lists%rowtype;
  v_name text := case when p_name is null then null else nullif(trim(p_name), '') end;
  v_cloth_required text := case when p_cloth_required is null then null else nullif(trim(p_cloth_required), '') end;
  v_notes text := case when p_notes is null then null else nullif(trim(p_notes), '') end;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before_data jsonb;
  v_after_data jsonb;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_product_id is null then
    raise exception 'Product id is required.';
  end if;

  if p_name is not null and v_name is null then
    raise exception 'Product name cannot be empty.';
  end if;

  if p_cmt_price is not null and p_cmt_price < 0 then
    raise exception 'CMT price must be null or greater than or equal to 0.';
  end if;

  if p_delivery_weeks_min is not null and p_delivery_weeks_min < 0 then
    raise exception 'Delivery weeks min must be null or greater than or equal to 0.';
  end if;

  if p_delivery_weeks_max is not null and p_delivery_weeks_max < 0 then
    raise exception 'Delivery weeks max must be null or greater than or equal to 0.';
  end if;

  select *
  into v_product
  from public.price_products pp
  where pp.id = p_product_id
  limit 1;

  if not found then
    raise exception 'That price product could not be found.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = v_product.price_list_id
  limit 1;

  if not found then
    raise exception 'That product is not attached to a valid price list.';
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be edited.';
  end if;

  if v_product.is_active is not true then
    raise exception 'Archived draft products cannot be edited.';
  end if;

  if coalesce(p_delivery_weeks_min, v_product.delivery_weeks_min) is not null
     and coalesce(p_delivery_weeks_max, v_product.delivery_weeks_max) is not null
     and coalesce(p_delivery_weeks_min, v_product.delivery_weeks_min)
       > coalesce(p_delivery_weeks_max, v_product.delivery_weeks_max) then
    raise exception 'Delivery weeks min cannot be greater than delivery weeks max.';
  end if;

  v_before_data := jsonb_build_object(
    'id', v_product.id,
    'price_list_id', v_product.price_list_id,
    'section_id', v_product.section_id,
    'matrix_key', v_product.matrix_key,
    'name', v_product.name,
    'sort_order', v_product.sort_order,
    'cloth_required', v_product.cloth_required,
    'cmt_price', v_product.cmt_price,
    'delivery_weeks_min', v_product.delivery_weeks_min,
    'delivery_weeks_max', v_product.delivery_weeks_max,
    'notes', v_product.notes,
    'is_active', v_product.is_active
  );

  update public.price_products pp
  set
    name = coalesce(v_name, pp.name),
    cloth_required = coalesce(v_cloth_required, pp.cloth_required),
    cmt_price = coalesce(p_cmt_price, pp.cmt_price),
    delivery_weeks_min = coalesce(p_delivery_weeks_min, pp.delivery_weeks_min),
    delivery_weeks_max = coalesce(p_delivery_weeks_max, pp.delivery_weeks_max),
    notes = coalesce(v_notes, pp.notes)
  where pp.id = p_product_id
  returning *
  into v_updated;

  v_after_data := jsonb_build_object(
    'id', v_updated.id,
    'price_list_id', v_updated.price_list_id,
    'section_id', v_updated.section_id,
    'matrix_key', v_updated.matrix_key,
    'name', v_updated.name,
    'sort_order', v_updated.sort_order,
    'cloth_required', v_updated.cloth_required,
    'cmt_price', v_updated.cmt_price,
    'delivery_weeks_min', v_updated.delivery_weeks_min,
    'delivery_weeks_max', v_updated.delivery_weeks_max,
    'notes', v_updated.notes,
    'is_active', v_updated.is_active
  );

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
    v_updated.price_list_id,
    'product',
    v_updated.id,
    'product_updated',
    v_uid,
    v_before_data,
    v_after_data,
    v_reason
  );

  return query
  select
    v_updated.id,
    v_updated.price_list_id,
    v_updated.section_id,
    v_updated.matrix_key,
    v_updated.name,
    v_updated.cloth_required,
    v_updated.cmt_price,
    v_updated.delivery_weeks_min,
    v_updated.delivery_weeks_max,
    v_updated.notes,
    v_updated.updated_at;
end;
$function$;

create or replace function public.create_price_product_admin(
  p_price_list_id uuid,
  p_section_id uuid,
  p_matrix_key text,
  p_name text,
  p_cloth_required text default null,
  p_cmt_price numeric default null,
  p_delivery_weeks_min integer default null,
  p_delivery_weeks_max integer default null,
  p_notes text default null,
  p_sort_order integer default null,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  section_id uuid,
  matrix_key text,
  name text,
  sort_order integer,
  cloth_required text,
  cmt_price numeric,
  delivery_weeks_min integer,
  delivery_weeks_max integer,
  notes text,
  is_active boolean,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_price_list public.price_lists%rowtype;
  v_section public.price_sections%rowtype;
  v_created public.price_products%rowtype;
  v_matrix_key text := nullif(trim(coalesce(p_matrix_key, '')), '');
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_cloth_required text := nullif(trim(coalesce(p_cloth_required, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_sort_order integer;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_price_list_id is null then
    raise exception 'Price list id is required.';
  end if;

  if p_section_id is null then
    raise exception 'Section id is required.';
  end if;

  if v_matrix_key is null then
    raise exception 'Product key is required.';
  end if;

  if v_name is null then
    raise exception 'Product name is required.';
  end if;

  if p_cmt_price is not null and p_cmt_price < 0 then
    raise exception 'CMT price must be null or greater than or equal to 0.';
  end if;

  if p_delivery_weeks_min is not null and p_delivery_weeks_min < 0 then
    raise exception 'Delivery weeks min must be null or greater than or equal to 0.';
  end if;

  if p_delivery_weeks_max is not null and p_delivery_weeks_max < 0 then
    raise exception 'Delivery weeks max must be null or greater than or equal to 0.';
  end if;

  if p_delivery_weeks_min is not null
     and p_delivery_weeks_max is not null
     and p_delivery_weeks_min > p_delivery_weeks_max then
    raise exception 'Delivery weeks min cannot be greater than delivery weeks max.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = p_price_list_id
  limit 1;

  if not found then
    raise exception 'HUB price list % does not exist.', p_price_list_id;
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be changed structurally.';
  end if;

  select *
  into v_section
  from public.price_sections s
  where s.id = p_section_id
    and s.price_list_id = p_price_list_id
  limit 1;

  if not found then
    raise exception 'That section is not attached to the selected draft price list.';
  end if;

  if exists (
    select 1
    from public.price_products p
    where p.price_list_id = p_price_list_id
      and p.matrix_key = v_matrix_key
  ) then
    raise exception 'That product key already exists on this draft. Restore the archived product instead if needed.';
  end if;

  if exists (
    select 1
    from public.price_products p
    where p.section_id = p_section_id
      and lower(p.name) = lower(v_name)
  ) then
    raise exception 'That product name already exists in this section. Restore the archived product instead if needed.';
  end if;

  v_sort_order := coalesce(
    p_sort_order,
    (
      select coalesce(max(p.sort_order), 0) + 10
      from public.price_products p
      where p.section_id = p_section_id
    )
  );

  insert into public.price_products (
    price_list_id,
    section_id,
    matrix_key,
    name,
    sort_order,
    cloth_required,
    cmt_price,
    delivery_weeks_min,
    delivery_weeks_max,
    notes,
    is_active
  )
  values (
    p_price_list_id,
    p_section_id,
    v_matrix_key,
    v_name,
    v_sort_order,
    v_cloth_required,
    p_cmt_price,
    p_delivery_weeks_min,
    p_delivery_weeks_max,
    v_notes,
    true
  )
  returning *
  into v_created;

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
    v_created.price_list_id,
    'product',
    v_created.id,
    'product_created',
    v_uid,
    null,
    jsonb_build_object(
      'id', v_created.id,
      'price_list_id', v_created.price_list_id,
      'section_id', v_created.section_id,
      'matrix_key', v_created.matrix_key,
      'name', v_created.name,
      'sort_order', v_created.sort_order,
      'cloth_required', v_created.cloth_required,
      'cmt_price', v_created.cmt_price,
      'delivery_weeks_min', v_created.delivery_weeks_min,
      'delivery_weeks_max', v_created.delivery_weeks_max,
      'notes', v_created.notes,
      'is_active', v_created.is_active
    ),
    v_reason
  );

  return query
  select
    v_created.id,
    v_created.price_list_id,
    v_created.section_id,
    v_created.matrix_key,
    v_created.name,
    v_created.sort_order,
    v_created.cloth_required,
    v_created.cmt_price,
    v_created.delivery_weeks_min,
    v_created.delivery_weeks_max,
    v_created.notes,
    v_created.is_active,
    v_created.updated_at;
end;
$function$;

create or replace function public.set_price_product_active_admin(
  p_product_id uuid,
  p_is_active boolean,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  section_id uuid,
  matrix_key text,
  name text,
  sort_order integer,
  is_active boolean,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_product public.price_products%rowtype;
  v_updated public.price_products%rowtype;
  v_price_list public.price_lists%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before_data jsonb;
  v_after_data jsonb;
  v_action text;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_product_id is null then
    raise exception 'Product id is required.';
  end if;

  select *
  into v_product
  from public.price_products p
  where p.id = p_product_id
  limit 1;

  if not found then
    raise exception 'That price product could not be found.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = v_product.price_list_id
  limit 1;

  if not found then
    raise exception 'That product is not attached to a valid price list.';
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be changed structurally.';
  end if;

  if v_product.is_active = p_is_active then
    raise exception 'That product is already in the requested visibility state.';
  end if;

  v_before_data := jsonb_build_object(
    'id', v_product.id,
    'price_list_id', v_product.price_list_id,
    'section_id', v_product.section_id,
    'matrix_key', v_product.matrix_key,
    'name', v_product.name,
    'sort_order', v_product.sort_order,
    'cloth_required', v_product.cloth_required,
    'cmt_price', v_product.cmt_price,
    'delivery_weeks_min', v_product.delivery_weeks_min,
    'delivery_weeks_max', v_product.delivery_weeks_max,
    'notes', v_product.notes,
    'is_active', v_product.is_active
  );

  update public.price_products p
  set is_active = p_is_active
  where p.id = p_product_id
  returning *
  into v_updated;

  v_after_data := jsonb_build_object(
    'id', v_updated.id,
    'price_list_id', v_updated.price_list_id,
    'section_id', v_updated.section_id,
    'matrix_key', v_updated.matrix_key,
    'name', v_updated.name,
    'sort_order', v_updated.sort_order,
    'cloth_required', v_updated.cloth_required,
    'cmt_price', v_updated.cmt_price,
    'delivery_weeks_min', v_updated.delivery_weeks_min,
    'delivery_weeks_max', v_updated.delivery_weeks_max,
    'notes', v_updated.notes,
    'is_active', v_updated.is_active
  );

  v_action := case when p_is_active then 'product_restored' else 'product_archived' end;

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
    v_updated.price_list_id,
    'product',
    v_updated.id,
    v_action,
    v_uid,
    v_before_data,
    v_after_data,
    v_reason
  );

  return query
  select
    v_updated.id,
    v_updated.price_list_id,
    v_updated.section_id,
    v_updated.matrix_key,
    v_updated.name,
    v_updated.sort_order,
    v_updated.is_active,
    v_updated.updated_at;
end;
$function$;

create or replace function public.create_price_matrix_column_admin(
  p_price_list_id uuid,
  p_matrix_key text,
  p_supplier text,
  p_range text,
  p_width text default null,
  p_weight text default null,
  p_supplier_sort_order integer default null,
  p_sort_order integer default null,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  matrix_key text,
  supplier text,
  range text,
  width text,
  weight text,
  supplier_sort_order integer,
  sort_order integer,
  external_weaver_id integer,
  external_range_id integer,
  is_active boolean,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_price_list public.price_lists%rowtype;
  v_created public.price_matrix_columns%rowtype;
  v_matrix_key text := nullif(trim(coalesce(p_matrix_key, '')), '');
  v_supplier text := nullif(trim(coalesce(p_supplier, '')), '');
  v_range text := nullif(trim(coalesce(p_range, '')), '');
  v_width text := nullif(trim(coalesce(p_width, '')), '');
  v_weight text := nullif(trim(coalesce(p_weight, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_supplier_sort_order integer;
  v_sort_order integer;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_price_list_id is null then
    raise exception 'Price list id is required.';
  end if;

  if v_matrix_key is null then
    raise exception 'Column key is required.';
  end if;

  if v_supplier is null then
    raise exception 'Supplier is required.';
  end if;

  if v_range is null then
    raise exception 'Range is required.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = p_price_list_id
  limit 1;

  if not found then
    raise exception 'HUB price list % does not exist.', p_price_list_id;
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be changed structurally.';
  end if;

  if exists (
    select 1
    from public.price_matrix_columns c
    where c.price_list_id = p_price_list_id
      and c.matrix_key = v_matrix_key
  ) then
    raise exception 'That column key already exists on this draft. Restore the archived column instead if needed.';
  end if;

  if p_supplier_sort_order is not null then
    v_supplier_sort_order := p_supplier_sort_order;
  else
    select min(c.supplier_sort_order)
    into v_supplier_sort_order
    from public.price_matrix_columns c
    where c.price_list_id = p_price_list_id
      and lower(c.supplier) = lower(v_supplier);

    if v_supplier_sort_order is null then
      select coalesce(max(c.supplier_sort_order), 0) + 10
      into v_supplier_sort_order
      from public.price_matrix_columns c
      where c.price_list_id = p_price_list_id;
    end if;
  end if;

  if p_sort_order is not null then
    v_sort_order := p_sort_order;
  else
    select coalesce(max(c.sort_order), 0) + 10
    into v_sort_order
    from public.price_matrix_columns c
    where c.price_list_id = p_price_list_id
      and lower(c.supplier) = lower(v_supplier);

    if v_sort_order is null then
      v_sort_order := 10;
    end if;
  end if;

  insert into public.price_matrix_columns (
    price_list_id,
    matrix_key,
    supplier,
    range,
    width,
    weight,
    supplier_sort_order,
    sort_order,
    is_active
  )
  values (
    p_price_list_id,
    v_matrix_key,
    v_supplier,
    v_range,
    v_width,
    v_weight,
    v_supplier_sort_order,
    v_sort_order,
    true
  )
  returning *
  into v_created;

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
    v_created.price_list_id,
    'column',
    v_created.id,
    'column_created',
    v_uid,
    null,
    jsonb_build_object(
      'id', v_created.id,
      'price_list_id', v_created.price_list_id,
      'matrix_key', v_created.matrix_key,
      'supplier', v_created.supplier,
      'range', v_created.range,
      'width', v_created.width,
      'weight', v_created.weight,
      'supplier_sort_order', v_created.supplier_sort_order,
      'sort_order', v_created.sort_order,
      'external_weaver_id', v_created.external_weaver_id,
      'external_range_id', v_created.external_range_id,
      'is_active', v_created.is_active
    ),
    v_reason
  );

  return query
  select
    v_created.id,
    v_created.price_list_id,
    v_created.matrix_key,
    v_created.supplier,
    v_created.range,
    v_created.width,
    v_created.weight,
    v_created.supplier_sort_order,
    v_created.sort_order,
    v_created.external_weaver_id,
    v_created.external_range_id,
    v_created.is_active,
    v_created.updated_at;
end;
$function$;

create or replace function public.set_price_matrix_column_active_admin(
  p_column_id uuid,
  p_is_active boolean,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  matrix_key text,
  supplier text,
  range text,
  supplier_sort_order integer,
  sort_order integer,
  is_active boolean,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_column public.price_matrix_columns%rowtype;
  v_updated public.price_matrix_columns%rowtype;
  v_price_list public.price_lists%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before_data jsonb;
  v_after_data jsonb;
  v_action text;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_column_id is null then
    raise exception 'Column id is required.';
  end if;

  select *
  into v_column
  from public.price_matrix_columns c
  where c.id = p_column_id
  limit 1;

  if not found then
    raise exception 'That price column could not be found.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = v_column.price_list_id
  limit 1;

  if not found then
    raise exception 'That column is not attached to a valid price list.';
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be changed structurally.';
  end if;

  if v_column.is_active = p_is_active then
    raise exception 'That column is already in the requested visibility state.';
  end if;

  v_before_data := jsonb_build_object(
    'id', v_column.id,
    'price_list_id', v_column.price_list_id,
    'matrix_key', v_column.matrix_key,
    'supplier', v_column.supplier,
    'range', v_column.range,
    'width', v_column.width,
    'weight', v_column.weight,
    'supplier_sort_order', v_column.supplier_sort_order,
    'sort_order', v_column.sort_order,
    'external_weaver_id', v_column.external_weaver_id,
    'external_range_id', v_column.external_range_id,
    'is_active', v_column.is_active
  );

  update public.price_matrix_columns c
  set is_active = p_is_active
  where c.id = p_column_id
  returning *
  into v_updated;

  v_after_data := jsonb_build_object(
    'id', v_updated.id,
    'price_list_id', v_updated.price_list_id,
    'matrix_key', v_updated.matrix_key,
    'supplier', v_updated.supplier,
    'range', v_updated.range,
    'width', v_updated.width,
    'weight', v_updated.weight,
    'supplier_sort_order', v_updated.supplier_sort_order,
    'sort_order', v_updated.sort_order,
    'external_weaver_id', v_updated.external_weaver_id,
    'external_range_id', v_updated.external_range_id,
    'is_active', v_updated.is_active
  );

  v_action := case when p_is_active then 'column_restored' else 'column_archived' end;

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
    v_updated.price_list_id,
    'column',
    v_updated.id,
    v_action,
    v_uid,
    v_before_data,
    v_after_data,
    v_reason
  );

  return query
  select
    v_updated.id,
    v_updated.price_list_id,
    v_updated.matrix_key,
    v_updated.supplier,
    v_updated.range,
    v_updated.supplier_sort_order,
    v_updated.sort_order,
    v_updated.is_active,
    v_updated.updated_at;
end;
$function$;

create or replace function public.upsert_price_cell_admin(
  p_price_list_id uuid,
  p_product_id uuid,
  p_column_id uuid,
  p_retail_price numeric,
  p_reason text default null
)
returns table(
  id uuid,
  price_list_id uuid,
  product_id uuid,
  column_id uuid,
  retail_price numeric,
  created boolean,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_product public.price_products%rowtype;
  v_column public.price_matrix_columns%rowtype;
  v_price_list public.price_lists%rowtype;
  v_existing public.price_cells%rowtype;
  v_updated public.price_cells%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before_data jsonb;
  v_after_data jsonb;
  v_created boolean := false;
  v_column_public_id text;
begin
  perform public.ensure_price_lists_admin_write_access();

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_price_list_id is null then
    raise exception 'Price list id is required.';
  end if;

  if p_product_id is null then
    raise exception 'Product id is required.';
  end if;

  if p_column_id is null then
    raise exception 'Column id is required.';
  end if;

  if p_retail_price is null then
    raise exception 'Retail price is required.';
  end if;

  if p_retail_price < 0 then
    raise exception 'Retail price must be greater than or equal to 0.';
  end if;

  select *
  into v_price_list
  from public.price_lists pl
  where pl.id = p_price_list_id
  limit 1;

  if not found then
    raise exception 'HUB price list % does not exist.', p_price_list_id;
  end if;

  if v_price_list.status <> 'draft' or v_price_list.is_active = true then
    raise exception 'Only draft price lists can be edited.';
  end if;

  select *
  into v_product
  from public.price_products p
  where p.id = p_product_id
    and p.price_list_id = p_price_list_id
  limit 1;

  if not found then
    raise exception 'That product is not attached to the selected draft price list.';
  end if;

  if v_product.is_active is not true then
    raise exception 'Archived draft products cannot be priced.';
  end if;

  select *
  into v_column
  from public.price_matrix_columns c
  where c.id = p_column_id
    and c.price_list_id = p_price_list_id
  limit 1;

  if not found then
    raise exception 'That column is not attached to the selected draft price list.';
  end if;

  if v_column.is_active is not true then
    raise exception 'Archived draft columns cannot be priced.';
  end if;

  v_column_public_id := coalesce(v_column.matrix_key, v_column.id::text);

  select *
  into v_existing
  from public.price_cells pc
  where pc.product_id = p_product_id
    and pc.column_id = p_column_id
  limit 1;

  if found then
    v_before_data := jsonb_build_object(
      'id', v_existing.id,
      'price_list_id', p_price_list_id,
      'product_id', v_existing.product_id,
      'column_id', v_existing.column_id,
      'retail_price', v_existing.retail_price,
      'product_matrix_key', v_product.matrix_key,
      'product_name', v_product.name,
      'column_matrix_key', v_column_public_id,
      'column_supplier', v_column.supplier,
      'column_range', v_column.range
    );

    update public.price_cells pc
    set retail_price = p_retail_price
    where pc.id = v_existing.id
    returning *
    into v_updated;
  else
    v_created := true;

    insert into public.price_cells (
      product_id,
      column_id,
      retail_price
    )
    values (
      p_product_id,
      p_column_id,
      p_retail_price
    )
    returning *
    into v_updated;
  end if;

  v_after_data := jsonb_build_object(
    'id', v_updated.id,
    'price_list_id', p_price_list_id,
    'product_id', v_updated.product_id,
    'column_id', v_updated.column_id,
    'retail_price', v_updated.retail_price,
    'product_matrix_key', v_product.matrix_key,
    'product_name', v_product.name,
    'column_matrix_key', v_column_public_id,
    'column_supplier', v_column.supplier,
    'column_range', v_column.range
  );

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
    p_price_list_id,
    'cell',
    v_updated.id,
    case when v_created then 'cell_created' else 'cell_updated' end,
    v_uid,
    v_before_data,
    v_after_data,
    v_reason
  );

  return query
  select
    v_updated.id,
    p_price_list_id,
    v_updated.product_id,
    v_updated.column_id,
    v_updated.retail_price,
    v_created,
    v_updated.updated_at;
end;
$function$;

grant execute on function public.create_price_product_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  numeric,
  integer,
  integer,
  text,
  integer,
  text
) to authenticated;

grant execute on function public.set_price_product_active_admin(
  uuid,
  boolean,
  text
) to authenticated;

grant execute on function public.create_price_matrix_column_admin(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text
) to authenticated;

grant execute on function public.set_price_matrix_column_active_admin(
  uuid,
  boolean,
  text
) to authenticated;

grant execute on function public.upsert_price_cell_admin(
  uuid,
  uuid,
  uuid,
  numeric,
  text
) to authenticated;

comment on function public.create_price_product_admin(uuid, uuid, text, text, text, numeric, integer, integer, text, integer, text) is
  'Admin-only helper that creates an active product row on a draft HUB price list without fabricating blank price cells.';

comment on function public.set_price_product_active_admin(uuid, boolean, text) is
  'Admin-only helper that archives or restores a draft HUB price product row without deleting audit history or cells.';

comment on function public.create_price_matrix_column_admin(uuid, text, text, text, text, text, integer, integer, text) is
  'Admin-only helper that creates an active draft HUB price matrix column without external mapping or blank price cells.';

comment on function public.set_price_matrix_column_active_admin(uuid, boolean, text) is
  'Admin-only helper that archives or restores a draft HUB price matrix column without deleting bridge rows or price cells.';

comment on function public.upsert_price_cell_admin(uuid, uuid, uuid, numeric, text) is
  'Admin-only helper that inserts a missing draft HUB price cell on first pricing or updates an existing one.';

commit;
