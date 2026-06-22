begin;

alter table public.staff_profiles
  add column if not exists login_group text;

comment on column public.staff_profiles.login_group is
  'Optional login UI grouping override for HUB sign-in. When null, staff_login_list falls back to site_id.';

update public.staff_profiles
set login_group = 'hire'
where username in ('hire-clare', 'hire-hannah', 'hire-mitch', 'duke-cat');

update public.staff_profiles
set login_group = 'off'
where username = 'duke-ross';

create index if not exists staff_profiles_login_group_idx
  on public.staff_profiles (login_group);

create or replace view public.staff_login_list as
select
  slp.username,
  slp.display_name,
  sp.site_id,
  null::uuid as user_id,
  coalesce(nullif(lower(trim(sp.login_group)), ''), sp.site_id) as login_branch
from public.staff_login_public slp
left join public.staff_profiles sp
  on sp.username = slp.username
  and sp.is_active = true
where slp.is_active = true;

grant select on public.staff_login_list to anon;
grant select on public.staff_login_list to authenticated;

comment on view public.staff_login_list is
  'Safe public login list for HUB sign-in. Exposes username/display_name plus non-secret site_id and login_branch for login grouping. login_branch prefers staff_profiles.login_group, then site_id; user_id remains hidden.';

commit;
