begin;

drop policy if exists "allow_insert_chat_rating" on public.chat_ratings;

create policy "allow_insert_chat_rating"
on public.chat_ratings
as permissive
for insert
to anon, authenticated
with check (
  conversation_id is not null
  and rating is not null
  and rating between 1 and 5
  and exists (
    select 1
    from public.conversations c
    where c.id = chat_ratings.conversation_id
      and c.status = 'closed'
  )
);

revoke select, update, delete on public.chat_ratings from anon;
revoke update, delete on public.chat_ratings from authenticated;

commit;
