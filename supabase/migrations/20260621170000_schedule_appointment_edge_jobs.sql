begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema public;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  v_jobid bigint;
begin
  select jobid
  into v_jobid
  from cron.job
  where jobname = 'appointment-reminders';

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'appointment-reminders',
  '0 8 * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'slanj_edge_functions_base_url'
    ) || '/send_scheduled_appointment_reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'appointment_reminder_cron_secret'
      )
    ),
    body := jsonb_build_object('dry_run', false)
  ) as request_id;
  $$
);

do $$
declare
  v_jobid bigint;
begin
  select jobid
  into v_jobid
  from cron.job
  where jobname = 'appointment-feedback';

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'appointment-feedback',
  '0 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'slanj_edge_functions_base_url'
    ) || '/send_scheduled_appointment_feedback',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-feedback-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'appointment_feedback_cron_secret'
      )
    ),
    body := jsonb_build_object('dry_run', false)
  ) as request_id;
  $$
);

commit;
