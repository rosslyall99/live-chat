begin;

alter table public.appointment_email_log
  drop constraint if exists appointment_email_log_email_type_check;

alter table public.appointment_email_log
  add constraint appointment_email_log_email_type_check
  check (email_type in ('confirmation', 'reminder'));

alter table public.appointment_audit_log
  drop constraint if exists appointment_audit_log_action_check;

alter table public.appointment_audit_log
  add constraint appointment_audit_log_action_check
  check (action in ('created', 'updated', 'cancelled', 'confirmation_sent', 'reminder_sent'));

commit;
