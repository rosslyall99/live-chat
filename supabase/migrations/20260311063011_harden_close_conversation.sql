begin;

create or replace function public.close_conversation(p_conversation_id uuid)
returns setof public.conversations
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_role text;
begin
  if v_uid is null then
    return;
  end if;

  select
    coalesce(sp.display_name, sp.username),
    sp.role
  into
    v_name,
    v_role
  from public.staff_profiles sp
  where sp.user_id = v_uid
    and sp.is_active = true
  limit 1;

  if v_name is null or v_role is null then
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
     and (
       v_role = 'admin'
       or c.assigned_to = v_uid
     )
  returning c.*;
end;
$function$;

commit;
