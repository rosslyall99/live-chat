# Supabase Cron appointment jobs

Scheduled appointment emails are managed with Supabase Cron (`pg_cron`) calling
Edge Functions through `pg_net`. Secret values are stored in Supabase Vault and
are not committed to migrations.

## Edge Functions

Reminder job:

- Function: `send_scheduled_appointment_reminders`
- URL: `https://lkybwbuldybdeyjjqehm.functions.supabase.co/send_scheduled_appointment_reminders`
- Method: `POST`
- Header: `x-reminder-cron-secret: <APPOINTMENT_REMINDER_CRON_SECRET>`
- Body: `{"dry_run":false}`
- Schedule: daily at `08:00 UTC`

Feedback job:

- Function: `send_scheduled_appointment_feedback`
- URL: `https://lkybwbuldybdeyjjqehm.functions.supabase.co/send_scheduled_appointment_feedback`
- Method: `POST`
- Header: `x-feedback-cron-secret: <APPOINTMENT_FEEDBACK_CRON_SECRET>`
- Body: `{"dry_run":false}`
- Schedule: hourly

Both functions must remain protected by their cron secret checks. If JWT
verification is enabled on either Edge Function, the cron job will also need a
valid Supabase JWT-bearing `Authorization` header. The current intended setup is
deployment with `--no-verify-jwt` plus the custom cron secret header.

## One-time Vault setup

Create these Vault secrets in the Supabase Dashboard or SQL editor before
depending on the cron jobs:

```sql
select vault.create_secret(
  'https://lkybwbuldybdeyjjqehm.functions.supabase.co',
  'slanj_edge_functions_base_url',
  'Base URL for scheduled appointment Edge Functions'
);

select vault.create_secret(
  '<same value as APPOINTMENT_REMINDER_CRON_SECRET>',
  'appointment_reminder_cron_secret',
  'Secret header used by Supabase Cron for appointment reminders'
);

select vault.create_secret(
  '<same value as APPOINTMENT_FEEDBACK_CRON_SECRET, or the reminder secret if feedback reuses it>',
  'appointment_feedback_cron_secret',
  'Secret header used by Supabase Cron for appointment feedback'
);
```

If a secret already exists, update it instead of creating a duplicate.

## Cron jobs

Migration `20260621170000_schedule_appointment_edge_jobs.sql` creates:

- `appointment-reminders`: `0 8 * * *`
- `appointment-feedback`: `0 * * * *`

After applying the migration, confirm:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('appointment-reminders', 'appointment-feedback')
order by jobname;
```

## Manual testing

After the Vault secrets are present, run each job from the Supabase SQL editor:

```sql
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
  body := jsonb_build_object('dry_run', true)
);
```

```sql
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
  body := jsonb_build_object('dry_run', true)
);
```

Check recent `pg_net` responses:

```sql
select *
from net._http_response
order by created desc
limit 20;
```

Once both Supabase Cron jobs have been manually tested and observed running,
disable the matching cron-job.org jobs to avoid duplicate invocations.
