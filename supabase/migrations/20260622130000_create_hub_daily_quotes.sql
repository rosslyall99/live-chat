begin;

create table if not exists public.hub_daily_quotes (
  quote_date date primary key,
  quote_text text not null,
  quote_author text,
  source text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.hub_daily_quotes enable row level security;

drop trigger if exists trg_hub_daily_quotes_updated_at on public.hub_daily_quotes;
create trigger trg_hub_daily_quotes_updated_at
before update on public.hub_daily_quotes
for each row execute function public.set_updated_at();

comment on table public.hub_daily_quotes is
  'Daily login quote cache. Read and written by the get-daily-login-quote Edge Function using the service role; no direct public access.';

comment on column public.hub_daily_quotes.quote_date is
  'Europe/London calendar date for the cached login quote.';

commit;
