begin;

create or replace view public.staff_login_list as
select
  slp.username,
  slp.display_name,
  sp.site_id,
  null::uuid as user_id,
  sp.site_id as login_branch
from public.staff_login_public slp
left join public.staff_profiles sp
  on sp.username = slp.username
  and sp.is_active = true
where slp.is_active = true;

grant select on public.staff_login_list to anon;
grant select on public.staff_login_list to authenticated;

comment on view public.staff_login_list is
  'Safe public login list for HUB sign-in. Exposes username/display_name plus non-secret site_id/login_branch for branch grouping; user_id remains hidden.';

commit;
