begin;

create table if not exists public.appointment_reminder_runs (
  id uuid primary key default gen_random_uuid(),
  branch public.branch_code not null,
  run_for_date date not null,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone not null default now(),
  triggered_by text not null check (triggered_by in ('manual', 'scheduled')),
  initiated_by_user_id uuid references auth.users(id) on delete set null,
  dry_run boolean not null default false,
  total_found integer not null default 0,
  sent_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  raw_result jsonb
);

create index if not exists idx_appointment_reminder_runs_branch_finished
  on public.appointment_reminder_runs (branch, finished_at desc);

alter table public.appointment_reminder_runs enable row level security;

create or replace function public.get_appointment_reminder_runs_staff(
  p_branch public.branch_code,
  p_limit integer default 5
)
returns table(
  id uuid,
  branch public.branch_code,
  run_for_date date,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  triggered_by text,
  initiated_by_user_id uuid,
  initiated_by_name text,
  dry_run boolean,
  total_found integer,
  sent_count integer,
  skipped_count integer,
  failed_count integer,
  raw_result jsonb
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if p_branch is null then
    raise exception 'Appointment branch is required.';
  end if;

  if not public.staff_can_access_appointment_branch(p_branch) then
    raise exception 'Not authorised';
  end if;

  return query
  select
    r.id,
    r.branch,
    r.run_for_date,
    r.started_at,
    r.finished_at,
    r.triggered_by,
    r.initiated_by_user_id,
    coalesce(sp.display_name, sp.username) as initiated_by_name,
    r.dry_run,
    r.total_found,
    r.sent_count,
    r.skipped_count,
    r.failed_count,
    r.raw_result
  from public.appointment_reminder_runs r
  left join public.staff_profiles sp
    on sp.user_id = r.initiated_by_user_id
  where r.branch = p_branch
  order by r.finished_at desc
  limit greatest(coalesce(p_limit, 5), 1);
end;
$function$;

grant execute on function public.get_appointment_reminder_runs_staff(public.branch_code, integer) to authenticated;

commit;
