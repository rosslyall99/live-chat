begin;

drop policy if exists "conversations_select" on public.conversations;
drop policy if exists "conversations_update" on public.conversations;
drop policy if exists "messages_select_visible_conversations_or_admin" on public.messages;

create policy "conversations_select"
on public.conversations
as permissive
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or (
    status = 'open'
    and assigned_to = auth.uid()
  )
  or (
    status = 'closed'
    and handled_by = auth.uid()
  )
  or (
    status = 'open'
    and assigned_to is null
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.site_id = any(coalesce(conversations.eligible_sites, '{}'::text[]))
    )
  )
);

create policy "conversations_update"
on public.conversations
as permissive
for update
to authenticated
using (
  public.is_admin(auth.uid())
  or (
    status = 'open'
    and assigned_to = auth.uid()
  )
)
with check (
  public.is_admin(auth.uid())
  or (
    status = 'open'
    and assigned_to = auth.uid()
  )
);

create policy "messages_select_visible_conversations_or_admin"
on public.messages
as permissive
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
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

commit;
