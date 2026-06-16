begin;

drop function if exists public.get_appointment_email_templates_staff();
drop function if exists public.update_appointment_email_template_admin(uuid, text, text, text);

create table if not exists public.appointment_email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_type text not null check (template_type in ('confirmation', 'reminder')),
  appointment_type_id uuid references public.appointment_types(id) on delete set null,
  subject text not null,
  body_text text not null,
  body_html text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_appointment_email_templates_type_scope
  on public.appointment_email_templates (template_type, appointment_type_id, is_active, updated_at desc);

alter table public.appointment_email_templates enable row level security;

drop trigger if exists trg_appointment_email_templates_updated_at on public.appointment_email_templates;
create trigger trg_appointment_email_templates_updated_at
before update on public.appointment_email_templates
for each row execute function public.set_updated_at();

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
  'Default confirmation',
  'confirmation',
  null,
  'Appointment confirmation - Slanj Kilts',
  E'Hi {{customer_name}},\n\nYour {{appointment_type}} appointment has been confirmed for {{appointment_date}} at {{appointment_time}}.\n\nLocation:\n{{site_name}}\n{{area_name}}\n\nIf you need to make any changes, please contact us directly.\n\nThanks,\nSlanj Kilts',
  null,
  true
where not exists (
  select 1
  from public.appointment_email_templates t
  where t.template_type = 'confirmation'
    and t.appointment_type_id is null
);

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
  'Default reminder',
  'reminder',
  null,
  'Appointment reminder - Slanj Kilts',
  E'Hi {{customer_name}},\n\nThis is a reminder for your {{appointment_type}} appointment on {{appointment_date}} at {{appointment_time}}.\n\nLocation:\n{{site_name}}\n{{area_name}}\n\nIf you need to make any changes, please contact us directly.\n\nThanks,\nSlanj Kilts',
  null,
  true
where not exists (
  select 1
  from public.appointment_email_templates t
  where t.template_type = 'reminder'
    and t.appointment_type_id is null
);

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
  at.name || ' confirmation',
  'confirmation',
  at.id,
  coalesce(nullif(trim(at.email_subject), ''), 'Appointment confirmation - Slanj Kilts'),
  coalesce(
    nullif(trim(at.email_body_text), ''),
    E'Hi {{customer_name}},\n\nYour {{appointment_type}} appointment has been confirmed for {{appointment_date}} at {{appointment_time}}.\n\nLocation:\n{{site_name}}\n{{area_name}}\n\nIf you need to make any changes, please contact us directly.\n\nThanks,\nSlanj Kilts'
  ),
  nullif(trim(coalesce(at.email_body_html, '')), ''),
  true
from public.appointment_types at
where (
  nullif(trim(coalesce(at.email_subject, '')), '') is not null or
  nullif(trim(coalesce(at.email_body_text, '')), '') is not null or
  nullif(trim(coalesce(at.email_body_html, '')), '') is not null
)
and not exists (
  select 1
  from public.appointment_email_templates t
  where t.template_type = 'confirmation'
    and t.appointment_type_id = at.id
);

create or replace function public.get_appointment_email_templates_staff()
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
begin
  if public.current_staff_role() not in ('admin', 'manager') then
    raise exception 'Not authorised';
  end if;

  return query
  select
    t.id,
    t.name,
    t.template_type,
    t.appointment_type_id,
    at.name as appointment_type_name,
    t.subject,
    t.body_text,
    t.body_html,
    t.is_active,
    t.created_by,
    t.updated_by,
    t.created_at,
    t.updated_at
  from public.appointment_email_templates t
  left join public.appointment_types at
    on at.id = t.appointment_type_id
  order by t.template_type asc, t.is_active desc, t.updated_at desc, t.name asc;
end;
$function$;

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

  if v_template_type not in ('confirmation', 'reminder') then
    raise exception 'Template type must be confirmation or reminder.';
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

  if v_template_type not in ('confirmation', 'reminder') then
    raise exception 'Template type must be confirmation or reminder.';
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

create or replace function public.deactivate_appointment_email_template_staff(
  p_template_id uuid
)
returns table(
  id uuid,
  is_active boolean
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set row_security to 'off'
as $function$
declare
  v_uid uuid := auth.uid();
  v_updated public.appointment_email_templates%rowtype;
begin
  if public.current_staff_role() <> 'admin' then
    raise exception 'Only admins can deactivate appointment email templates.';
  end if;

  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  update public.appointment_email_templates t
  set
    is_active = false,
    updated_by = v_uid
  where t.id = p_template_id
  returning *
  into v_updated;

  if not found then
    raise exception 'That appointment email template could not be found.';
  end if;

  return query
  select v_updated.id, v_updated.is_active;
end;
$function$;

grant execute on function public.get_appointment_email_templates_staff() to authenticated;
grant execute on function public.create_appointment_email_template_staff(text, text, uuid, text, text, text) to authenticated;
grant execute on function public.update_appointment_email_template_staff(uuid, text, text, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.deactivate_appointment_email_template_staff(uuid) to authenticated;

commit;
