begin;

alter table public.appointments
  add column if not exists feedback_email_sent_at timestamptz,
  add column if not exists feedback_email_last_error text,
  add column if not exists feedback_email_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_feedback_email_status_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_feedback_email_status_check
      check (
        feedback_email_status is null
        or feedback_email_status in ('pending', 'sent', 'failed')
      );
  end if;
end $$;

create index if not exists idx_appointments_feedback_email_due
  on public.appointments (feedback_email_sent_at, end_at)
  where feedback_email_sent_at is null;

alter table public.appointment_email_log
  drop constraint if exists appointment_email_log_email_type_check;

alter table public.appointment_email_log
  add constraint appointment_email_log_email_type_check
  check (email_type in ('confirmation', 'reminder', 'feedback'));

alter table public.appointment_audit_log
  drop constraint if exists appointment_audit_log_action_check;

alter table public.appointment_audit_log
  add constraint appointment_audit_log_action_check
  check (action in ('created', 'updated', 'cancelled', 'confirmation_sent', 'reminder_sent', 'feedback_sent'));

alter table public.appointment_email_templates
  drop constraint if exists appointment_email_templates_template_type_check;

alter table public.appointment_email_templates
  add constraint appointment_email_templates_template_type_check
  check (template_type in ('confirmation', 'reminder', 'feedback'));

insert into public.appointment_email_templates (
  name,
  template_type,
  appointment_type_id,
  subject,
  body_text,
  body_html,
  is_active
)
select
  'Default feedback',
  'feedback',
  null,
  'How did your appointment go?',
  E'Hi {{customer_name}},\n\nThank you for visiting Slanj for your appointment today.\n\nWe hope everything went as expected. If there is anything about the appointment process that could have been clearer, smoother, or more helpful, we would really appreciate your feedback.\n\nThis is just to help us improve how we manage appointments and look after customers.\n\nThanks,\nSlanj',
  null,
  true
where not exists (
  select 1
  from public.appointment_email_templates t
  where t.template_type = 'feedback'
    and t.appointment_type_id is null
);

