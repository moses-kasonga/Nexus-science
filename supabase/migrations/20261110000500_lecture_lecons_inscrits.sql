-- Un élève inscrit lit les leçons PUBLIÉES de sa formation ; les brouillons restent réservés à l'enseignant titulaire et à l'administration.
-- Avant cette migration, le filtre « publiée » n'existait que dans l'interface : l'API laissait un inscrit lire aussi les brouillons.
-- Testé en simulation (transaction annulée) le 2026-11-10 : non inscrit 0, inscrit 1 (publiée), accès retiré 0, titulaire 2, visiteur 0.
drop policy if exists lessons_select_access on public.lessons;

drop policy if exists lessons_select_published on public.lessons;
create policy lessons_select_published on public.lessons
  as permissive for select to authenticated
  using (published = true and (select public.has_course_access(course_id)));

drop policy if exists lessons_select_teacher on public.lessons;
create policy lessons_select_teacher on public.lessons
  as permissive for select to authenticated
  using ((select public.is_course_teacher(course_id)));
