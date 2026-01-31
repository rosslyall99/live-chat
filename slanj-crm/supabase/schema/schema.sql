-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.canned_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_id text,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  CONSTRAINT canned_replies_pkey PRIMARY KEY (id),
  CONSTRAINT canned_replies_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  assigned_to uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_message_at timestamp with time zone NOT NULL DEFAULT now(),
  customer_name text NOT NULL,
  customer_email text,
  customer_token uuid NOT NULL DEFAULT gen_random_uuid(),
  closed_at timestamp with time zone,
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id),
  CONSTRAINT conversations_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_type text NOT NULL,
  sender_user_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id),
  CONSTRAINT messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.site_settings (
  site_id text NOT NULL,
  manual_status text NOT NULL DEFAULT 'online'::text,
  opening_hours jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_pkey PRIMARY KEY (site_id),
  CONSTRAINT site_settings_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id)
);
CREATE TABLE public.sites (
  id text NOT NULL,
  name text NOT NULL,
  notify_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sites_pkey PRIMARY KEY (id)
);
CREATE TABLE public.staff_profiles (
  user_id uuid NOT NULL,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  site_id text NOT NULL,
  role text NOT NULL DEFAULT 'agent'::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT staff_profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT staff_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT staff_profiles_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id)
);