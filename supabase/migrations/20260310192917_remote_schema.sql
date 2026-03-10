create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

create extension if not exists "btree_gist" with schema "public";

create extension if not exists "pg_net" with schema "public";

create type "public"."appointment_status" as enum ('booked', 'claimed', 'completed', 'cancelled');

create type "public"."branch_code" as enum ('STE', 'DUK');

create type "public"."feedback_source" as enum ('sms', 'email', 'in_store');


  create table "public"."appointment_areas" (
    "id" uuid not null default gen_random_uuid(),
    "branch" public.branch_code not null,
    "name" text not null,
    "is_active" boolean not null default true,
    "sort_order" integer not null default 100,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."appointment_areas" enable row level security;


  create table "public"."appointment_blocks" (
    "id" uuid not null default gen_random_uuid(),
    "branch" public.branch_code not null,
    "area_id" uuid,
    "staff_user_id" uuid,
    "start_at" timestamp with time zone not null,
    "end_at" timestamp with time zone not null,
    "reason" text not null,
    "created_by_user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."appointment_blocks" enable row level security;


  create table "public"."appointment_feedback" (
    "id" uuid not null default gen_random_uuid(),
    "appointment_id" uuid not null,
    "rating" integer not null,
    "comment" text,
    "source" public.feedback_source not null default 'sms'::public.feedback_source,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."appointment_feedback" enable row level security;


  create table "public"."appointment_types" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "duration_minutes" integer not null,
    "is_active" boolean not null default true,
    "sort_order" integer not null default 100,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "email_subject" text,
    "email_body_html" text,
    "email_body_text" text,
    "customer_prep_notes" text
      );


alter table "public"."appointment_types" enable row level security;


  create table "public"."appointments" (
    "id" uuid not null default gen_random_uuid(),
    "branch" public.branch_code not null,
    "area_id" uuid not null,
    "appointment_type_id" uuid not null,
    "start_at" timestamp with time zone not null,
    "end_at" timestamp with time zone not null,
    "status" public.appointment_status not null default 'booked'::public.appointment_status,
    "customer_name" text not null,
    "customer_email" text not null,
    "customer_phone" text,
    "sms_consent" boolean not null default false,
    "linked_conversation_id" uuid,
    "booked_by_user_id" uuid not null,
    "assigned_staff_user_id" uuid,
    "claimed_by_user_id" uuid,
    "claimed_at" timestamp with time zone,
    "completed_by_user_id" uuid,
    "completed_at" timestamp with time zone,
    "correct_type" boolean,
    "confusion_flag" boolean,
    "internal_notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."appointments" enable row level security;


  create table "public"."canned_replies" (
    "id" uuid not null default gen_random_uuid(),
    "site_id" text,
    "title" text not null,
    "body" text not null,
    "created_at" timestamp with time zone not null default now(),
    "is_active" boolean not null default true,
    "sort_order" integer not null default 100,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."canned_replies" enable row level security;


  create table "public"."chat_branches" (
    "id" text not null,
    "name" text not null,
    "chat_enabled" boolean not null default true,
    "updated_at" timestamp with time zone not null default now(),
    "updated_by" uuid
      );


alter table "public"."chat_branches" enable row level security;


  create table "public"."chat_kill_switch_log" (
    "id" uuid not null default gen_random_uuid(),
    "scope" text not null,
    "site_id" text,
    "new_state" boolean not null,
    "changed_by" uuid,
    "changed_at" timestamp with time zone not null default now()
      );


alter table "public"."chat_kill_switch_log" enable row level security;


  create table "public"."chat_ratings" (
    "id" uuid not null default gen_random_uuid(),
    "conversation_id" uuid,
    "rating" integer,
    "comment" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."chat_settings" (
    "site_id" text not null,
    "enabled" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "global_enabled" boolean not null default true
      );


alter table "public"."chat_settings" enable row level security;


  create table "public"."claim_intents" (
    "conversation_id" uuid not null,
    "site_id" text not null,
    "claiming_by" text not null,
    "expires_at" timestamp with time zone not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."claim_intents" enable row level security;


  create table "public"."conversations" (
    "id" uuid not null default gen_random_uuid(),
    "site_id" text not null,
    "status" text not null default 'open'::text,
    "assigned_to" uuid,
    "created_at" timestamp with time zone not null default now(),
    "last_message_at" timestamp with time zone not null default now(),
    "customer_name" text not null,
    "customer_email" text,
    "customer_token" uuid not null default gen_random_uuid(),
    "closed_at" timestamp with time zone,
    "handled_by" uuid,
    "handled_by_name" text,
    "closed_by" uuid,
    "closed_by_name" text,
    "assigned_to_name" text,
    "eligible_sites" text[] not null default '{}'::text[]
      );


alter table "public"."conversations" enable row level security;


  create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "conversation_id" uuid not null,
    "sender_type" text not null,
    "sender_user_id" uuid,
    "body" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."messages" enable row level security;


  create table "public"."notifier_conversations" (
    "id" uuid not null,
    "status" text not null,
    "assigned_to" uuid,
    "assigned_to_name" text,
    "last_message_at" timestamp with time zone not null,
    "customer_name" text,
    "first_customer_message" text,
    "eligible_sites" text[] not null default '{}'::text[]
      );


alter table "public"."notifier_conversations" enable row level security;


  create table "public"."rota_absences" (
    "id" uuid not null default gen_random_uuid(),
    "source_uid" text not null,
    "dtstamp" timestamp with time zone,
    "staff_name" text not null,
    "absence_label" text not null,
    "absence_type" text not null,
    "start_date" date not null,
    "end_date" date not null,
    "is_partial" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "natural_key" text,
    "staff_user_id" uuid,
    "last_seen_at" timestamp with time zone
      );


alter table "public"."rota_absences" enable row level security;


  create table "public"."rota_shifts" (
    "id" uuid not null default gen_random_uuid(),
    "source_uid" text not null,
    "dtstamp" timestamp with time zone,
    "staff_name" text not null,
    "label" text not null,
    "branch" text not null,
    "start_at" timestamp with time zone not null,
    "end_at" timestamp with time zone not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "natural_key" text,
    "staff_user_id" uuid,
    "last_seen_at" timestamp with time zone
      );


alter table "public"."rota_shifts" enable row level security;


  create table "public"."site_settings" (
    "site_id" text not null,
    "manual_status" text not null default 'online'::text,
    "opening_hours" jsonb,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."site_settings" enable row level security;


  create table "public"."sites" (
    "id" text not null,
    "name" text not null,
    "notify_email" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."sites" enable row level security;


  create table "public"."staff_login_public" (
    "username" text not null,
    "display_name" text not null,
    "is_active" boolean not null default true,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."staff_login_public" enable row level security;


  create table "public"."staff_profiles" (
    "user_id" uuid not null,
    "username" text not null,
    "display_name" text not null,
    "site_id" text not null,
    "role" text not null default 'agent'::text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "session_nonce" text,
    "rota_branch" text,
    "rota_match_name" text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."staff_profiles" enable row level security;

CREATE UNIQUE INDEX appointment_areas_pkey ON public.appointment_areas USING btree (id);

CREATE UNIQUE INDEX appointment_blocks_pkey ON public.appointment_blocks USING btree (id);

CREATE UNIQUE INDEX appointment_feedback_pkey ON public.appointment_feedback USING btree (id);

CREATE UNIQUE INDEX appointment_types_pkey ON public.appointment_types USING btree (id);

CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);

select 1; 
-- CREATE INDEX appts_no_overlap_area ON public.appointments USING gist (area_id, tstzrange(start_at, end_at, '[)'::text)) WHERE (status <> 'cancelled'::public.appointment_status);

select 1; 
-- CREATE INDEX appts_no_overlap_assigned_staff ON public.appointments USING gist (assigned_staff_user_id, tstzrange(start_at, end_at, '[)'::text)) WHERE ((status <> 'cancelled'::public.appointment_status) AND (assigned_staff_user_id IS NOT NULL));

select 1; 
-- CREATE INDEX blocks_no_overlap_area ON public.appointment_blocks USING gist (area_id, tstzrange(start_at, end_at, '[)'::text)) WHERE (area_id IS NOT NULL);

select 1; 
-- CREATE INDEX blocks_no_overlap_staff ON public.appointment_blocks USING gist (staff_user_id, tstzrange(start_at, end_at, '[)'::text)) WHERE (staff_user_id IS NOT NULL);

CREATE UNIQUE INDEX canned_replies_pkey ON public.canned_replies USING btree (id);

CREATE UNIQUE INDEX chat_branches_pkey ON public.chat_branches USING btree (id);

CREATE UNIQUE INDEX chat_kill_switch_log_pkey ON public.chat_kill_switch_log USING btree (id);

CREATE UNIQUE INDEX chat_ratings_conversation_id_key ON public.chat_ratings USING btree (conversation_id);

CREATE UNIQUE INDEX chat_ratings_pkey ON public.chat_ratings USING btree (id);

CREATE UNIQUE INDEX chat_settings_pkey ON public.chat_settings USING btree (site_id);

CREATE INDEX claim_intents_expires_at_idx ON public.claim_intents USING btree (expires_at);

CREATE UNIQUE INDEX claim_intents_pkey ON public.claim_intents USING btree (conversation_id);

CREATE INDEX claim_intents_site_id_idx ON public.claim_intents USING btree (site_id);

CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id);

CREATE INDEX idx_appointment_types_active ON public.appointment_types USING btree (is_active, sort_order);

CREATE INDEX idx_appts_area_time ON public.appointments USING btree (area_id, start_at);

CREATE INDEX idx_appts_assigned_staff_time ON public.appointments USING btree (assigned_staff_user_id, start_at);

CREATE INDEX idx_appts_day_branch ON public.appointments USING btree (branch, start_at);

CREATE INDEX idx_appts_status_time ON public.appointments USING btree (status, start_at);

CREATE INDEX idx_areas_branch_sort ON public.appointment_areas USING btree (branch, is_active, sort_order);

CREATE INDEX idx_blocks_area_time ON public.appointment_blocks USING btree (area_id, start_at);

CREATE INDEX idx_blocks_branch_time ON public.appointment_blocks USING btree (branch, start_at);

CREATE INDEX idx_blocks_staff_time ON public.appointment_blocks USING btree (staff_user_id, start_at);

CREATE INDEX idx_canned_replies_site_id ON public.canned_replies USING btree (site_id);

CREATE INDEX idx_chat_branches_updated_by ON public.chat_branches USING btree (updated_by);

CREATE INDEX idx_chat_kill_switch_log_changed_by ON public.chat_kill_switch_log USING btree (changed_by);

CREATE INDEX idx_conversations_assigned ON public.conversations USING btree (assigned_to);

CREATE INDEX idx_conversations_closed_by ON public.conversations USING btree (closed_by);

CREATE INDEX idx_conversations_handled_by ON public.conversations USING btree (handled_by);

CREATE INDEX idx_conversations_site_last ON public.conversations USING btree (site_id, last_message_at DESC);

CREATE INDEX idx_feedback_rating_time ON public.appointment_feedback USING btree (rating, created_at);

CREATE INDEX idx_messages_conversation_time ON public.messages USING btree (conversation_id, created_at);

CREATE INDEX idx_messages_sender_user_id ON public.messages USING btree (sender_user_id);

CREATE INDEX idx_staff_profiles_site_id ON public.staff_profiles USING btree (site_id);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE UNIQUE INDEX notifier_conversations_pkey ON public.notifier_conversations USING btree (id);

CREATE INDEX rota_absences_last_seen_at_idx ON public.rota_absences USING btree (last_seen_at);

CREATE INDEX rota_absences_natural_key_idx ON public.rota_absences USING btree (natural_key);

CREATE UNIQUE INDEX rota_absences_pkey ON public.rota_absences USING btree (id);

CREATE UNIQUE INDEX rota_absences_source_uid_key ON public.rota_absences USING btree (source_uid);

CREATE INDEX rota_absences_staff_idx ON public.rota_absences USING btree (staff_name);

CREATE INDEX rota_absences_start_date_idx ON public.rota_absences USING btree (start_date);

CREATE INDEX rota_shifts_branch_idx ON public.rota_shifts USING btree (branch);

CREATE INDEX rota_shifts_last_seen_at_idx ON public.rota_shifts USING btree (last_seen_at);

CREATE INDEX rota_shifts_natural_key_idx ON public.rota_shifts USING btree (natural_key);

CREATE UNIQUE INDEX rota_shifts_pkey ON public.rota_shifts USING btree (id);

CREATE UNIQUE INDEX rota_shifts_source_uid_key ON public.rota_shifts USING btree (source_uid);

CREATE INDEX rota_shifts_staff_idx ON public.rota_shifts USING btree (staff_name);

CREATE INDEX rota_shifts_start_at_idx ON public.rota_shifts USING btree (start_at);

CREATE UNIQUE INDEX site_settings_pkey ON public.site_settings USING btree (site_id);

CREATE UNIQUE INDEX sites_pkey ON public.sites USING btree (id);

CREATE UNIQUE INDEX staff_login_public_pkey ON public.staff_login_public USING btree (username);

CREATE UNIQUE INDEX staff_profiles_pkey ON public.staff_profiles USING btree (user_id);

CREATE INDEX staff_profiles_rota_branch_idx ON public.staff_profiles USING btree (rota_branch);

CREATE UNIQUE INDEX staff_profiles_username_key ON public.staff_profiles USING btree (username);

CREATE UNIQUE INDEX uq_areas_branch_name ON public.appointment_areas USING btree (branch, name);

CREATE UNIQUE INDEX uq_feedback_one_per_appt ON public.appointment_feedback USING btree (appointment_id);

alter table "public"."appointment_areas" add constraint "appointment_areas_pkey" PRIMARY KEY using index "appointment_areas_pkey";

alter table "public"."appointment_blocks" add constraint "appointment_blocks_pkey" PRIMARY KEY using index "appointment_blocks_pkey";

alter table "public"."appointment_feedback" add constraint "appointment_feedback_pkey" PRIMARY KEY using index "appointment_feedback_pkey";

alter table "public"."appointment_types" add constraint "appointment_types_pkey" PRIMARY KEY using index "appointment_types_pkey";

alter table "public"."appointments" add constraint "appointments_pkey" PRIMARY KEY using index "appointments_pkey";

alter table "public"."canned_replies" add constraint "canned_replies_pkey" PRIMARY KEY using index "canned_replies_pkey";

alter table "public"."chat_branches" add constraint "chat_branches_pkey" PRIMARY KEY using index "chat_branches_pkey";

alter table "public"."chat_kill_switch_log" add constraint "chat_kill_switch_log_pkey" PRIMARY KEY using index "chat_kill_switch_log_pkey";

alter table "public"."chat_ratings" add constraint "chat_ratings_pkey" PRIMARY KEY using index "chat_ratings_pkey";

alter table "public"."chat_settings" add constraint "chat_settings_pkey" PRIMARY KEY using index "chat_settings_pkey";

alter table "public"."claim_intents" add constraint "claim_intents_pkey" PRIMARY KEY using index "claim_intents_pkey";

alter table "public"."conversations" add constraint "conversations_pkey" PRIMARY KEY using index "conversations_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."notifier_conversations" add constraint "notifier_conversations_pkey" PRIMARY KEY using index "notifier_conversations_pkey";

alter table "public"."rota_absences" add constraint "rota_absences_pkey" PRIMARY KEY using index "rota_absences_pkey";

alter table "public"."rota_shifts" add constraint "rota_shifts_pkey" PRIMARY KEY using index "rota_shifts_pkey";

alter table "public"."site_settings" add constraint "site_settings_pkey" PRIMARY KEY using index "site_settings_pkey";

alter table "public"."sites" add constraint "sites_pkey" PRIMARY KEY using index "sites_pkey";

alter table "public"."staff_login_public" add constraint "staff_login_public_pkey" PRIMARY KEY using index "staff_login_public_pkey";

alter table "public"."staff_profiles" add constraint "staff_profiles_pkey" PRIMARY KEY using index "staff_profiles_pkey";

alter table "public"."appointment_blocks" add constraint "appointment_blocks_area_id_fkey" FOREIGN KEY (area_id) REFERENCES public.appointment_areas(id) ON DELETE CASCADE not valid;

alter table "public"."appointment_blocks" validate constraint "appointment_blocks_area_id_fkey";

alter table "public"."appointment_blocks" add constraint "appointment_blocks_check" CHECK ((end_at > start_at)) not valid;

alter table "public"."appointment_blocks" validate constraint "appointment_blocks_check";

alter table "public"."appointment_blocks" add constraint "appointment_blocks_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."appointment_blocks" validate constraint "appointment_blocks_created_by_user_id_fkey";

alter table "public"."appointment_blocks" add constraint "appointment_blocks_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."appointment_blocks" validate constraint "appointment_blocks_staff_user_id_fkey";

alter table "public"."appointment_blocks" add constraint "blocks_no_overlap_area" EXCLUDE USING gist (area_id WITH =, tstzrange(start_at, end_at, '[)'::text) WITH &&) WHERE ((area_id IS NOT NULL));

alter table "public"."appointment_blocks" add constraint "blocks_no_overlap_staff" EXCLUDE USING gist (staff_user_id WITH =, tstzrange(start_at, end_at, '[)'::text) WITH &&) WHERE ((staff_user_id IS NOT NULL));

alter table "public"."appointment_blocks" add constraint "blocks_target_present" CHECK (((area_id IS NOT NULL) OR (staff_user_id IS NOT NULL) OR (branch IS NOT NULL))) not valid;

alter table "public"."appointment_blocks" validate constraint "blocks_target_present";

alter table "public"."appointment_feedback" add constraint "appointment_feedback_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE not valid;

alter table "public"."appointment_feedback" validate constraint "appointment_feedback_appointment_id_fkey";

alter table "public"."appointment_feedback" add constraint "appointment_feedback_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."appointment_feedback" validate constraint "appointment_feedback_rating_check";

alter table "public"."appointment_types" add constraint "appointment_types_duration_minutes_check" CHECK (((duration_minutes >= 5) AND (duration_minutes <= 480))) not valid;

alter table "public"."appointment_types" validate constraint "appointment_types_duration_minutes_check";

alter table "public"."appointments" add constraint "appointments_appointment_type_id_fkey" FOREIGN KEY (appointment_type_id) REFERENCES public.appointment_types(id) ON DELETE RESTRICT not valid;

alter table "public"."appointments" validate constraint "appointments_appointment_type_id_fkey";

alter table "public"."appointments" add constraint "appointments_area_id_fkey" FOREIGN KEY (area_id) REFERENCES public.appointment_areas(id) ON DELETE RESTRICT not valid;

alter table "public"."appointments" validate constraint "appointments_area_id_fkey";

alter table "public"."appointments" add constraint "appointments_assigned_staff_user_id_fkey" FOREIGN KEY (assigned_staff_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."appointments" validate constraint "appointments_assigned_staff_user_id_fkey";

alter table "public"."appointments" add constraint "appointments_booked_by_user_id_fkey" FOREIGN KEY (booked_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."appointments" validate constraint "appointments_booked_by_user_id_fkey";

alter table "public"."appointments" add constraint "appointments_check" CHECK ((end_at > start_at)) not valid;

alter table "public"."appointments" validate constraint "appointments_check";

alter table "public"."appointments" add constraint "appointments_claimed_by_user_id_fkey" FOREIGN KEY (claimed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."appointments" validate constraint "appointments_claimed_by_user_id_fkey";

alter table "public"."appointments" add constraint "appointments_completed_by_user_id_fkey" FOREIGN KEY (completed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."appointments" validate constraint "appointments_completed_by_user_id_fkey";

alter table "public"."appointments" add constraint "appts_no_overlap_area" EXCLUDE USING gist (area_id WITH =, tstzrange(start_at, end_at, '[)'::text) WITH &&) WHERE ((status <> 'cancelled'::public.appointment_status));

alter table "public"."appointments" add constraint "appts_no_overlap_assigned_staff" EXCLUDE USING gist (assigned_staff_user_id WITH =, tstzrange(start_at, end_at, '[)'::text) WITH &&) WHERE (((status <> 'cancelled'::public.appointment_status) AND (assigned_staff_user_id IS NOT NULL)));

alter table "public"."canned_replies" add constraint "canned_replies_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) not valid;

alter table "public"."canned_replies" validate constraint "canned_replies_site_id_fkey";

alter table "public"."chat_branches" add constraint "chat_branches_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."chat_branches" validate constraint "chat_branches_updated_by_fkey";

alter table "public"."chat_kill_switch_log" add constraint "chat_kill_switch_log_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) not valid;

alter table "public"."chat_kill_switch_log" validate constraint "chat_kill_switch_log_changed_by_fkey";

alter table "public"."chat_kill_switch_log" add constraint "chat_kill_switch_log_scope_check" CHECK ((scope = ANY (ARRAY['branch'::text, 'global'::text]))) not valid;

alter table "public"."chat_kill_switch_log" validate constraint "chat_kill_switch_log_scope_check";

alter table "public"."chat_ratings" add constraint "chat_ratings_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) not valid;

alter table "public"."chat_ratings" validate constraint "chat_ratings_conversation_id_fkey";

alter table "public"."chat_ratings" add constraint "chat_ratings_conversation_id_key" UNIQUE using index "chat_ratings_conversation_id_key";

alter table "public"."chat_ratings" add constraint "chat_ratings_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."chat_ratings" validate constraint "chat_ratings_rating_check";

alter table "public"."chat_settings" add constraint "chat_settings_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE not valid;

alter table "public"."chat_settings" validate constraint "chat_settings_site_id_fkey";

alter table "public"."conversations" add constraint "conversations_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) not valid;

alter table "public"."conversations" validate constraint "conversations_assigned_to_fkey";

alter table "public"."conversations" add constraint "conversations_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES auth.users(id) not valid;

alter table "public"."conversations" validate constraint "conversations_closed_by_fkey";

alter table "public"."conversations" add constraint "conversations_handled_by_fkey" FOREIGN KEY (handled_by) REFERENCES auth.users(id) not valid;

alter table "public"."conversations" validate constraint "conversations_handled_by_fkey";

alter table "public"."conversations" add constraint "conversations_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) not valid;

alter table "public"."conversations" validate constraint "conversations_site_id_fkey";

alter table "public"."messages" add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_conversation_id_fkey";

alter table "public"."messages" add constraint "messages_sender_user_id_fkey" FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) not valid;

alter table "public"."messages" validate constraint "messages_sender_user_id_fkey";

alter table "public"."rota_absences" add constraint "rota_absences_source_uid_key" UNIQUE using index "rota_absences_source_uid_key";

alter table "public"."rota_absences" add constraint "rota_absences_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) not valid;

alter table "public"."rota_absences" validate constraint "rota_absences_staff_user_id_fkey";

alter table "public"."rota_shifts" add constraint "rota_shifts_source_uid_key" UNIQUE using index "rota_shifts_source_uid_key";

alter table "public"."rota_shifts" add constraint "rota_shifts_staff_user_id_fkey" FOREIGN KEY (staff_user_id) REFERENCES auth.users(id) not valid;

alter table "public"."rota_shifts" validate constraint "rota_shifts_staff_user_id_fkey";

alter table "public"."site_settings" add constraint "site_settings_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) not valid;

alter table "public"."site_settings" validate constraint "site_settings_site_id_fkey";

alter table "public"."staff_profiles" add constraint "staff_profiles_role_check" CHECK ((role = ANY (ARRAY['agent'::text, 'manager'::text, 'admin'::text]))) not valid;

alter table "public"."staff_profiles" validate constraint "staff_profiles_role_check";

alter table "public"."staff_profiles" add constraint "staff_profiles_rota_branch_check" CHECK (((rota_branch = ANY (ARRAY['DUK'::text, 'STE'::text, 'HIRE'::text, 'OFFICE'::text])) OR (rota_branch IS NULL))) not valid;

alter table "public"."staff_profiles" validate constraint "staff_profiles_rota_branch_check";

alter table "public"."staff_profiles" add constraint "staff_profiles_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) not valid;

alter table "public"."staff_profiles" validate constraint "staff_profiles_site_id_fkey";

alter table "public"."staff_profiles" add constraint "staff_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."staff_profiles" validate constraint "staff_profiles_user_id_fkey";

alter table "public"."staff_profiles" add constraint "staff_profiles_username_key" UNIQUE using index "staff_profiles_username_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.claim_conversation(p_conversation_id uuid)
 RETURNS SETOF public.conversations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_site_id text;
begin
  if v_uid is null then
    return;
  end if;

  select
    coalesce(sp.display_name, sp.username),
    sp.site_id
  into
    v_name,
    v_site_id
  from public.staff_profiles sp
  where sp.user_id = v_uid
    and sp.is_active = true
  limit 1;

  if v_name is null or v_site_id is null then
    return;
  end if;

  return query
  update public.conversations c
     set assigned_to = v_uid,
         assigned_to_name = v_name,
         handled_by = v_uid,
         handled_by_name = v_name,
         last_message_at = now()
   where c.id = p_conversation_id
     and c.status = 'open'
     and c.assigned_to is null
     and v_site_id = any(coalesce(c.eligible_sites, '{}'::text[]))
  returning c.*;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_conversation(p_conversation_id uuid, p_user_id uuid, p_user_name text)
 RETURNS TABLE(id uuid, assigned_to uuid, assigned_to_name text, handled_by uuid, handled_by_name text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.conversations c
  set assigned_to = p_user_id,
      assigned_to_name = p_user_name,
      handled_by = p_user_id,
      handled_by_name = p_user_name
  where c.id = p_conversation_id
    and c.assigned_to is null
    and c.status = 'open'
  returning
    c.id,
    c.assigned_to,
    c.assigned_to_name,
    c.handled_by,
    c.handled_by_name
  into
    id,
    assigned_to,
    assigned_to_name,
    handled_by,
    handled_by_name;

  if not found then
    return;
  end if;

  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.close_conversation(p_conversation_id uuid)
 RETURNS SETOF public.conversations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    return;
  end if;

  select coalesce(sp.display_name, sp.username)
    into v_name
  from public.staff_profiles sp
  where sp.user_id = v_uid
    and sp.is_active = true
  limit 1;

  if v_name is null then
    return;
  end if;

  return query
  update public.conversations c
     set status = 'closed',
         assigned_to = null,
         closed_at = now(),
         closed_by = v_uid,
         closed_by_name = v_name,
         handled_by = v_uid,
         handled_by_name = v_name
   where c.id = p_conversation_id
     and c.status = 'open'
     and (c.assigned_to is null or c.assigned_to = v_uid)
  returning c.*;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select sp.role
  from public.staff_profiles sp
  where sp.user_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_area_branch_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  area_branch public.branch_code;
begin
  select branch into area_branch from public.appointment_areas where id = new.area_id;
  if area_branch is null then
    raise exception 'Invalid area_id';
  end if;

  if new.branch <> area_branch then
    raise exception 'Area branch % does not match appointment branch %', area_branch, new.branch;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_blocks_day_agent(p_branch public.branch_code, p_day date)
 RETURNS TABLE(id uuid, branch public.branch_code, area_id uuid, staff_user_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.current_staff_role() not in ('admin','manager','agent') then
    raise exception 'Not authorised';
  end if;

  return query
  select
    b.id, b.branch, b.area_id, b.staff_user_id, b.start_at, b.end_at, b.reason
  from public.appointment_blocks b
  where b.branch = p_branch
    and b.start_at >= (p_day::timestamptz)
    and b.start_at <  ((p_day + 1)::timestamptz)
  order by b.start_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_calendar_day_agent(p_branch public.branch_code, p_day date)
 RETURNS TABLE(id uuid, branch public.branch_code, area_id uuid, appointment_type_id uuid, start_at timestamp with time zone, end_at timestamp with time zone, status public.appointment_status, customer_name text, customer_email text, customer_phone text, assigned_staff_user_id uuid, claimed_by_user_id uuid, claimed_at timestamp with time zone, completed_by_user_id uuid, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Only staff (agent/manager/admin) can call this
  if public.current_staff_role() not in ('admin','manager','agent') then
    raise exception 'Not authorised';
  end if;

  return query
  select
    a.id,
    a.branch,
    a.area_id,
    a.appointment_type_id,
    a.start_at,
    a.end_at,
    a.status,

    a.customer_name,
    a.customer_email,
    a.customer_phone,

    a.assigned_staff_user_id,
    a.claimed_by_user_id,
    a.claimed_at,
    a.completed_by_user_id,
    a.completed_at
  from public.appointments a
  where a.branch = p_branch
    and a.start_at >= (p_day::timestamptz)
    and a.start_at <  ((p_day + 1)::timestamptz)
    and a.status <> 'cancelled'
  order by a.start_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rota_name_map()
 RETURNS TABLE(rota_match_name text, display_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select rota_match_name, display_name
  from public.staff_profiles
  where is_active = true and rota_match_name is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.is_active_staff(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = p_uid
      and sp.is_active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.is_active = true
      and sp.role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = p_uid
      and sp.is_active = true
      and sp.role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.current_staff_role() in ('admin','manager')
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.current_staff_role() in ('admin','manager','agent')
$function$
;

CREATE OR REPLACE FUNCTION public.set_first_customer_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.sender_type = 'customer' then
    insert into public.notifier_conversations (id, first_customer_message, last_message_at, status)
    values (new.conversation_id, new.body, new.created_at, 'open')
    on conflict (id) do update
      set first_customer_message = coalesce(public.notifier_conversations.first_customer_message, excluded.first_customer_message);
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.staff_can_access_site(p_site text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET row_security TO 'off'
AS $function$
  select public.is_staff() and (
    public.staff_role() = 'admin' or
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.site_id = p_site
    )
  );
$function$
;

create or replace view "public"."staff_login_list" as  SELECT username,
    display_name,
    site_id,
    user_id
   FROM public.staff_profiles
  WHERE (is_active = true);


CREATE OR REPLACE FUNCTION public.staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET row_security TO 'off'
AS $function$
  select coalesce(
    (select sp.role
     from public.staff_profiles sp
     where sp.user_id = auth.uid()
       and sp.is_active = true),
    'none'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.sync_notifier_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.notifier_conversations
    (
      id,
      status,
      assigned_to,
      assigned_to_name,
      last_message_at,
      customer_name,
      eligible_sites
    )
  values
    (
      new.id,
      new.status,
      new.assigned_to,
      new.assigned_to_name,
      new.last_message_at,
      new.customer_name,
      coalesce(new.eligible_sites, '{}'::text[])
    )
  on conflict (id) do update set
    status = excluded.status,
    assigned_to = excluded.assigned_to,
    assigned_to_name = excluded.assigned_to_name,
    last_message_at = excluded.last_message_at,
    customer_name = excluded.customer_name,
    eligible_sites = excluded.eligible_sites;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_staff_login_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.staff_login_public (username, display_name, is_active, updated_at)
  values (new.username, new.display_name, new.is_active, now())
  on conflict (username) do update
  set display_name = excluded.display_name,
      is_active = excluded.is_active,
      updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$function$
;

create or replace view "public"."v_appointments_agent" as  SELECT id,
    branch,
    area_id,
    appointment_type_id,
    start_at,
    end_at,
    status,
    customer_name,
    customer_email,
    assigned_staff_user_id,
    claimed_by_user_id,
    claimed_at,
    completed_by_user_id,
    completed_at,
    created_at,
    updated_at
   FROM public.appointments a;


grant delete on table "public"."appointment_areas" to "anon";

grant insert on table "public"."appointment_areas" to "anon";

grant references on table "public"."appointment_areas" to "anon";

grant select on table "public"."appointment_areas" to "anon";

grant trigger on table "public"."appointment_areas" to "anon";

grant truncate on table "public"."appointment_areas" to "anon";

grant update on table "public"."appointment_areas" to "anon";

grant delete on table "public"."appointment_areas" to "authenticated";

grant insert on table "public"."appointment_areas" to "authenticated";

grant references on table "public"."appointment_areas" to "authenticated";

grant select on table "public"."appointment_areas" to "authenticated";

grant trigger on table "public"."appointment_areas" to "authenticated";

grant truncate on table "public"."appointment_areas" to "authenticated";

grant update on table "public"."appointment_areas" to "authenticated";

grant delete on table "public"."appointment_areas" to "service_role";

grant insert on table "public"."appointment_areas" to "service_role";

grant references on table "public"."appointment_areas" to "service_role";

grant select on table "public"."appointment_areas" to "service_role";

grant trigger on table "public"."appointment_areas" to "service_role";

grant truncate on table "public"."appointment_areas" to "service_role";

grant update on table "public"."appointment_areas" to "service_role";

grant delete on table "public"."appointment_blocks" to "anon";

grant insert on table "public"."appointment_blocks" to "anon";

grant references on table "public"."appointment_blocks" to "anon";

grant select on table "public"."appointment_blocks" to "anon";

grant trigger on table "public"."appointment_blocks" to "anon";

grant truncate on table "public"."appointment_blocks" to "anon";

grant update on table "public"."appointment_blocks" to "anon";

grant delete on table "public"."appointment_blocks" to "service_role";

grant insert on table "public"."appointment_blocks" to "service_role";

grant references on table "public"."appointment_blocks" to "service_role";

grant select on table "public"."appointment_blocks" to "service_role";

grant trigger on table "public"."appointment_blocks" to "service_role";

grant truncate on table "public"."appointment_blocks" to "service_role";

grant update on table "public"."appointment_blocks" to "service_role";

grant delete on table "public"."appointment_feedback" to "anon";

grant insert on table "public"."appointment_feedback" to "anon";

grant references on table "public"."appointment_feedback" to "anon";

grant select on table "public"."appointment_feedback" to "anon";

grant trigger on table "public"."appointment_feedback" to "anon";

grant truncate on table "public"."appointment_feedback" to "anon";

grant update on table "public"."appointment_feedback" to "anon";

grant delete on table "public"."appointment_feedback" to "authenticated";

grant insert on table "public"."appointment_feedback" to "authenticated";

grant references on table "public"."appointment_feedback" to "authenticated";

grant select on table "public"."appointment_feedback" to "authenticated";

grant trigger on table "public"."appointment_feedback" to "authenticated";

grant truncate on table "public"."appointment_feedback" to "authenticated";

grant update on table "public"."appointment_feedback" to "authenticated";

grant delete on table "public"."appointment_feedback" to "service_role";

grant insert on table "public"."appointment_feedback" to "service_role";

grant references on table "public"."appointment_feedback" to "service_role";

grant select on table "public"."appointment_feedback" to "service_role";

grant trigger on table "public"."appointment_feedback" to "service_role";

grant truncate on table "public"."appointment_feedback" to "service_role";

grant update on table "public"."appointment_feedback" to "service_role";

grant delete on table "public"."appointment_types" to "anon";

grant insert on table "public"."appointment_types" to "anon";

grant references on table "public"."appointment_types" to "anon";

grant select on table "public"."appointment_types" to "anon";

grant trigger on table "public"."appointment_types" to "anon";

grant truncate on table "public"."appointment_types" to "anon";

grant update on table "public"."appointment_types" to "anon";

grant delete on table "public"."appointment_types" to "authenticated";

grant insert on table "public"."appointment_types" to "authenticated";

grant references on table "public"."appointment_types" to "authenticated";

grant select on table "public"."appointment_types" to "authenticated";

grant trigger on table "public"."appointment_types" to "authenticated";

grant truncate on table "public"."appointment_types" to "authenticated";

grant update on table "public"."appointment_types" to "authenticated";

grant delete on table "public"."appointment_types" to "service_role";

grant insert on table "public"."appointment_types" to "service_role";

grant references on table "public"."appointment_types" to "service_role";

grant select on table "public"."appointment_types" to "service_role";

grant trigger on table "public"."appointment_types" to "service_role";

grant truncate on table "public"."appointment_types" to "service_role";

grant update on table "public"."appointment_types" to "service_role";

grant delete on table "public"."appointments" to "anon";

grant insert on table "public"."appointments" to "anon";

grant references on table "public"."appointments" to "anon";

grant select on table "public"."appointments" to "anon";

grant trigger on table "public"."appointments" to "anon";

grant truncate on table "public"."appointments" to "anon";

grant update on table "public"."appointments" to "anon";

grant delete on table "public"."appointments" to "service_role";

grant insert on table "public"."appointments" to "service_role";

grant references on table "public"."appointments" to "service_role";

grant select on table "public"."appointments" to "service_role";

grant trigger on table "public"."appointments" to "service_role";

grant truncate on table "public"."appointments" to "service_role";

grant update on table "public"."appointments" to "service_role";

grant delete on table "public"."canned_replies" to "authenticated";

grant insert on table "public"."canned_replies" to "authenticated";

grant references on table "public"."canned_replies" to "authenticated";

grant select on table "public"."canned_replies" to "authenticated";

grant trigger on table "public"."canned_replies" to "authenticated";

grant truncate on table "public"."canned_replies" to "authenticated";

grant update on table "public"."canned_replies" to "authenticated";

grant delete on table "public"."canned_replies" to "service_role";

grant insert on table "public"."canned_replies" to "service_role";

grant references on table "public"."canned_replies" to "service_role";

grant select on table "public"."canned_replies" to "service_role";

grant trigger on table "public"."canned_replies" to "service_role";

grant truncate on table "public"."canned_replies" to "service_role";

grant update on table "public"."canned_replies" to "service_role";

grant delete on table "public"."chat_branches" to "anon";

grant insert on table "public"."chat_branches" to "anon";

grant references on table "public"."chat_branches" to "anon";

grant select on table "public"."chat_branches" to "anon";

grant trigger on table "public"."chat_branches" to "anon";

grant truncate on table "public"."chat_branches" to "anon";

grant update on table "public"."chat_branches" to "anon";

grant delete on table "public"."chat_branches" to "authenticated";

grant insert on table "public"."chat_branches" to "authenticated";

grant references on table "public"."chat_branches" to "authenticated";

grant select on table "public"."chat_branches" to "authenticated";

grant trigger on table "public"."chat_branches" to "authenticated";

grant truncate on table "public"."chat_branches" to "authenticated";

grant update on table "public"."chat_branches" to "authenticated";

grant delete on table "public"."chat_branches" to "service_role";

grant insert on table "public"."chat_branches" to "service_role";

grant references on table "public"."chat_branches" to "service_role";

grant select on table "public"."chat_branches" to "service_role";

grant trigger on table "public"."chat_branches" to "service_role";

grant truncate on table "public"."chat_branches" to "service_role";

grant update on table "public"."chat_branches" to "service_role";

grant delete on table "public"."chat_kill_switch_log" to "anon";

grant insert on table "public"."chat_kill_switch_log" to "anon";

grant references on table "public"."chat_kill_switch_log" to "anon";

grant select on table "public"."chat_kill_switch_log" to "anon";

grant trigger on table "public"."chat_kill_switch_log" to "anon";

grant truncate on table "public"."chat_kill_switch_log" to "anon";

grant update on table "public"."chat_kill_switch_log" to "anon";

grant delete on table "public"."chat_kill_switch_log" to "authenticated";

grant insert on table "public"."chat_kill_switch_log" to "authenticated";

grant references on table "public"."chat_kill_switch_log" to "authenticated";

grant select on table "public"."chat_kill_switch_log" to "authenticated";

grant trigger on table "public"."chat_kill_switch_log" to "authenticated";

grant truncate on table "public"."chat_kill_switch_log" to "authenticated";

grant update on table "public"."chat_kill_switch_log" to "authenticated";

grant delete on table "public"."chat_kill_switch_log" to "service_role";

grant insert on table "public"."chat_kill_switch_log" to "service_role";

grant references on table "public"."chat_kill_switch_log" to "service_role";

grant select on table "public"."chat_kill_switch_log" to "service_role";

grant trigger on table "public"."chat_kill_switch_log" to "service_role";

grant truncate on table "public"."chat_kill_switch_log" to "service_role";

grant update on table "public"."chat_kill_switch_log" to "service_role";

grant delete on table "public"."chat_ratings" to "anon";

grant insert on table "public"."chat_ratings" to "anon";

grant references on table "public"."chat_ratings" to "anon";

grant select on table "public"."chat_ratings" to "anon";

grant trigger on table "public"."chat_ratings" to "anon";

grant truncate on table "public"."chat_ratings" to "anon";

grant update on table "public"."chat_ratings" to "anon";

grant delete on table "public"."chat_ratings" to "authenticated";

grant insert on table "public"."chat_ratings" to "authenticated";

grant references on table "public"."chat_ratings" to "authenticated";

grant select on table "public"."chat_ratings" to "authenticated";

grant trigger on table "public"."chat_ratings" to "authenticated";

grant truncate on table "public"."chat_ratings" to "authenticated";

grant update on table "public"."chat_ratings" to "authenticated";

grant delete on table "public"."chat_ratings" to "service_role";

grant insert on table "public"."chat_ratings" to "service_role";

grant references on table "public"."chat_ratings" to "service_role";

grant select on table "public"."chat_ratings" to "service_role";

grant trigger on table "public"."chat_ratings" to "service_role";

grant truncate on table "public"."chat_ratings" to "service_role";

grant update on table "public"."chat_ratings" to "service_role";

grant delete on table "public"."chat_settings" to "authenticated";

grant insert on table "public"."chat_settings" to "authenticated";

grant references on table "public"."chat_settings" to "authenticated";

grant select on table "public"."chat_settings" to "authenticated";

grant trigger on table "public"."chat_settings" to "authenticated";

grant truncate on table "public"."chat_settings" to "authenticated";

grant update on table "public"."chat_settings" to "authenticated";

grant delete on table "public"."chat_settings" to "service_role";

grant insert on table "public"."chat_settings" to "service_role";

grant references on table "public"."chat_settings" to "service_role";

grant select on table "public"."chat_settings" to "service_role";

grant trigger on table "public"."chat_settings" to "service_role";

grant truncate on table "public"."chat_settings" to "service_role";

grant update on table "public"."chat_settings" to "service_role";

grant delete on table "public"."claim_intents" to "anon";

grant insert on table "public"."claim_intents" to "anon";

grant references on table "public"."claim_intents" to "anon";

grant select on table "public"."claim_intents" to "anon";

grant trigger on table "public"."claim_intents" to "anon";

grant truncate on table "public"."claim_intents" to "anon";

grant update on table "public"."claim_intents" to "anon";

grant delete on table "public"."claim_intents" to "authenticated";

grant insert on table "public"."claim_intents" to "authenticated";

grant references on table "public"."claim_intents" to "authenticated";

grant select on table "public"."claim_intents" to "authenticated";

grant trigger on table "public"."claim_intents" to "authenticated";

grant truncate on table "public"."claim_intents" to "authenticated";

grant update on table "public"."claim_intents" to "authenticated";

grant delete on table "public"."claim_intents" to "service_role";

grant insert on table "public"."claim_intents" to "service_role";

grant references on table "public"."claim_intents" to "service_role";

grant select on table "public"."claim_intents" to "service_role";

grant trigger on table "public"."claim_intents" to "service_role";

grant truncate on table "public"."claim_intents" to "service_role";

grant update on table "public"."claim_intents" to "service_role";

grant delete on table "public"."conversations" to "authenticated";

grant insert on table "public"."conversations" to "authenticated";

grant references on table "public"."conversations" to "authenticated";

grant select on table "public"."conversations" to "authenticated";

grant trigger on table "public"."conversations" to "authenticated";

grant truncate on table "public"."conversations" to "authenticated";

grant update on table "public"."conversations" to "authenticated";

grant delete on table "public"."conversations" to "service_role";

grant insert on table "public"."conversations" to "service_role";

grant references on table "public"."conversations" to "service_role";

grant select on table "public"."conversations" to "service_role";

grant trigger on table "public"."conversations" to "service_role";

grant truncate on table "public"."conversations" to "service_role";

grant update on table "public"."conversations" to "service_role";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."notifier_conversations" to "anon";

grant insert on table "public"."notifier_conversations" to "anon";

grant references on table "public"."notifier_conversations" to "anon";

grant select on table "public"."notifier_conversations" to "anon";

grant trigger on table "public"."notifier_conversations" to "anon";

grant truncate on table "public"."notifier_conversations" to "anon";

grant update on table "public"."notifier_conversations" to "anon";

grant delete on table "public"."notifier_conversations" to "authenticated";

grant insert on table "public"."notifier_conversations" to "authenticated";

grant references on table "public"."notifier_conversations" to "authenticated";

grant select on table "public"."notifier_conversations" to "authenticated";

grant trigger on table "public"."notifier_conversations" to "authenticated";

grant truncate on table "public"."notifier_conversations" to "authenticated";

grant update on table "public"."notifier_conversations" to "authenticated";

grant delete on table "public"."notifier_conversations" to "service_role";

grant insert on table "public"."notifier_conversations" to "service_role";

grant references on table "public"."notifier_conversations" to "service_role";

grant select on table "public"."notifier_conversations" to "service_role";

grant trigger on table "public"."notifier_conversations" to "service_role";

grant truncate on table "public"."notifier_conversations" to "service_role";

grant update on table "public"."notifier_conversations" to "service_role";

grant delete on table "public"."rota_absences" to "anon";

grant insert on table "public"."rota_absences" to "anon";

grant references on table "public"."rota_absences" to "anon";

grant select on table "public"."rota_absences" to "anon";

grant trigger on table "public"."rota_absences" to "anon";

grant truncate on table "public"."rota_absences" to "anon";

grant update on table "public"."rota_absences" to "anon";

grant delete on table "public"."rota_absences" to "authenticated";

grant insert on table "public"."rota_absences" to "authenticated";

grant references on table "public"."rota_absences" to "authenticated";

grant select on table "public"."rota_absences" to "authenticated";

grant trigger on table "public"."rota_absences" to "authenticated";

grant truncate on table "public"."rota_absences" to "authenticated";

grant update on table "public"."rota_absences" to "authenticated";

grant delete on table "public"."rota_absences" to "service_role";

grant insert on table "public"."rota_absences" to "service_role";

grant references on table "public"."rota_absences" to "service_role";

grant select on table "public"."rota_absences" to "service_role";

grant trigger on table "public"."rota_absences" to "service_role";

grant truncate on table "public"."rota_absences" to "service_role";

grant update on table "public"."rota_absences" to "service_role";

grant delete on table "public"."rota_shifts" to "anon";

grant insert on table "public"."rota_shifts" to "anon";

grant references on table "public"."rota_shifts" to "anon";

grant select on table "public"."rota_shifts" to "anon";

grant trigger on table "public"."rota_shifts" to "anon";

grant truncate on table "public"."rota_shifts" to "anon";

grant update on table "public"."rota_shifts" to "anon";

grant delete on table "public"."rota_shifts" to "authenticated";

grant insert on table "public"."rota_shifts" to "authenticated";

grant references on table "public"."rota_shifts" to "authenticated";

grant select on table "public"."rota_shifts" to "authenticated";

grant trigger on table "public"."rota_shifts" to "authenticated";

grant truncate on table "public"."rota_shifts" to "authenticated";

grant update on table "public"."rota_shifts" to "authenticated";

grant delete on table "public"."rota_shifts" to "service_role";

grant insert on table "public"."rota_shifts" to "service_role";

grant references on table "public"."rota_shifts" to "service_role";

grant select on table "public"."rota_shifts" to "service_role";

grant trigger on table "public"."rota_shifts" to "service_role";

grant truncate on table "public"."rota_shifts" to "service_role";

grant update on table "public"."rota_shifts" to "service_role";

grant delete on table "public"."site_settings" to "anon";

grant insert on table "public"."site_settings" to "anon";

grant references on table "public"."site_settings" to "anon";

grant select on table "public"."site_settings" to "anon";

grant trigger on table "public"."site_settings" to "anon";

grant truncate on table "public"."site_settings" to "anon";

grant update on table "public"."site_settings" to "anon";

grant delete on table "public"."site_settings" to "authenticated";

grant insert on table "public"."site_settings" to "authenticated";

grant references on table "public"."site_settings" to "authenticated";

grant select on table "public"."site_settings" to "authenticated";

grant trigger on table "public"."site_settings" to "authenticated";

grant truncate on table "public"."site_settings" to "authenticated";

grant update on table "public"."site_settings" to "authenticated";

grant delete on table "public"."site_settings" to "service_role";

grant insert on table "public"."site_settings" to "service_role";

grant references on table "public"."site_settings" to "service_role";

grant select on table "public"."site_settings" to "service_role";

grant trigger on table "public"."site_settings" to "service_role";

grant truncate on table "public"."site_settings" to "service_role";

grant update on table "public"."site_settings" to "service_role";

grant delete on table "public"."sites" to "authenticated";

grant insert on table "public"."sites" to "authenticated";

grant references on table "public"."sites" to "authenticated";

grant select on table "public"."sites" to "authenticated";

grant trigger on table "public"."sites" to "authenticated";

grant truncate on table "public"."sites" to "authenticated";

grant update on table "public"."sites" to "authenticated";

grant delete on table "public"."sites" to "service_role";

grant insert on table "public"."sites" to "service_role";

grant references on table "public"."sites" to "service_role";

grant select on table "public"."sites" to "service_role";

grant trigger on table "public"."sites" to "service_role";

grant truncate on table "public"."sites" to "service_role";

grant update on table "public"."sites" to "service_role";

grant delete on table "public"."staff_login_public" to "anon";

grant insert on table "public"."staff_login_public" to "anon";

grant references on table "public"."staff_login_public" to "anon";

grant select on table "public"."staff_login_public" to "anon";

grant trigger on table "public"."staff_login_public" to "anon";

grant truncate on table "public"."staff_login_public" to "anon";

grant update on table "public"."staff_login_public" to "anon";

grant delete on table "public"."staff_login_public" to "authenticated";

grant insert on table "public"."staff_login_public" to "authenticated";

grant references on table "public"."staff_login_public" to "authenticated";

grant select on table "public"."staff_login_public" to "authenticated";

grant trigger on table "public"."staff_login_public" to "authenticated";

grant truncate on table "public"."staff_login_public" to "authenticated";

grant update on table "public"."staff_login_public" to "authenticated";

grant delete on table "public"."staff_login_public" to "service_role";

grant insert on table "public"."staff_login_public" to "service_role";

grant references on table "public"."staff_login_public" to "service_role";

grant select on table "public"."staff_login_public" to "service_role";

grant trigger on table "public"."staff_login_public" to "service_role";

grant truncate on table "public"."staff_login_public" to "service_role";

grant update on table "public"."staff_login_public" to "service_role";

grant delete on table "public"."staff_profiles" to "authenticated";

grant insert on table "public"."staff_profiles" to "authenticated";

grant references on table "public"."staff_profiles" to "authenticated";

grant select on table "public"."staff_profiles" to "authenticated";

grant trigger on table "public"."staff_profiles" to "authenticated";

grant truncate on table "public"."staff_profiles" to "authenticated";

grant update on table "public"."staff_profiles" to "authenticated";

grant delete on table "public"."staff_profiles" to "service_role";

grant insert on table "public"."staff_profiles" to "service_role";

grant references on table "public"."staff_profiles" to "service_role";

grant select on table "public"."staff_profiles" to "service_role";

grant trigger on table "public"."staff_profiles" to "service_role";

grant truncate on table "public"."staff_profiles" to "service_role";

grant update on table "public"."staff_profiles" to "service_role";


  create policy "areas_admin_manage"
  on "public"."appointment_areas"
  as permissive
  for all
  to authenticated
using ((public.current_staff_role() = 'admin'::text))
with check ((public.current_staff_role() = 'admin'::text));



  create policy "areas_read"
  on "public"."appointment_areas"
  as permissive
  for select
  to authenticated
using (public.is_staff());



  create policy "blocks_admin_mgr_manage"
  on "public"."appointment_blocks"
  as permissive
  for all
  to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());



  create policy "blocks_admin_mgr_select"
  on "public"."appointment_blocks"
  as permissive
  for select
  to authenticated
using ((public.current_staff_role() = ANY (ARRAY['admin'::text, 'manager'::text])));



  create policy "feedback_admin_mgr_read"
  on "public"."appointment_feedback"
  as permissive
  for select
  to authenticated
using (public.is_admin_or_manager());



  create policy "feedback_no_direct_insert"
  on "public"."appointment_feedback"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "types_admin_manage"
  on "public"."appointment_types"
  as permissive
  for all
  to authenticated
using ((public.current_staff_role() = 'admin'::text))
with check ((public.current_staff_role() = 'admin'::text));



  create policy "types_read_active"
  on "public"."appointment_types"
  as permissive
  for select
  to authenticated
using (((is_active = true) AND public.is_staff()));



  create policy "appts_admin_mgr_delete"
  on "public"."appointments"
  as permissive
  for delete
  to authenticated
using (public.is_admin_or_manager());



  create policy "appts_admin_mgr_select"
  on "public"."appointments"
  as permissive
  for select
  to authenticated
using ((public.current_staff_role() = ANY (ARRAY['admin'::text, 'manager'::text])));



  create policy "appts_admin_mgr_update"
  on "public"."appointments"
  as permissive
  for update
  to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());



  create policy "appts_agent_update_claim_complete"
  on "public"."appointments"
  as permissive
  for update
  to authenticated
using ((public.current_staff_role() = 'agent'::text))
with check (((public.current_staff_role() = 'agent'::text) AND ((claimed_by_user_id = auth.uid()) OR ((completed_by_user_id = auth.uid()) AND (claimed_by_user_id = auth.uid())))));



  create policy "appts_staff_insert"
  on "public"."appointments"
  as permissive
  for insert
  to authenticated
with check ((public.is_staff() AND (booked_by_user_id = auth.uid())));



  create policy "canned replies: managers/admin delete"
  on "public"."canned_replies"
  as permissive
  for delete
  to authenticated
using ((public.staff_role() = ANY (ARRAY['manager'::text, 'admin'::text])));



  create policy "canned replies: managers/admin insert"
  on "public"."canned_replies"
  as permissive
  for insert
  to authenticated
with check ((public.staff_role() = ANY (ARRAY['manager'::text, 'admin'::text])));



  create policy "canned replies: managers/admin update"
  on "public"."canned_replies"
  as permissive
  for update
  to authenticated
using ((public.staff_role() = ANY (ARRAY['manager'::text, 'admin'::text])))
with check ((public.staff_role() = ANY (ARRAY['manager'::text, 'admin'::text])));



  create policy "canned replies: staff active, managers all"
  on "public"."canned_replies"
  as permissive
  for select
  to authenticated
using (((public.is_staff() AND (is_active = true)) OR (public.staff_role() = ANY (ARRAY['manager'::text, 'admin'::text]))));



  create policy "chat_branches_read"
  on "public"."chat_branches"
  as permissive
  for select
  to authenticated
using (true);



  create policy "chat_branches_update_admin_manager"
  on "public"."chat_branches"
  as permissive
  for update
  to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());



  create policy "kill_log_insert_admin_manager"
  on "public"."chat_kill_switch_log"
  as permissive
  for insert
  to authenticated
with check (public.is_admin_or_manager());



  create policy "kill_log_read"
  on "public"."chat_kill_switch_log"
  as permissive
  for select
  to authenticated
using (true);



  create policy "admin/manager update chat settings"
  on "public"."chat_settings"
  as permissive
  for update
  to authenticated
using (public.is_admin_or_manager())
with check (public.is_admin_or_manager());



  create policy "staff read chat settings"
  on "public"."chat_settings"
  as permissive
  for select
  to authenticated
using (public.is_staff());



  create policy "anon can read claim intents"
  on "public"."claim_intents"
  as permissive
  for select
  to anon
using (true);



  create policy "conversations_select"
  on "public"."conversations"
  as permissive
  for select
  to authenticated
using ((public.is_admin(( SELECT auth.uid() AS uid)) OR ((status = 'open'::text) AND (assigned_to IS NULL)) OR ((status = 'open'::text) AND (assigned_to = ( SELECT auth.uid() AS uid))) OR ((status = 'closed'::text) AND (handled_by = ( SELECT auth.uid() AS uid)))));



  create policy "conversations_update"
  on "public"."conversations"
  as permissive
  for update
  to authenticated
using ((public.is_admin(( SELECT auth.uid() AS uid)) OR ((status = 'open'::text) AND (assigned_to IS NULL)) OR ((status = 'open'::text) AND (assigned_to = ( SELECT auth.uid() AS uid)))))
with check ((public.is_admin(( SELECT auth.uid() AS uid)) OR ((status = 'open'::text) AND (assigned_to = ( SELECT auth.uid() AS uid)))));



  create policy "messages_insert_staff_in_own_open_conversations_or_admin"
  on "public"."messages"
  as permissive
  for insert
  to authenticated
with check ((public.is_admin(auth.uid()) OR ((sender_type = 'staff'::text) AND (sender_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.status = 'open'::text) AND (c.assigned_to = ( SELECT auth.uid() AS uid))))))));



  create policy "messages_select_visible_conversations_or_admin"
  on "public"."messages"
  as permissive
  for select
  to authenticated
using ((public.is_admin(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (((c.status = 'open'::text) AND (c.assigned_to IS NULL)) OR (c.assigned_to = auth.uid())))))));



  create policy "anon can read notifier"
  on "public"."notifier_conversations"
  as permissive
  for select
  to anon
using (true);



  create policy "rota_absences_read_auth"
  on "public"."rota_absences"
  as permissive
  for select
  to authenticated
using (true);



  create policy "rota_shifts_read_auth"
  on "public"."rota_shifts"
  as permissive
  for select
  to authenticated
using (true);



  create policy "managers/admin update site settings"
  on "public"."site_settings"
  as permissive
  for update
  to public
using ((public.staff_role() = ANY (ARRAY['manager'::text, 'admin'::text])))
with check ((public.staff_role() = ANY (ARRAY['manager'::text, 'admin'::text])));



  create policy "staff read site settings"
  on "public"."site_settings"
  as permissive
  for select
  to public
using (public.is_staff());



  create policy "sites: staff read, managers/admin all"
  on "public"."sites"
  as permissive
  for select
  to authenticated
using ((public.is_staff() OR (public.staff_role() = ANY (ARRAY['manager'::text, 'admin'::text]))));



  create policy "anon can read active staff login list"
  on "public"."staff_login_public"
  as permissive
  for select
  to anon
using ((is_active = true));



  create policy "authenticated can read active staff login list"
  on "public"."staff_login_public"
  as permissive
  for select
  to authenticated
using ((is_active = true));



  create policy "service roles can read staff login list"
  on "public"."staff_login_public"
  as permissive
  for select
  to service_role
using (true);



  create policy "anon can read active staff login fields"
  on "public"."staff_profiles"
  as permissive
  for select
  to anon
using ((is_active = true));



  create policy "read own staff profile"
  on "public"."staff_profiles"
  as permissive
  for select
  to authenticated
using ((user_id = ( SELECT auth.uid() AS uid)));


CREATE TRIGGER trg_types_updated_at BEFORE UPDATE ON public.appointment_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_appts_area_branch BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_area_branch_match();

CREATE TRIGGER trg_appts_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_canned_replies_updated_at BEFORE UPDATE ON public.canned_replies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER chat_settings_updated_at BEFORE UPDATE ON public.chat_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_sync_notifier_conversation AFTER INSERT OR UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.sync_notifier_conversation();

CREATE TRIGGER trg_set_first_customer_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_first_customer_message();

CREATE TRIGGER trg_touch_conversation_last_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_last_message();

CREATE TRIGGER rota_absences_set_updated_at BEFORE UPDATE ON public.rota_absences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER rota_shifts_set_updated_at BEFORE UPDATE ON public.rota_shifts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_sync_staff_login_public AFTER INSERT OR UPDATE OF username, display_name, is_active ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_staff_login_public();


