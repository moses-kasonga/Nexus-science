-- Close assessment submissions once results have been published.
-- Locks the assessment row before evaluating the publication/deadline state,
-- serializing this check against the assessment publication transition.

begin;

create or replace function public.submit_assessment_answers(
  p_assessment_id uuid,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student uuid := auth.uid();
  v_role text;
  v_attempt uuid;
  v_assessment public.assessments%rowtype;
  v_answer jsonb;
  v_question public.assessment_questions%rowtype;
  v_selected uuid[];
  v_correct uuid[];
  v_awarded numeric(6,2);
begin
  if v_student is null then
    raise exception 'Connexion requise';
  end if;

  select p.role
    into v_role
  from public.profiles p
  where p.id = v_student;

  if v_role is distinct from 'student' then
    raise exception 'Seuls les comptes étudiants peuvent soumettre une évaluation';
  end if;

  select *
    into v_assessment
  from public.assessments
  where id = p_assessment_id
  for update;

  if not found or not v_assessment.published then
    raise exception 'Évaluation indisponible';
  end if;

  if v_assessment.results_published then
    raise exception 'La soumission est fermée car les résultats de cette évaluation ont été publiés';
  end if;

  if v_assessment.due_date is not null
     and v_assessment.due_date < current_date then
    raise exception 'La date limite de cette évaluation est dépassée';
  end if;

  if not exists (
    select 1
    from public.enrollments e
    where e.course_id = v_assessment.course_id
      and e.student_id = v_student
      and e.status = 'active'
  ) then
    raise exception 'Inscription active requise';
  end if;

  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Format des réponses invalide';
  end if;

  if exists (
    select 1
    from public.assessment_attempts
    where assessment_id = p_assessment_id
      and student_id = v_student
  ) then
    raise exception 'Cette évaluation a déjà été soumise';
  end if;

  insert into public.assessment_attempts (assessment_id, student_id)
  values (p_assessment_id, v_student)
  returning id into v_attempt;

  for v_answer in
    select value from jsonb_array_elements(p_answers)
  loop
    select *
      into v_question
    from public.assessment_questions
    where id = (v_answer->>'question_id')::uuid
      and assessment_id = p_assessment_id;

    if not found then
      raise exception 'Question invalide';
    end if;

    if v_question.question_type = 'multiple_choice' then
      if not v_assessment.allow_multiple_choice then
        raise exception 'Les choix multiples sont désactivés';
      end if;

      select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[])
        into v_selected
      from jsonb_array_elements_text(
        coalesce(v_answer->'selected_option_ids', '[]'::jsonb)
      );

      if exists (
        select 1
        from unnest(v_selected) x
        where not exists (
          select 1
          from public.assessment_options o
          where o.id = x
            and o.question_id = v_question.id
        )
      ) then
        raise exception 'Option invalide';
      end if;

      select k.correct_option_ids
        into v_correct
      from public.assessment_answer_keys k
      where k.question_id = v_question.id;

      if v_correct is null then
        v_correct := '{}'::uuid[];
      end if;

      if (
        select coalesce(array_agg(x order by x), '{}'::uuid[])
        from unnest(v_correct) x
      ) = (
        select coalesce(array_agg(x order by x), '{}'::uuid[])
        from unnest(v_selected) x
      ) then
        v_awarded := v_question.points;
      else
        v_awarded := 0;
      end if;

      insert into public.assessment_responses (
        attempt_id, question_id, selected_option_ids, points_awarded
      )
      values (
        v_attempt, v_question.id, v_selected, v_awarded
      );
    else
      if not v_assessment.allow_written then
        raise exception 'Les réponses écrites sont désactivées';
      end if;

      insert into public.assessment_responses (
        attempt_id, question_id, written_answer
      )
      values (
        v_attempt,
        v_question.id,
        left(coalesce(v_answer->>'written_answer', ''), 10000)
      );
    end if;
  end loop;

  if exists (
    select 1
    from public.assessment_questions q
    where q.assessment_id = p_assessment_id
      and not exists (
        select 1
        from public.assessment_responses r
        where r.attempt_id = v_attempt
          and r.question_id = q.id
      )
  ) then
    raise exception 'Toutes les questions doivent recevoir une réponse';
  end if;

  insert into public.assessment_results (assessment_id, student_id, score, comment)
  select
    p_assessment_id,
    v_student,
    case
      when exists (
        select 1
        from public.assessment_responses r
        where r.attempt_id = v_attempt
          and r.points_awarded is null
      ) then null
      else coalesce(sum(r.points_awarded), 0)
    end,
    null
  from public.assessment_responses r
  where r.attempt_id = v_attempt;
end;
$function$;

revoke all on function public.submit_assessment_answers(uuid, jsonb) from public, anon;
grant execute on function public.submit_assessment_answers(uuid, jsonb) to authenticated;

commit;