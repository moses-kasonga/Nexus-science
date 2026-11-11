-- Évaluations enrichies : questions à choix, réponses écrites et corrigés privés.
alter table public.assessments
  add column if not exists allow_multiple_choice boolean not null default true,
  add column if not exists allow_written boolean not null default false;

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 5000),
  question_type text not null check (question_type in ('multiple_choice', 'written')),
  points numeric(6,2) not null default 1 check (points > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists assessment_questions_order_idx on public.assessment_questions(assessment_id, position);

create table if not exists public.assessment_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 2000),
  position integer not null default 0
);
create index if not exists assessment_options_order_idx on public.assessment_options(question_id, position);

-- Les clés de correction sont isolées des données lisibles par les élèves.
create table if not exists public.assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  correct_option_ids uuid[] not null default '{}',
  expected_text text,
  explanation text
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (assessment_id, student_id)
);

create table if not exists public.assessment_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  selected_option_ids uuid[] not null default '{}',
  written_answer text,
  points_awarded numeric(6,2),
  teacher_feedback text,
  graded_by uuid references auth.users(id),
  graded_at timestamptz,
  unique (attempt_id, question_id)
);

alter table public.assessment_questions enable row level security;
alter table public.assessment_options enable row level security;
alter table public.assessment_answer_keys enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_responses enable row level security;

revoke all on public.assessment_questions, public.assessment_options, public.assessment_answer_keys,
  public.assessment_attempts, public.assessment_responses from anon, authenticated;
grant select, insert, update, delete on public.assessment_questions, public.assessment_options,
  public.assessment_answer_keys to authenticated;
grant select on public.assessment_attempts, public.assessment_responses to authenticated;

drop policy if exists assessment_questions_read_access on public.assessment_questions;
create policy assessment_questions_read_access on public.assessment_questions for select to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and
  (public.is_admin() or public.is_course_teacher(a.course_id) or (a.published and public.has_course_access(a.course_id)))));
drop policy if exists assessment_questions_teacher_write on public.assessment_questions;
create policy assessment_questions_teacher_write on public.assessment_questions for all to authenticated
using (exists (select 1 from public.assessments a where a.id = assessment_id and (public.is_admin() or public.is_assigned_teacher(a.course_id))))
with check (exists (select 1 from public.assessments a where a.id = assessment_id and (public.is_admin() or public.is_assigned_teacher(a.course_id))));

drop policy if exists assessment_options_read_access on public.assessment_options;
create policy assessment_options_read_access on public.assessment_options for select to authenticated
using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id=q.assessment_id
  where q.id=question_id and (public.is_admin() or public.is_course_teacher(a.course_id) or (a.published and public.has_course_access(a.course_id)))));
drop policy if exists assessment_options_teacher_write on public.assessment_options;
create policy assessment_options_teacher_write on public.assessment_options for all to authenticated
using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id=q.assessment_id
  where q.id=question_id and (public.is_admin() or public.is_assigned_teacher(a.course_id))))
with check (exists (select 1 from public.assessment_questions q join public.assessments a on a.id=q.assessment_id
  where q.id=question_id and (public.is_admin() or public.is_assigned_teacher(a.course_id))));

drop policy if exists assessment_keys_teacher_only on public.assessment_answer_keys;
create policy assessment_keys_teacher_only on public.assessment_answer_keys for all to authenticated
using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id=q.assessment_id
  where q.id=question_id and (public.is_admin() or public.is_assigned_teacher(a.course_id))))
with check (exists (select 1 from public.assessment_questions q join public.assessments a on a.id=q.assessment_id
  where q.id=question_id and (public.is_admin() or public.is_assigned_teacher(a.course_id))));

drop policy if exists assessment_attempts_teacher_read on public.assessment_attempts;
create policy assessment_attempts_teacher_read on public.assessment_attempts for select to authenticated
using (exists (select 1 from public.assessments a where a.id=assessment_id and (public.is_admin() or public.is_course_teacher(a.course_id))));
drop policy if exists assessment_attempts_student_read on public.assessment_attempts;
create policy assessment_attempts_student_read on public.assessment_attempts for select to authenticated
using (student_id=auth.uid() and exists (select 1 from public.assessments a where a.id=assessment_id and a.published and a.results_published));

