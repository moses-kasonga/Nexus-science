-- Un administrateur doit pouvoir chercher un élève ou voir le nom d'un candidat enseignant.
-- La fonction est « security definer » pour éviter une récursion avec les règles de la table profiles.
-- Testée en simulation (transaction annulée) le 2026-11-08 : l'administrateur voit les profils, un inconnu n'en voit aucun.
create or replace function public.current_user_is_admin()
 returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

create policy profiles_select_admin on public.profiles
  as permissive for select to authenticated
  using ((select public.current_user_is_admin()));
