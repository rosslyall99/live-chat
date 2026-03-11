begin;

drop policy if exists "anon can read notifier" on public.notifier_conversations;
drop policy if exists "anon can read claim intents" on public.claim_intents;

revoke select on public.notifier_conversations from anon;
revoke select on public.claim_intents from anon;

create policy "staff read notifier conversations"
on public.notifier_conversations
as permissive
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.is_active = true
  )
);

create policy "staff read claim intents"
on public.claim_intents
as permissive
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.is_active = true
      and sp.site_id = claim_intents.site_id
  )
);

commit;