drop policy if exists assessment_responses_teacher_read on public.assessment_responses;
create policy assessment_responses_teacher_read on public.assessment_responses for select to authenticated
using (exists (select 1 from public.assessment_attempts at join public.assessments a on a.id=at.assessment_id
  where at.id=attempt_id and (public.is_admin() or public.is_course_teacher(a.course_id))));
drop policy if exists assessment_responses_student_read on public.assessment_responses;
create policy assessment_responses_student_read on public.assessment_responses for select to authenticated
using (exists (select 1 from public.assessment_attempts at join public.assessments a on a.id=at.assessment_id
  where at.id=attempt_id and at.student_id=auth.uid() and a.published and a.results_published));

-- Soumission atomique : les réponses correctes ne sont jamais retournées à l'élève.
create or replace function public.submit_assessment_answers(p_assessment_id uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_attempt uuid;
  v_assessment public.assessments%rowtype;
  v_answer jsonb;
  v_question public.assessment_questions%rowtype;
  v_selected uuid[];
  v_correct uuid[];
  v_awarded numeric(6,2);
  v_expected_count integer;
begin
  if v_student is null then raise exception 'Connexion requise'; end if;
  select * into v_assessment from public.assessments where id=p_assessment_id and published=true;
  if not found then raise exception 'Évaluation indisponible'; end if;
  if not exists (select 1 from public.enrollments e where e.course_id=v_assessment.course_id and e.student_id=v_student and e.status='active') then
    raise exception 'Inscription active requise';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then raise exception 'Format des réponses invalide'; end if;
  if exists (select 1 from public.assessment_attempts where assessment_id=p_assessment_id and student_id=v_student) then
    raise exception 'Cette évaluation a déjà été soumise';
  end if;
  insert into public.assessment_attempts(assessment_id,student_id) values(p_assessment_id,v_student) returning id into v_attempt;
  for v_answer in select value from jsonb_array_elements(p_answers)
  loop
    select * into v_question from public.assessment_questions where id=(v_answer->>'question_id')::uuid and assessment_id=p_assessment_id;
    if not found then raise exception 'Question invalide'; end if;
    if v_question.question_type='multiple_choice' then
      if not v_assessment.allow_multiple_choice then raise exception 'Les choix multiples sont désactivés'; end if;
      select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[]) into v_selected
      from jsonb_array_elements_text(coalesce(v_answer->'selected_option_ids','[]'::jsonb));
      if exists (select 1 from unnest(v_selected) x where not exists(select 1 from public.assessment_options o where o.id=x and o.question_id=v_question.id)) then
        raise exception 'Option invalide';
      end if;
      select correct_option_ids into v_correct from public.assessment_answer_keys where question_id=v_question.id;
      select count(*) into v_expected_count from public.assessment_options where question_id=v_question.id;
      if v_correct is null then v_correct := '{}'; end if;
      if (select coalesce(array_agg(x order by x),'{}'::uuid[]) from unnest(v_correct) x)
         = (select coalesce(array_agg(x order by x),'{}'::uuid[]) from unnest(v_selected) x) then
        v_awarded := v_question.points;
      else v_awarded := 0; end if;
      insert into public.assessment_responses(attempt_id,question_id,selected_option_ids,points_awarded)
      values(v_attempt,v_question.id,v_selected,v_awarded);
    else
      if not v_assessment.allow_written then raise exception 'Les réponses écrites sont désactivées'; end if;
      insert into public.assessment_responses(attempt_id,question_id,written_answer)
      values(v_attempt,v_question.id,left(coalesce(v_answer->>'written_answer',''),10000));
    end if;
  end loop;
  if exists(select 1 from public.assessment_questions q where q.assessment_id=p_assessment_id
    and not exists(select 1 from public.assessment_responses r where r.attempt_id=v_attempt and r.question_id=q.id)) then
    raise exception 'Toutes les questions doivent recevoir une réponse';
  end if;
  insert into public.assessment_results(assessment_id,student_id,score,comment)
  select p_assessment_id,v_student,coalesce(sum(points_awarded),0),null
  from public.assessment_responses where attempt_id=v_attempt and points_awarded is not null;
