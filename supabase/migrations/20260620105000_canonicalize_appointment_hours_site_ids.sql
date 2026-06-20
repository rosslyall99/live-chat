begin;

create or replace function public.appointment_canonical_site_id(
  p_site_id text
)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    public.appointment_branch_to_site_id(public.site_to_appointment_branch(p_site_id)),
    lower(trim(coalesce(p_site_id, '')))
  );
$function$;

create or replace function public.default_appointment_opening_hours(
  p_site_id text
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select case public.appointment_canonical_site_id(p_site_id)
    when 'duke' then jsonb_build_object(
      '0', jsonb_build_object('is_closed', true, 'open_time', null, 'close_time', null),
      '1', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '2', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '3', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '4', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '5', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30'),
      '6', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '16:30')
    )
    when 'sten' then jsonb_build_object(
      '0', jsonb_build_object('is_closed', false, 'open_time', '11:00', 'close_time', '16:00'),
      '1', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '2', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '3', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '4', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '5', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30'),
      '6', jsonb_build_object('is_closed', false, 'open_time', '09:30', 'close_time', '17:30')
    )
    else null
  end;
$function$;

create or replace function public.resolve_appointment_opening_hours(
  p_site_id text
)
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  with candidate_site_ids as (
    select nullif(trim(coalesce(p_site_id, '')), '') as site_id, 1 as priority
    union all
    select public.appointment_canonical_site_id(p_site_id), 0
  ),
  resolved_settings as (
    select ss.opening_hours
    from candidate_site_ids c
    join public.site_settings ss on ss.site_id = c.site_id
    where ss.opening_hours is not null
    order by c.priority
    limit 1
  )
  select coalesce(
    (select opening_hours from resolved_settings),
    public.default_appointment_opening_hours(p_site_id)
  );
$function$;

create or replace function public.get_appointment_bookable_window(
  p_site_id text,
  p_day date
)
returns table(
  is_closed boolean,
  open_time time,
  close_time time,
  source text
)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_canonical_site_id text;
  v_hours jsonb;
  v_day_key text;
  v_day_hours jsonb;
  v_has_site_settings boolean;
begin
  v_canonical_site_id := public.appointment_canonical_site_id(p_site_id);
  v_hours := public.resolve_appointment_opening_hours(p_site_id);

  if v_hours is null then
    return query
    select true, null::time, null::time, 'missing';
    return;
  end if;

  v_day_key := extract(dow from p_day)::int::text;
  v_day_hours := v_hours -> v_day_key;

  if v_day_hours is null then
    return query
    select true, null::time, null::time, 'missing_day';
    return;
  end if;

  select exists (
    select 1
    from public.site_settings ss
    where ss.site_id in (p_site_id, v_canonical_site_id)
      and ss.opening_hours is not null
  )
  into v_has_site_settings;

  return query
  select
    coalesce((v_day_hours ->> 'is_closed')::boolean, false),
    nullif(v_day_hours ->> 'open_time', '')::time,
    nullif(v_day_hours ->> 'close_time', '')::time,
    case when v_has_site_settings then 'site_settings' else 'fallback' end;
end;
$function$;

create or replace function public.save_appointment_site_hours_admin(
  p_site_id text,
  p_opening_hours jsonb
)
returns table(
  site_id text,
  opening_hours jsonb
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_site_id text := public.appointment_canonical_site_id(p_site_id);
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can manage appointment hours.';
  end if;

  if public.site_to_appointment_branch(v_site_id) is null then
    raise exception 'This site does not support appointments.';
  end if;

  insert into public.site_settings (site_id, manual_status, opening_hours, updated_at)
  values (v_site_id, 'online', p_opening_hours, now())
  on conflict (site_id) do update
  set
    opening_hours = excluded.opening_hours,
    updated_at = now();

  return query
  select v_site_id, p_opening_hours;
end;
$function$;

create or replace function public.get_appointment_site_hours_admin()
returns table(
  site_id text,
  site_name text,
  opening_hours jsonb,
  source text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can manage appointment hours.';
  end if;

  return query
  select
    s.id,
    s.name,
    public.resolve_appointment_opening_hours(s.id) as opening_hours,
    case
      when exists (
        select 1
        from public.site_settings ss
        where ss.site_id in (s.id, public.appointment_canonical_site_id(s.id))
          and ss.opening_hours is not null
      ) then 'site_settings'
      else 'fallback'
    end as source
  from public.sites s
  where public.site_to_appointment_branch(s.id) is not null
  order by s.name asc;
end;
$function$;

insert into public.site_settings (site_id, manual_status, opening_hours, updated_at)
select seeded.site_id, 'online', public.default_appointment_opening_hours(seeded.site_id), now()
from (values ('duke'), ('sten')) as seeded(site_id)
where exists (
  select 1
  from public.sites s
  where s.id = seeded.site_id
)
on conflict (site_id) do update
set
  opening_hours = coalesce(public.site_settings.opening_hours, excluded.opening_hours),
  updated_at = now();

grant execute on function public.appointment_canonical_site_id(text) to authenticated;
grant execute on function public.appointment_canonical_site_id(text) to service_role;

commit;
