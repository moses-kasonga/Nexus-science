-- Nettoyage sécurité + performance (audit du 12/11/2026)
-- 1) Droits d'exécution : plus aucune fonction métier appelable par `anon`.
-- 2) Anciennes tables vides et inutilisées par l'application : suppression.
-- 3) Index sur les clés étrangères signalées par le linter Supabase.
-- 4) Politiques RLS : auth.uid() évalué une seule fois par requête.

begin;

-- 1) Droits ---------------------------------------------------------------
revoke execute on function public.publish_homepage_content() from public, anon;
revoke execute on function public.redeem_teacher_invitation(text) from public, anon;
revoke execute on function public.validate_assessment_publication() from public, anon, authenticated;
grant execute on function public.publish_homepage_content() to authenticated;
grant execute on function public.redeem_teacher_invitation(text) to authenticated;

-- 2) Anciennes tables (vérifiées vides ; DROP sans CASCADE : échoue si une dépendance existe)
drop table if exists public.auth_sessions;
drop table if exists public.quiz_submissions;
drop table if exists public.users;

-- 3) Index de clés étrangères ---------------------------------------------
create index if not exists assessment_attempts_student_id_idx on public.assessment_attempts (student_id);
create index if not exists assessment_responses_graded_by_idx on public.assessment_responses (graded_by);
create index if not exists assessment_responses_question_id_idx on public.assessment_responses (question_id);
create index if not exists assessment_results_graded_by_idx on public.assessment_results (graded_by);
create index if not exists assessment_results_student_id_idx on public.assessment_results (student_id);
create index if not exists assessments_created_by_idx on public.assessments (created_by);
create index if not exists candidate_applications_reviewed_by_idx on public.candidate_applications (reviewed_by);
create index if not exists course_schedules_created_by_idx on public.course_schedules (created_by);
create index if not exists course_teachers_teacher_id_idx on public.course_teachers (teacher_id);
create index if not exists enrollments_granted_by_idx on public.enrollments (granted_by);
create index if not exists enrollments_student_id_idx on public.enrollments (student_id);
create index if not exists homepage_content_drafts_updated_by_idx on public.homepage_content_drafts (updated_by);
create index if not exists homepage_content_published_published_by_idx on public.homepage_content_published (published_by);
create index if not exists lesson_assets_course_id_idx on public.lesson_assets (course_id);
create index if not exists lesson_assets_created_by_idx on public.lesson_assets (created_by);
create index if not exists lesson_assets_lesson_course_idx on public.lesson_assets (lesson_id, course_id);
create index if not exists teacher_applications_reviewed_by_idx on public.teacher_applications (reviewed_by);
create index if not exists teacher_invitations_created_by_idx on public.teacher_invitations (created_by);

-- 4) Politiques RLS : (select auth.uid()) -----------------------------------
alter policy "profiles_select_own" on public.profiles using (id = (select auth.uid()));
alter policy "profiles_update_own" on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy "course_teachers_select_own" on public.course_teachers using (teacher_id = (select auth.uid()));
alter policy "enrollments_select_own" on public.enrollments using (student_id = (select auth.uid()));
alter policy "candidate_applications_select_own" on public.candidate_applications using (user_id = (select auth.uid()));
alter policy "assessment_attempts_student_read" on public.assessment_attempts using (student_id = (select auth.uid()));
alter policy "teacher_applications_select_own" on public.teacher_applications using (user_id = (select auth.uid()));
alter policy "teacher_applications_insert_own" on public.teacher_applications
  with check (user_id = (select auth.uid()) and status = 'pending'::text and validate_teacher_invitation(invitation_id));
alter policy "teacher_applications_update_own_pending" on public.teacher_applications
  using (user_id = (select auth.uid()) and status = 'pending'::text)
  with check (user_id = (select auth.uid()) and status = 'pending'::text);

alter policy "admin_delete_schedules" on public.course_schedules
  using (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'::text));
alter policy "admin_insert_schedules" on public.course_schedules
  with check (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'::text));
alter policy "admin_update_schedules" on public.course_schedules
  using (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'::text))
  with check (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'admin'::text));
alter policy "authenticated_read_schedules" on public.course_schedules
  using (status = 'published'::text or exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = any (array['teacher'::text, 'admin'::text])));

alter policy "results_select_own" on public.assessment_results
  using (student_id = (select auth.uid()) and exists (select 1 from assessments a where a.id = assessment_results.assessment_id and a.published and a.results_published));
alter policy "assessment_responses_student_read" on public.assessment_responses
  using (exists (select 1 from assessment_attempts at join assessments a on a.id = at.assessment_id
                 where at.id = assessment_responses.attempt_id and at.student_id = (select auth.uid()) and a.published and a.results_published));
alter policy "lesson_assets_teacher_insert" on public.lesson_assets
  with check (created_by = (select auth.uid()) and (is_admin() or is_assigned_teacher(course_id))
              and exists (select 1 from lessons l where l.id = lesson_assets.lesson_id and l.course_id = lesson_assets.course_id));

commit;
