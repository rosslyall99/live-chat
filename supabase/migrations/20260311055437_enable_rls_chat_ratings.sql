alter table public.chat_ratings enable row level security;

create policy "allow_insert_chat_rating"
on public.chat_ratings
for insert
to anon, authenticated
with check (true);

create policy "staff_read_chat_ratings"
on public.chat_ratings
for select
to authenticated
using (public.is_admin(auth.uid()) or exists (
  select 1
  from public.staff_profiles sp
  where sp.user_id = auth.uid()
));