begin;

drop policy if exists "staff read notifier conversations" on public.notifier_conversations;

create policy "staff read notifier conversations"
on public.notifier_conversations
as permissive
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or assigned_to = auth.uid()
  or (
    status = 'open'
    and assigned_to is null
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.site_id = any(coalesce(notifier_conversations.eligible_sites, '{}'::text[]))
    )
  )
);

drop policy if exists "staff_read_chat_ratings" on public.chat_ratings;
drop policy if exists "allow_insert_chat_rating" on public.chat_ratings;

create policy "staff_read_chat_ratings"
on public.chat_ratings
as permissive
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.conversations c
    where c.id = chat_ratings.conversation_id
      and (
        (
          c.status = 'open'
          and c.assigned_to = auth.uid()
        )
        or (
          c.status = 'closed'
          and c.handled_by = auth.uid()
        )
        or (
          c.status = 'open'
          and c.assigned_to is null
          and exists (
            select 1
            from public.staff_profiles sp
            where sp.user_id = auth.uid()
              and sp.is_active = true
              and sp.site_id = any(coalesce(c.eligible_sites, '{}'::text[]))
          )
        )
      )
  )
);

revoke insert on public.chat_ratings from anon;
revoke insert on public.chat_ratings from authenticated;

revoke insert, update, delete on public.notifier_conversations from anon;
revoke insert, update, delete on public.notifier_conversations from authenticated;

revoke insert, update, delete on public.claim_intents from anon;
revoke insert, update, delete on public.claim_intents from authenticated;

commit;
