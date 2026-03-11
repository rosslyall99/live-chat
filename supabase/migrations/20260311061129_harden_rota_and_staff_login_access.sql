begin;

drop policy if exists "rota_absences_read_auth" on public.rota_absences;
drop policy if exists "rota_shifts_read_auth" on public.rota_shifts;

create policy "rota_absences_read_auth"
on public.rota_absences
as permissive
for select
to authenticated
using (public.is_staff());

create policy "rota_shifts_read_auth"
on public.rota_shifts
as permissive
for select
to authenticated
using (public.is_staff());

revoke select on public.rota_absences from anon;
revoke select on public.rota_shifts from anon;

drop policy if exists "anon can read active staff login list" on public.staff_login_public;
drop policy if exists "authenticated can read active staff login list" on public.staff_login_public;

revoke select on public.staff_login_public from anon;
revoke select on public.staff_login_public from authenticated;

grant select on public.staff_login_list to anon;
grant select on public.staff_login_list to authenticated;

drop policy if exists "anon can read active staff login fields" on public.staff_profiles;

commit;
