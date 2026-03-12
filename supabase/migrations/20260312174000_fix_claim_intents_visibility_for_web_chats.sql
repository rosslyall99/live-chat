begin;

drop policy if exists "staff read claim intents" on public.claim_intents;

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
    join public.conversations c
      on c.id = claim_intents.conversation_id
    where sp.user_id = auth.uid()
      and sp.is_active = true
      and sp.site_id = any(coalesce(c.eligible_sites, '{}'::text[]))
  )
);

commit;