create or replace function public.create_appointment_email_template_staff(
  p_name text,
  p_template_type text,
  p_appointment_type_id uuid default null,
  p_subject text default null,
  p_body_text text default null,
  p_body_html text default null
)
returns table(
  id uuid,
  name text,
  template_type text,
  appointment_type_id uuid,
  appointment_type_name text,
  subject text,
  body_text text,
  body_html text,
  is_active boolean,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_template_type text := trim(coalesce(p_template_type, ''));
  v_subject text := trim(coalesce(p_subject, ''));
  v_body_text text := trim(coalesce(p_body_text, ''));
  v_body_html text := nullif(trim(coalesce(p_body_html, '')), '');
  v_inserted public.appointment_email_templates%rowtype;
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can create appointment email templates.';
  end if;

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(v_name, '') is null then
    raise exception 'Template name is required.';
  end if;

  if v_template_type not in ('confirmation', 'reminder', 'feedback') then
    raise exception 'Template type must be confirmation, reminder, or feedback.';
  end if;

  if nullif(v_subject, '') is null then
    raise exception 'Template subject is required.';
  end if;

  if nullif(v_body_text, '') is null then
    raise exception 'Template body text is required.';
  end if;

  if p_appointment_type_id is not null and not exists (
    select 1
    from public.appointment_types at
    where at.id = p_appointment_type_id
  ) then
    raise exception 'The selected appointment type could not be found.';
  end if;

  insert into public.appointment_email_templates (
    name,
    template_type,
    appointment_type_id,
    subject,
    body_text,
    body_html,
    is_active,
    created_by,
    updated_by
  )
  values (
    v_name,
    v_template_type,
    p_appointment_type_id,
    v_subject,
    v_body_text,
    v_body_html,
    true,
    v_uid,
    v_uid
  )
  returning *
  into v_inserted;

  return query
  select
    v_inserted.id,
    v_inserted.name,
    v_inserted.template_type,
    v_inserted.appointment_type_id,
    at.name,
    v_inserted.subject,
    v_inserted.body_text,
    v_inserted.body_html,
    v_inserted.is_active,
    v_inserted.created_by,
    v_inserted.updated_by,
    v_inserted.created_at,
    v_inserted.updated_at
  from public.appointment_types at
  where at.id = v_inserted.appointment_type_id
  union all
  select
    v_inserted.id,
    v_inserted.name,
    v_inserted.template_type,
    v_inserted.appointment_type_id,
    null::text,
    v_inserted.subject,
    v_inserted.body_text,
    v_inserted.body_html,
    v_inserted.is_active,
    v_inserted.created_by,
    v_inserted.updated_by,
    v_inserted.created_at,
    v_inserted.updated_at
  where v_inserted.appointment_type_id is null;
end;
$function$;

create or replace function public.update_appointment_email_template_staff(
  p_template_id uuid,
  p_name text,
  p_template_type text,
  p_appointment_type_id uuid default null,
  p_subject text default null,
  p_body_text text default null,
  p_body_html text default null,
  p_is_active boolean default true
)
returns table(
  id uuid,
  name text,
  template_type text,
  appointment_type_id uuid,
  appointment_type_name text,
  subject text,
  body_text text,
  body_html text,
  is_active boolean,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_template_type text := trim(coalesce(p_template_type, ''));
  v_subject text := trim(coalesce(p_subject, ''));
  v_body_text text := trim(coalesce(p_body_text, ''));
  v_body_html text := nullif(trim(coalesce(p_body_html, '')), '');
  v_updated public.appointment_email_templates%rowtype;
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can update appointment email templates.';
  end if;

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  if p_template_id is null then
    raise exception 'Template id is required.';
  end if;

  if nullif(v_name, '') is null then
    raise exception 'Template name is required.';
  end if;

  if v_template_type not in ('confirmation', 'reminder', 'feedback') then
    raise exception 'Template type must be confirmation, reminder, or feedback.';
  end if;

  if nullif(v_subject, '') is null then
    raise exception 'Template subject is required.';
  end if;

  if nullif(v_body_text, '') is null then
    raise exception 'Template body text is required.';
  end if;

  if p_appointment_type_id is not null and not exists (
    select 1
    from public.appointment_types at
    where at.id = p_appointment_type_id
  ) then
    raise exception 'The selected appointment type could not be found.';
  end if;

  update public.appointment_email_templates t
  set
    name = v_name,
    template_type = v_template_type,
    appointment_type_id = p_appointment_type_id,
    subject = v_subject,
    body_text = v_body_text,
    body_html = v_body_html,
    is_active = coalesce(p_is_active, true),
    updated_by = v_uid
  where t.id = p_template_id
  returning *
  into v_updated;

  if not found then
    raise exception 'That appointment email template could not be found.';
  end if;

  return query
  select
    v_updated.id,
    v_updated.name,
    v_updated.template_type,
    v_updated.appointment_type_id,
    at.name,
    v_updated.subject,
    v_updated.body_text,
    v_updated.body_html,
    v_updated.is_active,
    v_updated.created_by,
    v_updated.updated_by,
    v_updated.created_at,
    v_updated.updated_at
  from public.appointment_types at
  where at.id = v_updated.appointment_type_id
  union all
  select
    v_updated.id,
    v_updated.name,
    v_updated.template_type,
    v_updated.appointment_type_id,
    null::text,
    v_updated.subject,
    v_updated.body_text,
    v_updated.body_html,
    v_updated.is_active,
    v_updated.created_by,
    v_updated.updated_by,
    v_updated.created_at,
    v_updated.updated_at
  where v_updated.appointment_type_id is null;
end;
$function$;

drop function if exists public.get_calendar_day_agent(public.branch_code, date);

create or replace function public.get_calendar_day_agent(
  p_branch public.branch_code,
  p_day date
)
returns table(
  id uuid,
  branch public.branch_code,
  area_id uuid,
  appointment_type_id uuid,
  appointment_type_name text,
  appointment_type_code text,
  appointment_type_color text,
  appointment_type_text_color text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status public.appointment_status,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_id uuid,
  internal_notes text,
  attendance_status text,
  attendance_recorded_at timestamp with time zone,
  attendance_recorded_by_user_id uuid,
  arrived_at timestamp with time zone,
  arrived_by_user_id uuid,
  feedback_email_sent_at timestamp with time zone,
  feedback_email_status text,
  feedback_email_last_error text,
  assigned_staff_user_id uuid,
  booked_by_user_id uuid,
  booked_by_name text,
  claimed_by_user_id uuid,
  claimed_at timestamp with time zone,
  completed_by_user_id uuid,
  completed_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.current_staff_role() not in ('admin','manager','agent') then
    raise exception 'Not authorised';
  end if;

  return query
  select
    a.id,
    a.branch,
    a.area_id,
    a.appointment_type_id,
    at.name as appointment_type_name,
    at.code as appointment_type_code,
    at.color as appointment_type_color,
    at.text_color as appointment_type_text_color,
    a.start_at,
    a.end_at,
    a.status,
    a.customer_name,
    a.customer_email,
    a.customer_phone,
    a.customer_id,
    a.internal_notes,
    a.attendance_status,
    a.attendance_recorded_at,
    a.attendance_recorded_by_user_id,
    a.arrived_at,
    a.arrived_by_user_id,
    a.feedback_email_sent_at,
    a.feedback_email_status,
    a.feedback_email_last_error,
    a.assigned_staff_user_id,
    a.booked_by_user_id,
    coalesce(sp.display_name, sp.username) as booked_by_name,
    a.claimed_by_user_id,
    a.claimed_at,
    a.completed_by_user_id,
    a.completed_at
  from public.appointments a
  left join public.appointment_types at
    on at.id = a.appointment_type_id
  left join public.staff_profiles sp
    on sp.user_id = a.booked_by_user_id
  where a.branch = p_branch
    and a.start_at >= (p_day::timestamptz)
    and a.start_at < ((p_day + 1)::timestamptz)
    and a.status <> 'cancelled'
  order by a.start_at asc;
end;
$function$;

drop function if exists public.get_appointment_for_calendar_open_staff(uuid);

create or replace function public.get_appointment_for_calendar_open_staff(
  p_appointment_id uuid
)
returns table(
  id uuid,
  branch public.branch_code,
  site_id text,
  appointment_date date,
  area_id uuid,
  appointment_type_id uuid,
  appointment_type_name text,
  appointment_type_code text,
  appointment_type_color text,
  appointment_type_text_color text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status public.appointment_status,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_id uuid,
  internal_notes text,
  attendance_status text,
  attendance_recorded_at timestamp with time zone,
  attendance_recorded_by_user_id uuid,
  arrived_at timestamp with time zone,
  arrived_by_user_id uuid,
  feedback_email_sent_at timestamp with time zone,
  feedback_email_status text,
  feedback_email_last_error text,
  assigned_staff_user_id uuid,
  booked_by_user_id uuid,
  booked_by_name text,
  claimed_by_user_id uuid,
  claimed_at timestamp with time zone,
  completed_by_user_id uuid,
  completed_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if public.current_staff_role() not in ('admin','manager','agent') then
    raise exception 'Not authorised';
  end if;

  return query
  select
    a.id,
    a.branch,
    public.appointment_branch_to_site_id(a.branch) as site_id,
    (a.start_at at time zone 'Europe/London')::date as appointment_date,
    a.area_id,
    a.appointment_type_id,
    at.name as appointment_type_name,
    at.code as appointment_type_code,
    at.color as appointment_type_color,
    at.text_color as appointment_type_text_color,
    a.start_at,
    a.end_at,
    a.status,
    a.customer_name,
    a.customer_email,
    a.customer_phone,
    a.customer_id,
    a.internal_notes,
    a.attendance_status,
    a.attendance_recorded_at,
    a.attendance_recorded_by_user_id,
    a.arrived_at,
    a.arrived_by_user_id,
    a.feedback_email_sent_at,
    a.feedback_email_status,
    a.feedback_email_last_error,
    a.assigned_staff_user_id,
    a.booked_by_user_id,
    coalesce(sp.display_name, sp.username) as booked_by_name,
    a.claimed_by_user_id,
    a.claimed_at,
    a.completed_by_user_id,
    a.completed_at
  from public.appointments a
  left join public.appointment_types at
    on at.id = a.appointment_type_id
  left join public.staff_profiles sp
    on sp.user_id = a.booked_by_user_id
  where a.id = p_appointment_id
    and public.staff_can_access_appointment_branch(a.branch);
end;
$function$;

drop function if exists public.get_appointment_customer_history_staff(uuid, integer);

create or replace function public.get_appointment_customer_history_staff(
  p_customer_id uuid,
  p_limit integer default 10
)
returns table(
  id uuid,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status public.appointment_status,
  branch public.branch_code,
  appointment_type_id uuid,
  appointment_type_name text,
  customer_name text,
  customer_email text,
  customer_phone text,
  attendance_status text,
  attendance_recorded_at timestamp with time zone,
  feedback_email_sent_at timestamp with time zone,
  feedback_email_status text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
begin
  perform public.ensure_appointment_customer_cms_access();

  return query
  select
    a.id,
    a.start_at,
    a.end_at,
    a.status,
    a.branch,
    a.appointment_type_id,
    at.name as appointment_type_name,
    a.customer_name,
    a.customer_email,
    a.customer_phone,
    a.attendance_status,
    a.attendance_recorded_at,
    a.feedback_email_sent_at,
    a.feedback_email_status
  from public.appointments a
  left join public.appointment_types at
    on at.id = a.appointment_type_id
  where a.customer_id = p_customer_id
  order by a.start_at desc
  limit v_limit;
end;
$function$;

grant execute on function public.create_appointment_email_template_staff(text, text, uuid, text, text, text) to authenticated;
grant execute on function public.update_appointment_email_template_staff(uuid, text, text, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.get_calendar_day_agent(public.branch_code, date) to authenticated;
grant execute on function public.get_appointment_for_calendar_open_staff(uuid) to authenticated;
grant execute on function public.get_appointment_customer_history_staff(uuid, integer) to authenticated;

commit;
