begin;

create table if not exists public.appointment_email_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  email_type text not null check (email_type in ('confirmation')),
  recipient_email text not null,
  subject text not null,
  body_text text,
  body_html text,
  sent_by_user_id uuid not null references auth.users(id) on delete restrict,
  sent_at timestamp with time zone not null default now(),
  status text not null check (status in ('sent', 'failed')),
  resend_message_id text,
  error_message text
);

create index if not exists idx_appointment_email_log_appt_sent_at
  on public.appointment_email_log (appointment_id, sent_at desc);

alter table public.appointment_email_log enable row level security;

alter table public.appointment_audit_log
  drop constraint if exists appointment_audit_log_action_check;

alter table public.appointment_audit_log
  add constraint appointment_audit_log_action_check
  check (action in ('created', 'updated', 'cancelled', 'confirmation_sent'));

create or replace function public.get_appointment_email_log_staff(
  p_appointment_id uuid
)
returns table(
  id uuid,
  email_type text,
  recipient_email text,
  subject text,
  sent_by_user_id uuid,
  sent_by_name text,
  sent_at timestamp with time zone,
  status text,
  resend_message_id text,
  error_message text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_branch public.branch_code;
begin
  select a.branch
  into v_branch
  from public.appointments a
  where a.id = p_appointment_id;

  if v_branch is null then
    raise exception 'That appointment could not be found.';
  end if;

  if not public.staff_can_access_appointment_branch(v_branch) then
    raise exception 'Not authorised';
  end if;

  return query
  select
    l.id,
    l.email_type,
    l.recipient_email,
    l.subject,
    l.sent_by_user_id,
    coalesce(sp.display_name, sp.username) as sent_by_name,
    l.sent_at,
    l.status,
    l.resend_message_id,
    l.error_message
  from public.appointment_email_log l
  left join public.staff_profiles sp
    on sp.user_id = l.sent_by_user_id
  where l.appointment_id = p_appointment_id
  order by l.sent_at desc;
end;
$function$;

grant execute on function public.get_appointment_email_log_staff(uuid) to authenticated;

commit;
