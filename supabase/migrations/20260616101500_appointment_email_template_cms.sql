begin;

alter table public.appointment_types
  add column if not exists reminder_email_subject text,
  add column if not exists reminder_email_body_html text,
  add column if not exists reminder_email_body_text text;

create or replace function public.get_appointment_email_templates_staff()
returns table(
  id uuid,
  name text,
  is_active boolean,
  sort_order integer,
  confirmation_subject text,
  confirmation_body_text text,
  confirmation_body_html text,
  reminder_subject text,
  reminder_body_text text,
  reminder_body_html text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
begin
  if public.current_staff_role() not in ('admin', 'manager') then
    raise exception 'Not authorised';
  end if;

  return query
  select
    at.id,
    at.name,
    at.is_active,
    at.sort_order,
    at.email_subject as confirmation_subject,
    at.email_body_text as confirmation_body_text,
    at.email_body_html as confirmation_body_html,
    at.reminder_email_subject as reminder_subject,
    at.reminder_email_body_text as reminder_body_text,
    at.reminder_email_body_html as reminder_body_html
  from public.appointment_types at
  order by at.sort_order asc, at.name asc;
end;
$function$;

create or replace function public.update_appointment_email_template_admin(
  p_appointment_type_id uuid,
  p_template_kind text,
  p_subject text default null,
  p_body_text text default null
)
returns table(
  id uuid,
  name text,
  confirmation_subject text,
  confirmation_body_text text,
  confirmation_body_html text,
  reminder_subject text,
  reminder_body_text text,
  reminder_body_html text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_updated public.appointment_types%rowtype;
  v_subject text := nullif(trim(coalesce(p_subject, '')), '');
  v_body_text text := nullif(trim(coalesce(p_body_text, '')), '');
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can update appointment email templates.';
  end if;

  if p_appointment_type_id is null then
    raise exception 'Appointment type is required.';
  end if;

  if p_template_kind not in ('confirmation', 'reminder') then
    raise exception 'Template kind must be confirmation or reminder.';
  end if;

  if p_template_kind = 'confirmation' then
    update public.appointment_types at
    set
      email_subject = v_subject,
      email_body_text = v_body_text,
      email_body_html = null
    where at.id = p_appointment_type_id
    returning *
    into v_updated;
  else
    update public.appointment_types at
    set
      reminder_email_subject = v_subject,
      reminder_email_body_text = v_body_text,
      reminder_email_body_html = null
    where at.id = p_appointment_type_id
    returning *
    into v_updated;
  end if;

  if not found then
    raise exception 'That appointment type could not be found.';
  end if;

  return query
  select
    v_updated.id,
    v_updated.name,
    v_updated.email_subject,
    v_updated.email_body_text,
    v_updated.email_body_html,
    v_updated.reminder_email_subject,
    v_updated.reminder_email_body_text,
    v_updated.reminder_email_body_html;
end;
$function$;

grant execute on function public.get_appointment_email_templates_staff() to authenticated;
grant execute on function public.update_appointment_email_template_admin(uuid, text, text, text) to authenticated;

commit;
