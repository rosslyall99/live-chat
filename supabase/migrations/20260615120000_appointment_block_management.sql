begin;

alter table public.appointment_blocks
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists updated_by_user_id uuid references auth.users(id) on delete restrict;

create or replace function public.staff_can_manage_appointment_branch(p_branch public.branch_code)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_site_id text;
begin
  if v_uid is null then
    return false;
  end if;

  select sp.role, sp.site_id
  into v_role, v_site_id
  from public.staff_profiles sp
  where sp.user_id = v_uid
    and sp.is_active = true;

  if v_role = 'admin' then
    return true;
  end if;

  if v_role = 'manager' then
    return public.site_to_appointment_branch(v_site_id) = p_branch;
  end if;

  return false;
end;
$function$;

create table if not exists public.appointment_block_audit_log (
  id uuid primary key default gen_random_uuid(),
  block_id uuid,
  action text not null check (action in ('created', 'updated', 'cancelled')),
  changed_by_user_id uuid not null references auth.users(id) on delete restrict,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_appointment_block_audit_log_block_created_at
  on public.appointment_block_audit_log (block_id, created_at desc);

alter table public.appointment_block_audit_log enable row level security;

drop function if exists public.get_blocks_day_agent(public.branch_code, date);

create or replace function public.get_blocks_day_agent(
  p_branch public.branch_code,
  p_day date
)
returns table(
  id uuid,
  branch public.branch_code,
  area_id uuid,
  staff_user_id uuid,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  reason text,
  created_at timestamp with time zone,
  created_by_user_id uuid,
  created_by_name text,
  updated_at timestamp with time zone,
  updated_by_user_id uuid,
  updated_by_name text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if not public.staff_can_access_appointment_branch(p_branch) then
    raise exception 'Not authorised';
  end if;

  return query
  select
    b.id,
    b.branch,
    b.area_id,
    b.staff_user_id,
    b.start_at,
    b.end_at,
    b.reason,
    b.created_at,
    b.created_by_user_id,
    coalesce(created_by_sp.display_name, created_by_sp.username) as created_by_name,
    b.updated_at,
    b.updated_by_user_id,
    coalesce(updated_by_sp.display_name, updated_by_sp.username) as updated_by_name
  from public.appointment_blocks b
  left join public.staff_profiles created_by_sp
    on created_by_sp.user_id = b.created_by_user_id
  left join public.staff_profiles updated_by_sp
    on updated_by_sp.user_id = b.updated_by_user_id
  where b.branch = p_branch
    and b.start_at >= (p_day::timestamptz)
    and b.start_at < ((p_day + 1)::timestamptz)
  order by b.start_at asc;
end;
$function$;

create or replace function public.create_appointment_block_staff(
  p_site_id text,
  p_area_id uuid default null,
  p_start_at timestamp with time zone default null,
  p_end_at timestamp with time zone default null,
  p_reason text default null
)
returns table(
  id uuid,
  branch public.branch_code,
  area_id uuid,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  reason text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_branch public.branch_code;
  v_area_branch public.branch_code;
  v_reason text;
  v_inserted public.appointment_blocks%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create a block.';
  end if;

  if not public.is_active_staff(v_uid) then
    raise exception 'Your staff profile is inactive or missing.';
  end if;

  v_branch := public.site_to_appointment_branch(p_site_id);
  if v_branch is null then
    raise exception 'Blocks are only available for Duke Street and St Enoch.';
  end if;

  if not public.staff_can_manage_appointment_branch(v_branch) then
    raise exception 'You are not allowed to create blocks for this site.';
  end if;

  if p_start_at is null then
    raise exception 'Block start time is required.';
  end if;

  if p_end_at is null then
    raise exception 'Block end time is required.';
  end if;

  if p_end_at <= p_start_at then
    raise exception 'Block end time must be after the start time.';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if nullif(v_reason, '') is null then
    raise exception 'Block reason is required.';
  end if;

  if p_area_id is not null then
    select aa.branch
    into v_area_branch
    from public.appointment_areas aa
    where aa.id = p_area_id
      and aa.is_active = true;

    if v_area_branch is null then
      raise exception 'The selected appointment area is not available.';
    end if;

    if v_area_branch <> v_branch then
      raise exception 'The selected appointment area does not belong to this site.';
    end if;
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.branch = v_branch
      and a.status <> 'cancelled'
      and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
      and (p_area_id is null or a.area_id = p_area_id)
  ) then
    raise exception 'That block overlaps an existing appointment.';
  end if;

  if exists (
    select 1
    from public.appointment_blocks b
    where b.branch = v_branch
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
      and (
        p_area_id is null or
        b.area_id is null or
        b.area_id = p_area_id
      )
  ) then
    raise exception 'That block overlaps an existing block.';
  end if;

  insert into public.appointment_blocks (
    branch,
    area_id,
    start_at,
    end_at,
    reason,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    v_branch,
    p_area_id,
    p_start_at,
    p_end_at,
    v_reason,
    v_uid,
    v_uid
  )
  returning *
  into v_inserted;

  insert into public.appointment_block_audit_log (
    block_id,
    action,
    changed_by_user_id,
    after_data
  )
  values (
    v_inserted.id,
    'created',
    v_uid,
    to_jsonb(v_inserted)
  );

  return query
  select
    v_inserted.id,
    v_inserted.branch,
    v_inserted.area_id,
    v_inserted.start_at,
    v_inserted.end_at,
    v_inserted.reason;
exception
  when exclusion_violation then
    raise exception 'That block overlaps an existing block.';
end;
$function$;

create or replace function public.update_appointment_block_staff(
  p_block_id uuid,
  p_area_id uuid default null,
  p_start_at timestamp with time zone default null,
  p_end_at timestamp with time zone default null,
  p_reason text default null
)
returns table(
  id uuid,
  branch public.branch_code,
  area_id uuid,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  reason text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.appointment_blocks%rowtype;
  v_updated public.appointment_blocks%rowtype;
  v_area_branch public.branch_code;
  v_reason text;
  v_has_changes boolean;
begin
  if v_uid is null then
    raise exception 'You must be signed in to update a block.';
  end if;

  if not public.is_active_staff(v_uid) then
    raise exception 'Your staff profile is inactive or missing.';
  end if;

  select *
  into v_existing
  from public.appointment_blocks b
  where b.id = p_block_id;

  if not found then
    raise exception 'That block could not be found.';
  end if;

  if not public.staff_can_manage_appointment_branch(v_existing.branch) then
    raise exception 'You are not allowed to edit this block.';
  end if;

  if p_start_at is null then
    raise exception 'Block start time is required.';
  end if;

  if p_end_at is null then
    raise exception 'Block end time is required.';
  end if;

  if p_end_at <= p_start_at then
    raise exception 'Block end time must be after the start time.';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if nullif(v_reason, '') is null then
    raise exception 'Block reason is required.';
  end if;

  if p_area_id is not null then
    select aa.branch
    into v_area_branch
    from public.appointment_areas aa
    where aa.id = p_area_id
      and aa.is_active = true;

    if v_area_branch is null then
      raise exception 'The selected appointment area is not available.';
    end if;

    if v_area_branch <> v_existing.branch then
      raise exception 'The selected appointment area does not belong to this site.';
    end if;
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.branch = v_existing.branch
      and a.status <> 'cancelled'
      and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
      and (p_area_id is null or a.area_id = p_area_id)
  ) then
    raise exception 'That block overlaps an existing appointment.';
  end if;

  if exists (
    select 1
    from public.appointment_blocks b
    where b.id <> p_block_id
      and b.branch = v_existing.branch
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
      and (
        p_area_id is null or
        b.area_id is null or
        b.area_id = p_area_id
      )
  ) then
    raise exception 'That block overlaps an existing block.';
  end if;

  v_has_changes :=
    v_existing.area_id is distinct from p_area_id or
    v_existing.start_at is distinct from p_start_at or
    v_existing.end_at is distinct from p_end_at or
    v_existing.reason is distinct from v_reason;

  if not v_has_changes then
    return query
    select
      v_existing.id,
      v_existing.branch,
      v_existing.area_id,
      v_existing.start_at,
      v_existing.end_at,
      v_existing.reason;
    return;
  end if;

  begin
    update public.appointment_blocks as b
    set
      area_id = p_area_id,
      start_at = p_start_at,
      end_at = p_end_at,
      reason = v_reason,
      updated_at = now(),
      updated_by_user_id = v_uid
    where b.id = p_block_id
    returning *
    into v_updated;
  exception
    when exclusion_violation then
      raise exception 'That block overlaps an existing block.';
  end;

  if not found then
    raise exception 'That block could not be updated.';
  end if;

  insert into public.appointment_block_audit_log (
    block_id,
    action,
    changed_by_user_id,
    before_data,
    after_data
  )
  values (
    v_updated.id,
    'updated',
    v_uid,
    to_jsonb(v_existing),
    to_jsonb(v_updated)
  );

  return query
  select
    v_updated.id,
    v_updated.branch,
    v_updated.area_id,
    v_updated.start_at,
    v_updated.end_at,
    v_updated.reason;
end;
$function$;

create or replace function public.cancel_appointment_block_staff(
  p_block_id uuid
)
returns table(
  id uuid
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.appointment_blocks%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in to cancel a block.';
  end if;

  if not public.is_active_staff(v_uid) then
    raise exception 'Your staff profile is inactive or missing.';
  end if;

  select *
  into v_existing
  from public.appointment_blocks b
  where b.id = p_block_id;

  if not found then
    raise exception 'That block could not be found.';
  end if;

  if not public.staff_can_manage_appointment_branch(v_existing.branch) then
    raise exception 'You are not allowed to cancel this block.';
  end if;

  insert into public.appointment_block_audit_log (
    block_id,
    action,
    changed_by_user_id,
    before_data
  )
  values (
    v_existing.id,
    'cancelled',
    v_uid,
    to_jsonb(v_existing)
  );

  delete from public.appointment_blocks
  where id = p_block_id;

  return query
  select v_existing.id;
end;
$function$;

create or replace function public.get_appointment_block_audit_staff(
  p_block_id uuid
)
returns table(
  id uuid,
  action text,
  changed_by_user_id uuid,
  changed_by_name text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_branch public.branch_code;
begin
  select b.branch
  into v_branch
  from public.appointment_blocks b
  where b.id = p_block_id;

  if v_branch is null then
    select coalesce((l.before_data ->> 'branch')::public.branch_code, (l.after_data ->> 'branch')::public.branch_code)
    into v_branch
    from public.appointment_block_audit_log l
    where l.block_id = p_block_id
    order by l.created_at desc
    limit 1;
  end if;

  if v_branch is null then
    raise exception 'That block could not be found.';
  end if;

  if not public.staff_can_access_appointment_branch(v_branch) then
    raise exception 'Not authorised';
  end if;

  return query
  select
    l.id,
    l.action,
    l.changed_by_user_id,
    coalesce(sp.display_name, sp.username) as changed_by_name,
    l.before_data,
    l.after_data,
    l.created_at
  from public.appointment_block_audit_log l
  left join public.staff_profiles sp
    on sp.user_id = l.changed_by_user_id
  where l.block_id = p_block_id
  order by l.created_at desc;
end;
$function$;

grant execute on function public.staff_can_manage_appointment_branch(public.branch_code) to authenticated;
grant execute on function public.get_blocks_day_agent(public.branch_code, date) to authenticated;
grant execute on function public.create_appointment_block_staff(text, uuid, timestamp with time zone, timestamp with time zone, text) to authenticated;
grant execute on function public.update_appointment_block_staff(uuid, uuid, timestamp with time zone, timestamp with time zone, text) to authenticated;
grant execute on function public.cancel_appointment_block_staff(uuid) to authenticated;
grant execute on function public.get_appointment_block_audit_staff(uuid) to authenticated;

commit;
