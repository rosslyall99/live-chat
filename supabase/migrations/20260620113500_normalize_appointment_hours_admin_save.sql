begin;

create or replace function public.normalize_appointment_opening_hours(
  p_site_id text,
  p_opening_hours jsonb
)
returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_site_id text := public.appointment_canonical_site_id(p_site_id);
  v_fallback jsonb := public.default_appointment_opening_hours(p_site_id);
  v_result jsonb := '{}'::jsonb;
  v_day integer;
  v_key text;
  v_legacy_key text;
  v_raw_day jsonb;
  v_fallback_day jsonb;
  v_is_closed boolean;
  v_open_time text;
  v_close_time text;
  v_open_minutes integer;
  v_close_minutes integer;
begin
  if v_fallback is null then
    raise exception 'This site does not support appointments.';
  end if;

  for v_day in 0..6 loop
    v_key := v_day::text;
    v_legacy_key := case v_day
      when 0 then 'sunday'
      when 1 then 'monday'
      when 2 then 'tuesday'
      when 3 then 'wednesday'
      when 4 then 'thursday'
      when 5 then 'friday'
      when 6 then 'saturday'
    end;

    v_fallback_day := v_fallback -> v_key;
    v_raw_day := null;

    if p_opening_hours ? v_key then
      v_raw_day := p_opening_hours -> v_key;
    elsif p_opening_hours ? v_legacy_key then
      v_raw_day := p_opening_hours -> v_legacy_key;
    end if;

    if v_raw_day is null then
      v_is_closed := coalesce((v_fallback_day ->> 'is_closed')::boolean, true);
      v_open_time := v_fallback_day ->> 'open_time';
      v_close_time := v_fallback_day ->> 'close_time';
    elsif v_raw_day = 'null'::jsonb then
      v_is_closed := true;
      v_open_time := null;
      v_close_time := null;
    elsif jsonb_typeof(v_raw_day) <> 'object' then
      raise exception 'Appointment hours for % must be an object or null.', v_legacy_key;
    else
      v_is_closed := coalesce((v_raw_day ->> 'is_closed')::boolean, false);

      if v_raw_day ? 'open_time' then
        v_open_time := nullif(v_raw_day ->> 'open_time', '');
      elsif v_raw_day ? 'open' then
        v_open_minutes := (v_raw_day ->> 'open')::integer;
        if v_open_minutes < 0 or v_open_minutes >= 24 * 60 then
          raise exception 'Opening time for % is outside the valid day range.', v_legacy_key;
        end if;
        v_open_time :=
          lpad((v_open_minutes / 60)::text, 2, '0') ||
          ':' ||
          lpad((v_open_minutes % 60)::text, 2, '0');
      else
        v_open_time := null;
      end if;

      if v_raw_day ? 'close_time' then
        v_close_time := nullif(v_raw_day ->> 'close_time', '');
      elsif v_raw_day ? 'close' then
        v_close_minutes := (v_raw_day ->> 'close')::integer;
        if v_close_minutes < 0 or v_close_minutes >= 24 * 60 then
          raise exception 'Closing time for % is outside the valid day range.', v_legacy_key;
        end if;
        v_close_time :=
          lpad((v_close_minutes / 60)::text, 2, '0') ||
          ':' ||
          lpad((v_close_minutes % 60)::text, 2, '0');
      else
        v_close_time := null;
      end if;
    end if;

    if v_is_closed then
      v_result := v_result || jsonb_build_object(
        v_key,
        jsonb_build_object(
          'is_closed', true,
          'open_time', null,
          'close_time', null
        )
      );
    else
      if v_open_time is null or v_close_time is null then
        raise exception 'Open and close times are required for %.', v_legacy_key;
      end if;

      perform v_open_time::time;
      perform v_close_time::time;

      if v_close_time::time <= v_open_time::time then
        raise exception 'Closing time must be after opening time for %.', v_legacy_key;
      end if;

      v_result := v_result || jsonb_build_object(
        v_key,
        jsonb_build_object(
          'is_closed', false,
          'open_time', to_char(v_open_time::time, 'HH24:MI'),
          'close_time', to_char(v_close_time::time, 'HH24:MI')
        )
      );
    end if;
  end loop;

  return v_result;
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
  ),
  resolved_hours as (
    select coalesce(
      (select opening_hours from resolved_settings),
      public.default_appointment_opening_hours(p_site_id)
    ) as opening_hours
  )
  select case
    when opening_hours is null then null
    else public.normalize_appointment_opening_hours(p_site_id, opening_hours)
  end
  from resolved_hours;
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
  v_opening_hours jsonb;
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can manage appointment hours.';
  end if;

  if public.site_to_appointment_branch(v_site_id) is null then
    raise exception 'This site does not support appointments.';
  end if;

  v_opening_hours := public.normalize_appointment_opening_hours(
    v_site_id,
    p_opening_hours
  );

  insert into public.site_settings (site_id, manual_status, opening_hours, updated_at)
  values (v_site_id, 'online', v_opening_hours, now())
  on conflict (site_id) do update
  set
    opening_hours = excluded.opening_hours,
    updated_at = now();

  return query
  select v_site_id, v_opening_hours;
end;
$function$;

grant execute on function public.normalize_appointment_opening_hours(text, jsonb) to authenticated;
grant execute on function public.normalize_appointment_opening_hours(text, jsonb) to service_role;

commit;
