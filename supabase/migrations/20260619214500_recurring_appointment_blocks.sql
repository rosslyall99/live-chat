begin;

alter table public.appointment_blocks
  add column if not exists recurrence_group_id uuid,
  add column if not exists recurrence_pattern text
    check (recurrence_pattern is null or recurrence_pattern in ('daily', 'weekly')),
  add column if not exists recurrence_until_date date;

create index if not exists idx_appointment_blocks_recurrence_group
  on public.appointment_blocks (recurrence_group_id);

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
  recurrence_group_id uuid,
  recurrence_pattern text,
  recurrence_until_date date,
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
    b.recurrence_group_id,
    b.recurrence_pattern,
    b.recurrence_until_date,
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

create or replace function public.create_recurring_appointment_blocks_staff(
  p_site_id text,
  p_area_id uuid default null,
  p_start_at timestamp with time zone default null,
  p_end_at timestamp with time zone default null,
  p_reason text default null,
  p_recurrence text default null,
  p_until_date date default null
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
  v_recurrence text := lower(trim(coalesce(p_recurrence, '')));
  v_group_id uuid := gen_random_uuid();
  v_start_local_date date;
  v_end_local_date date;
  v_start_local_time time;
  v_end_local_time time;
  v_current_date date;
  v_day_step integer;
  v_occurrence_start_at timestamp with time zone;
  v_occurrence_end_at timestamp with time zone;
  v_created record;
  v_tagged record;
begin
  if v_recurrence not in ('daily', 'weekly') then
    raise exception 'Recurring blocks must repeat daily or weekly.';
  end if;

  if p_start_at is null then
    raise exception 'Block start time is required.';
  end if;

  if p_end_at is null then
    raise exception 'Block end time is required.';
  end if;

  v_start_local_date := (p_start_at at time zone 'Europe/London')::date;
  v_end_local_date := (p_end_at at time zone 'Europe/London')::date;
  v_start_local_time := (p_start_at at time zone 'Europe/London')::time;
  v_end_local_time := (p_end_at at time zone 'Europe/London')::time;

  if v_end_local_date <> v_start_local_date then
    raise exception 'Recurring blocks must stay within the same branch day.';
  end if;

  if p_until_date is null then
    raise exception 'Choose the last date for this recurring block.';
  end if;

  if p_until_date < v_start_local_date then
    raise exception 'The recurring block end date must be on or after the first block date.';
  end if;

  v_day_step := case when v_recurrence = 'daily' then 1 else 7 end;
  v_current_date := v_start_local_date;

  while v_current_date <= p_until_date loop
    v_occurrence_start_at := make_timestamptz(
      extract(year from v_current_date)::integer,
      extract(month from v_current_date)::integer,
      extract(day from v_current_date)::integer,
      extract(hour from v_start_local_time)::integer,
      extract(minute from v_start_local_time)::integer,
      extract(second from v_start_local_time),
      'Europe/London'
    );

    v_occurrence_end_at := make_timestamptz(
      extract(year from v_current_date)::integer,
      extract(month from v_current_date)::integer,
      extract(day from v_current_date)::integer,
      extract(hour from v_end_local_time)::integer,
      extract(minute from v_end_local_time)::integer,
      extract(second from v_end_local_time),
      'Europe/London'
    );

    begin
      select *
      into v_created
      from public.create_appointment_block_staff(
        p_site_id,
        p_area_id,
        v_occurrence_start_at,
        v_occurrence_end_at,
        p_reason
      );

      if v_created.id is null then
        raise exception 'The recurring block occurrence was not created.';
      end if;

      update public.appointment_blocks b
      set
        recurrence_group_id = v_group_id,
        recurrence_pattern = v_recurrence,
        recurrence_until_date = p_until_date,
        updated_at = now(),
        updated_by_user_id = auth.uid()
      where b.id = v_created.id
      returning
        b.id,
        b.branch,
        b.area_id,
        b.start_at,
        b.end_at,
        b.reason
      into v_tagged;

      if v_tagged.id is null then
        raise exception 'The recurring block occurrence could not be tagged.';
      end if;

      return query
      select
        v_tagged.id,
        v_tagged.branch,
        v_tagged.area_id,
        v_tagged.start_at,
        v_tagged.end_at,
        v_tagged.reason;
    exception
      when others then
        raise exception
          'Recurring block failed on %: %',
          to_char(v_current_date, 'Dy DD Mon YYYY'),
          SQLERRM;
    end;

    v_current_date := v_current_date + v_day_step;
  end loop;
end;
$function$;

create or replace function public.cancel_recurring_appointment_block_series_staff(
  p_block_id uuid
)
returns table(
  deleted_count integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.appointment_blocks%rowtype;
  v_deleted_count integer := 0;
begin
  if v_uid is null then
    raise exception 'You must be signed in to cancel a recurring block series.';
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

  if v_existing.recurrence_group_id is null then
    raise exception 'This block is not part of a recurring series.';
  end if;

  if not public.staff_can_manage_appointment_branch(v_existing.branch) then
    raise exception 'You are not allowed to cancel this recurring block series.';
  end if;

  insert into public.appointment_block_audit_log (
    block_id,
    action,
    changed_by_user_id,
    before_data
  )
  select
    b.id,
    'cancelled',
    v_uid,
    to_jsonb(b)
  from public.appointment_blocks b
  where b.recurrence_group_id = v_existing.recurrence_group_id;

  delete from public.appointment_blocks b
  where b.recurrence_group_id = v_existing.recurrence_group_id;

  get diagnostics v_deleted_count = row_count;

  return query
  select v_deleted_count;
end;
$function$;

grant execute on function public.create_recurring_appointment_blocks_staff(
  text,
  uuid,
  timestamp with time zone,
  timestamp with time zone,
  text,
  text,
  date
) to authenticated;
grant execute on function public.cancel_recurring_appointment_block_series_staff(uuid) to authenticated;
grant execute on function public.get_blocks_day_agent(public.branch_code, date) to authenticated;

commit;
