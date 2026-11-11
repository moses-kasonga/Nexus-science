-- Évaluations : l'enseignant titulaire crée les évaluations de sa formation et saisit les notes ;
-- l'administration suit l'ensemble ; l'élève voit ses résultats une fois publiés.
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text,
  kind text not null default 'devoir' check (kind in ('quiz', 'devoir', 'examen')),
  max_score numeric(6,2) not null default 20 check (max_score > 0),
  due_date date,
  published boolean not null default false,
  results_published boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessments_course_idx on public.assessments(course_id);

create table if not exists public.assessment_results (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  score numeric(6,2) check (score >= 0),
  comment text,
  graded_by uuid references auth.users(id),
  graded_at timestamptz not null default now(),
  primary key (assessment_id, student_id)
);

alter table public.assessments enable row level security;
alter table public.assessment_results enable row level security;
revoke all on public.assessments, public.assessment_results from anon, authenticated;
grant select, insert, update, delete on public.assessments to authenticated;
grant select on public.assessment_results to authenticated;  -- les notes s'écrivent uniquement par save_assessment_result

-- Évaluations
create policy assessments_select_student on public.assessments for select to authenticated
  using (published = true and (select public.has_course_access(course_id)));
create policy assessments_select_teacher on public.assessments for select to authenticated
  using ((select public.is_course_teacher(course_id)));
create policy assessments_select_admin on public.assessments for select to authenticated
  using ((select public.is_admin()));
create policy assessments_insert_teacher on public.assessments for insert to authenticated
  with check ((select public.is_assigned_teacher(course_id)));
create policy assessments_update_teacher on public.assessments for update to authenticated
  using ((select public.is_assigned_teacher(course_id))) with check ((select public.is_assigned_teacher(course_id)));
create policy assessments_delete_teacher on public.assessments for delete to authenticated
  using ((select public.is_assigned_teacher(course_id)));
create policy assessments_insert_admin on public.assessments for insert to authenticated
  with check ((select public.is_admin()));
create policy assessments_update_admin on public.assessments for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy assessments_delete_admin on public.assessments for delete to authenticated
  using ((select public.is_admin()));

-- Résultats (lecture seule côté API)
create policy results_select_own on public.assessment_results for select to authenticated
  using (student_id = auth.uid() and exists (
    select 1 from public.assessments a where a.id = assessment_id and a.published and a.results_published));
create policy results_select_teacher on public.assessment_results for select to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id and (select public.is_course_teacher(a.course_id))));
create policy results_select_admin on public.assessment_results for select to authenticated
  using ((select public.is_admin()));

create or replace function public.save_assessment_result(
  p_assessment_id uuid, p_student_id uuid, p_score numeric, p_comment text)
 returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_course uuid;
  v_max numeric;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select course_id, max_score into v_course, v_max from public.assessments where id = p_assessment_id;
  if v_course is null then raise exception 'Évaluation introuvable'; end if;
  if not (public.is_admin() or public.is_assigned_teacher(v_course)) then
    raise exception 'Réservé à l''enseignant titulaire de la formation ou à l''administration';
  end if;
  if not exists (select 1 from public.enrollments e
                 where e.course_id = v_course and e.student_id = p_student_id and e.status = 'active') then
    raise exception 'Cet élève n''est pas inscrit à cette formation';
  end if;
  if p_score is not null and (p_score < 0 or p_score > v_max) then
    raise exception 'La note doit être comprise entre 0 et %', v_max;
  end if;
  insert into public.assessment_results (assessment_id, student_id, score, comment, graded_by, graded_at)
  values (p_assessment_id, p_student_id, p_score, left(nullif(btrim(p_comment), ''), 1000), auth.uid(), now())
  on conflict (assessment_id, student_id) do update
    set score = excluded.score, comment = excluded.comment, graded_by = auth.uid(), graded_at = now();
end;
$$;
revoke all on function public.save_assessment_result(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.save_assessment_result(uuid, uuid, numeric, text) to authenticated;