end;
$$;
revoke all on function public.submit_assessment_answers(uuid,jsonb) from public,anon;
grant execute on function public.submit_assessment_answers(uuid,jsonb) to authenticated;

-- Corrigé détaillé : uniquement après publication des résultats et uniquement pour l'élève connecté.
create or replace function public.get_my_assessment_review(p_assessment_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_student uuid := auth.uid(); v_attempt uuid; v_data jsonb;
begin
  if v_student is null then raise exception 'Connexion requise'; end if;
  if not exists(select 1 from public.assessments where id=p_assessment_id and published and results_published) then
    raise exception 'Le corrigé n''est pas encore disponible';
  end if;
  select id into v_attempt from public.assessment_attempts where assessment_id=p_assessment_id and student_id=v_student;
  if v_attempt is null then raise exception 'Aucune copie trouvée'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'question_id',q.id,'prompt',q.prompt,'question_type',q.question_type,'points',q.points,
    'options',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) order by o.position),'[]'::jsonb) from public.assessment_options o where o.question_id=q.id),
    'selected_option_ids',r.selected_option_ids,'written_answer',r.written_answer,
    'points_awarded',r.points_awarded,'teacher_feedback',r.teacher_feedback,
    'correct_option_ids',k.correct_option_ids,'expected_text',k.expected_text,'explanation',k.explanation
  ) order by q.position),'[]'::jsonb) into v_data
  from public.assessment_questions q
  left join public.assessment_responses r on r.question_id=q.id and r.attempt_id=v_attempt
  left join public.assessment_answer_keys k on k.question_id=q.id
  where q.assessment_id=p_assessment_id;
  return v_data;
end;
$$;
revoke all on function public.get_my_assessment_review(uuid) from public,anon;
grant execute on function public.get_my_assessment_review(uuid) to authenticated;


-- Correction des réponses écrites par l'enseignant ; le total est recalculé côté serveur.
create or replace function public.grade_assessment_written_response(
  p_response_id uuid, p_points numeric, p_feedback text default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_course uuid; v_question_points numeric; v_attempt uuid; v_assessment uuid; v_student uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  select a.course_id,q.points,r.attempt_id,at.assessment_id,at.student_id
    into v_course,v_question_points,v_attempt,v_assessment,v_student
  from public.assessment_responses r
  join public.assessment_questions q on q.id=r.question_id
  join public.assessment_attempts at on at.id=r.attempt_id
  join public.assessments a on a.id=at.assessment_id
  where r.id=p_response_id and q.question_type='written';
  if v_course is null then raise exception 'Réponse écrite introuvable'; end if;
  if not (public.is_admin() or public.is_assigned_teacher(v_course)) then
    raise exception 'Correction réservée à l''enseignant titulaire';
  end if;
  if p_points is null or p_points < 0 or p_points > v_question_points then
    raise exception 'La note doit être comprise entre 0 et %',v_question_points;
  end if;
  update public.assessment_responses set points_awarded=p_points,
    teacher_feedback=left(nullif(btrim(p_feedback),''),2000),graded_by=auth.uid(),graded_at=now()
  where id=p_response_id;
  update public.assessment_results ar set score=(
    select coalesce(sum(r.points_awarded),0) from public.assessment_responses r where r.attempt_id=v_attempt
  ),graded_by=auth.uid(),graded_at=now()
  where ar.assessment_id=v_assessment and ar.student_id=v_student
    and not exists(select 1 from public.assessment_responses r where r.attempt_id=v_attempt and r.points_awarded is null);
end;
$$;
revoke all on function public.grade_assessment_written_response(uuid,numeric,text) from public,anon;
grant execute on function public.grade_assessment_written_response(uuid,numeric,text) to authenticated;
