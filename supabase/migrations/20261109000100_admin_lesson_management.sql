-- NEXUS SCIENCE: administration des leçons
-- À appliquer manuellement après vérification sur le projet Supabase ciblé.
-- Cette migration n'est PAS exécutée automatiquement par ce commit.
-- Le contrôle d'administration réutilise le helper is_admin() déjà présent
-- dans le schéma de base, au lieu de dupliquer une lecture de profiles.

alter table public.lessons
  add column if not exists published boolean not null default true;

drop policy if exists lessons_admin_select_all on public.lessons;
create policy lessons_admin_select_all
on public.lessons
for select
to authenticated
using ((select public.is_admin()));

drop policy if exists lessons_admin_insert on public.lessons;
create policy lessons_admin_insert
on public.lessons
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists lessons_admin_update on public.lessons;
create policy lessons_admin_update
on public.lessons
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists lessons_admin_delete on public.lessons;
create policy lessons_admin_delete
on public.lessons
for delete
to authenticated
using ((select public.is_admin()));
