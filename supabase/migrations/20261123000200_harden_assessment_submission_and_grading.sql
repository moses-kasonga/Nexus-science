-- Security remediation: enforce assessment role, deadline and publication locks.
-- A single profile role is authoritative: only student profiles may submit.
-- Assessment row locks serialize submissions/grading against publication.

CREATE OR REPLACE FUNCTION public.submit_assessment_answers(
  p_assessment_id uuid,
  p_answers jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_role text;
  v_attempt uuid;
  v_assessment public.assessments%rowtype;
  v_answer jsonb;
  v_question public.assessment_questions%rowtype;
  v_selected uuid[];
  v_correct uuid[];
  v_awarded numeric(6,2);
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Connexion requise';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_student;

  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Seuls les comptes étudiants peuvent soumettre une évaluation';
  END IF;

  SELECT * INTO v_assessment
  FROM public.assessments
  WHERE id = p_assessment_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_assessment.published THEN
    RAISE EXCEPTION 'Évaluation indisponible';
  END IF;

  IF v_assessment.due_date IS NOT NULL
     AND v_assessment.due_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'La date limite de cette évaluation est dépassée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.course_id = v_assessment.course_id
      AND e.student_id = v_student
      AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Inscription active requise';
  END IF;

  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Format des réponses invalide';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assessment_attempts
    WHERE assessment_id = p_assessment_id
      AND student_id = v_student
  ) THEN
    RAISE EXCEPTION 'Cette évaluation a déjà été soumise';
  END IF;

  INSERT INTO public.assessment_attempts(assessment_id, student_id)
  VALUES (p_assessment_id, v_student)
  RETURNING id INTO v_attempt;

  FOR v_answer IN SELECT value FROM jsonb_array_elements(p_answers)
  LOOP
    SELECT * INTO v_question
    FROM public.assessment_questions
    WHERE id = (v_answer->>'question_id')::uuid
      AND assessment_id = p_assessment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Question invalide';
    END IF;

    IF v_question.question_type = 'multiple_choice' THEN
      IF NOT v_assessment.allow_multiple_choice THEN
        RAISE EXCEPTION 'Les choix multiples sont désactivés';
      END IF;

      SELECT COALESCE(array_agg(value::uuid ORDER BY value::uuid), '{}'::uuid[])
      INTO v_selected
      FROM jsonb_array_elements_text(
        COALESCE(v_answer->'selected_option_ids', '[]'::jsonb)
      );

      IF EXISTS (
        SELECT 1
        FROM unnest(v_selected) x
        WHERE NOT EXISTS (
          SELECT 1 FROM public.assessment_options o
          WHERE o.id = x AND o.question_id = v_question.id
        )
      ) THEN
        RAISE EXCEPTION 'Option invalide';
      END IF;

      SELECT correct_option_ids INTO v_correct
      FROM public.assessment_answer_keys
      WHERE question_id = v_question.id;

      IF v_correct IS NULL THEN
        v_correct := '{}'::uuid[];
      END IF;

      IF (SELECT COALESCE(array_agg(x ORDER BY x), '{}'::uuid[]) FROM unnest(v_correct) x)
         = (SELECT COALESCE(array_agg(x ORDER BY x), '{}'::uuid[]) FROM unnest(v_selected) x) THEN
        v_awarded := v_question.points;
      ELSE
        v_awarded := 0;
      END IF;

      INSERT INTO public.assessment_responses(
        attempt_id, question_id, selected_option_ids, points_awarded
      )
      VALUES (v_attempt, v_question.id, v_selected, v_awarded);
    ELSE
      IF NOT v_assessment.allow_written THEN
        RAISE EXCEPTION 'Les réponses écrites sont désactivées';
      END IF;

      INSERT INTO public.assessment_responses(attempt_id, question_id, written_answer)
      VALUES (
        v_attempt, v_question.id,
        LEFT(COALESCE(v_answer->>'written_answer', ''), 10000)
      );
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.assessment_questions q
    WHERE q.assessment_id = p_assessment_id
      AND NOT EXISTS (
        SELECT 1 FROM public.assessment_responses r
        WHERE r.attempt_id = v_attempt
          AND r.question_id = q.id
      )
  ) THEN
    RAISE EXCEPTION 'Toutes les questions doivent recevoir une réponse';
  END IF;

  INSERT INTO public.assessment_results(assessment_id, student_id, score, comment)
  SELECT
    p_assessment_id,
    v_student,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.assessment_responses
        WHERE attempt_id = v_attempt AND points_awarded IS NULL
      ) THEN NULL
      ELSE COALESCE(SUM(points_awarded), 0)
    END,
    NULL
  FROM public.assessment_responses
  WHERE attempt_id = v_attempt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grade_assessment_written_response(
  p_response_id uuid,
  p_points numeric,
  p_feedback text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_course uuid;
  v_question_points numeric;
  v_attempt uuid;
  v_assessment uuid;
  v_student uuid;
  v_results_published boolean;
  v_assessment_published boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise';
  END IF;

  SELECT a.course_id, q.points, r.attempt_id, at.assessment_id,
         at.student_id, a.results_published, a.published
  INTO v_course, v_question_points, v_attempt, v_assessment,
       v_student, v_results_published, v_assessment_published
  FROM public.assessment_responses r
  JOIN public.assessment_questions q ON q.id = r.question_id
  JOIN public.assessment_attempts at ON at.id = r.attempt_id
  JOIN public.assessments a ON a.id = at.assessment_id
  WHERE r.id = p_response_id
    AND q.question_type = 'written'
  FOR UPDATE OF a;

  IF v_course IS NULL THEN
    RAISE EXCEPTION 'Réponse écrite introuvable';
  END IF;

  IF NOT v_assessment_published THEN
    RAISE EXCEPTION 'L''évaluation doit être publiée avant sa correction';
  END IF;

  IF v_results_published THEN
    RAISE EXCEPTION 'Les résultats publiés sont verrouillés';
  END IF;

  IF NOT (public.is_admin() OR public.is_assigned_teacher(v_course)) THEN
    RAISE EXCEPTION 'Correction réservée à l''enseignant titulaire';
  END IF;

  IF p_points IS NULL OR p_points < 0 OR p_points > v_question_points THEN
    RAISE EXCEPTION 'La note doit être comprise entre 0 et %', v_question_points;
  END IF;

  UPDATE public.assessment_responses
  SET points_awarded = p_points,
      teacher_feedback = LEFT(NULLIF(BTRIM(p_feedback), ''), 2000),
      graded_by = auth.uid(),
      graded_at = now()
  WHERE id = p_response_id;

  UPDATE public.assessment_results ar
  SET score = (
        SELECT COALESCE(SUM(r.points_awarded), 0)
        FROM public.assessment_responses r
        WHERE r.attempt_id = v_attempt
      ),
      graded_by = auth.uid(),
      graded_at = now()
  WHERE ar.assessment_id = v_assessment
    AND ar.student_id = v_student
    AND NOT EXISTS (
      SELECT 1 FROM public.assessment_responses r
      WHERE r.attempt_id = v_attempt
        AND r.points_awarded IS NULL
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_assessment_result(
  p_assessment_id uuid,
  p_student_id uuid,
  p_score numeric,
  p_comment text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_course uuid;
  v_max numeric;
  v_results_published boolean;
  v_published boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise';
  END IF;

  SELECT course_id, max_score, results_published, published
  INTO v_course, v_max, v_results_published, v_published
  FROM public.assessments
  WHERE id = p_assessment_id
  FOR UPDATE;

  IF v_course IS NULL THEN
    RAISE EXCEPTION 'Évaluation introuvable';
  END IF;

  IF NOT v_published THEN
    RAISE EXCEPTION 'L''évaluation doit être publiée avant la saisie des résultats';
  END IF;

  IF v_results_published THEN
    RAISE EXCEPTION 'Les résultats publiés sont verrouillés';
  END IF;

  IF NOT (public.is_admin() OR public.is_assigned_teacher(v_course)) THEN
    RAISE EXCEPTION 'Réservé à l''enseignant titulaire de la formation ou à l''administration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.course_id = v_course
      AND e.student_id = p_student_id
      AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Cet élève n''est pas inscrit à cette formation';
  END IF;

  IF p_score IS NOT NULL AND (p_score < 0 OR p_score > v_max) THEN
    RAISE EXCEPTION 'La note doit être comprise entre 0 et %', v_max;
  END IF;

  INSERT INTO public.assessment_results(
    assessment_id, student_id, score, comment, graded_by, graded_at
  )
  VALUES (
    p_assessment_id, p_student_id, p_score,
    LEFT(NULLIF(BTRIM(p_comment), ''), 1000), auth.uid(), now()
  )
  ON CONFLICT (assessment_id, student_id) DO UPDATE
  SET score = EXCLUDED.score,
      comment = EXCLUDED.comment,
      graded_by = auth.uid(),
      graded_at = now();
END;
$function$;
