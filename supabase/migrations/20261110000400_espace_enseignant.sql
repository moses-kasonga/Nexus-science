-- Espace enseignant : un enseignant voit ses propres affectations et les profils des élèves inscrits à SES cours (et seulement eux).
-- Testé en simulation (transaction annulée) le 2026-11-10.
drop policy if exists course_teachers_select_own on public.course_teachers;
create policy course_teachers_select_own on public.course_teachers
  as permissive for select to authenticated using (teacher_id = auth.uid());

create or replace function public.teaches_student(p_student uuid)
 returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    join public.course_teachers ct on ct.course_id = e.course_id
    where e.student_id = p_student and ct.teacher_id = auth.uid()
  );
$$;
revoke all on function public.teaches_student(uuid) from public, anon;
grant execute on function public.teaches_student(uuid) to authenticated;

drop policy if exists profiles_select_my_students on public.profiles;
create policy profiles_select_my_students on public.profiles
  as permissive for select to authenticated using ((select public.teaches_student(id)));
