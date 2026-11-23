-- Prevent non-student authenticated profiles from retrieving answer keys via the review RPC.
CREATE OR REPLACE FUNCTION public.get_my_assessment_review(p_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_student uuid := auth.uid();
  v_role text;
  v_attempt uuid;
  v_data jsonb;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Connexion requise';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_student;

  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Le corrigé est réservé aux comptes étudiants';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.assessments
    WHERE id = p_assessment_id
      AND published
      AND results_published
  ) THEN
    RAISE EXCEPTION 'Le corrigé n''est pas encore disponible';
  END IF;

  SELECT id INTO v_attempt
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id
    AND student_id = v_student;

  IF v_attempt IS NULL THEN
    RAISE EXCEPTION 'Aucune copie trouvée';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'question_id', q.id,
        'prompt', q.prompt,
        'question_type', q.question_type,
        'points', q.points,
        'options', (
          SELECT COALESCE(
            jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) ORDER BY o.position),
            '[]'::jsonb
          )
          FROM public.assessment_options o
          WHERE o.question_id = q.id
        ),
        'selected_option_ids', r.selected_option_ids,
        'written_answer', r.written_answer,
        'points_awarded', r.points_awarded,
        'teacher_feedback', r.teacher_feedback,
        'correct_option_ids', k.correct_option_ids,
        'expected_text', k.expected_text,
        'explanation', k.explanation
      )
      ORDER BY q.position
    ),
    '[]'::jsonb
  )
  INTO v_data
  FROM public.assessment_questions q
  LEFT JOIN public.assessment_responses r
    ON r.question_id = q.id AND r.attempt_id = v_attempt
  LEFT JOIN public.assessment_answer_keys k
    ON k.question_id = q.id
  WHERE q.assessment_id = p_assessment_id;

  RETURN v_data;
END;
$function$;