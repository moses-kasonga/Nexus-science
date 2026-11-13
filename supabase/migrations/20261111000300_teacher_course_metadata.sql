-- Métadonnées pédagogiques modifiables dans l'espace de travail enseignant.
alter table public.courses
  add column if not exists subcategory text,
  add column if not exists level text,
  add column if not exists course_type text not null default 'Leçon',
  add column if not exists duration_minutes integer check (duration_minutes is null or duration_minutes > 0);

-- Un élève peut vérifier qu'il a déjà remis sa copie, sans voir celles des autres.
drop policy if exists assessment_attempts_student_read on public.assessment_attempts;
create policy assessment_attempts_student_read on public.assessment_attempts for select to authenticated
using (student_id=auth.uid());
