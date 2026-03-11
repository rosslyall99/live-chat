begin;

create or replace view public.staff_login_list as
select
  slp.username,
  slp.display_name,
  null::text as site_id,
  null::uuid as user_id
from public.staff_login_public slp
where slp.is_active = true;

grant select on public.staff_login_list to anon;
grant select on public.staff_login_list to authenticated;

commit;
