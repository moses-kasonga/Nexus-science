-- Preserve student assessment evidence and make publication transitions one-way.
-- Any assessment with attempts or results is immutable and cannot be deleted.
-- Course ON DELETE CASCADE is also stopped by the assessment BEFORE DELETE trigger.

CREATE OR REPLACE FUNCTION public.prevent_assessment_delete_with_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.assessment_attempts at
    WHERE at.assessment_id = OLD.id
  ) OR EXISTS (
    SELECT 1
    FROM public.assessment_results ar
    WHERE ar.assessment_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'Cette évaluation possède des tentatives ou des résultats ; elle ne peut pas être supprimée. Archivez-la plutôt.'
      USING ERRCODE = '55000';
  END IF;

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_assessment_delete_with_history()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_assessment_delete_with_history
ON public.assessments;

CREATE TRIGGER prevent_assessment_delete_with_history
BEFORE DELETE ON public.assessments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_assessment_delete_with_history();

CREATE OR REPLACE FUNCTION public.validate_assessment_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_has_history boolean;
BEGIN
  -- Publishing on INSERT skips the UPDATE validation path. Assessments must
  -- be created as drafts and published only through the validated UPDATE path.
  IF TG_OP = 'INSERT' THEN
    IF NEW.published OR NEW.results_published THEN
      RAISE EXCEPTION
        'Créez d''abord l''évaluation comme brouillon, puis publiez-la après validation';
    END IF;
    RETURN NEW;
  END IF;

  -- Once results are public, publication cannot be withdrawn to enable
  -- silent edits. Corrections after publication require a separate audited workflow.
  IF OLD.results_published AND NOT NEW.results_published THEN
    RAISE EXCEPTION
      'La publication des résultats ne peut pas être rétractée';
  END IF;

  IF NEW.results_published AND NOT NEW.published THEN
    RAISE EXCEPTION
      'Publiez d''abord l''évaluation avant ses résultats';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.assessment_attempts at
      WHERE at.assessment_id = OLD.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.assessment_results ar
      WHERE ar.assessment_id = OLD.id
    )
  INTO v_has_history;

  -- Once a student has submitted, freeze the assessment definition and
  -- deadline. This prevents changing the exam after a student has taken it.
  IF v_has_history AND ROW(
    NEW.course_id,
    NEW.title,
    NEW.description,
    NEW.kind,
    NEW.max_score,
    NEW.due_date,
    NEW.allow_multiple_choice,
    NEW.allow_written,
    NEW.published
  ) IS DISTINCT FROM ROW(
    OLD.course_id,
    OLD.title,
    OLD.description,
    OLD.kind,
    OLD.max_score,
    OLD.due_date,
    OLD.allow_multiple_choice,
    OLD.allow_written,
    OLD.published
  ) THEN
    RAISE EXCEPTION
      'La définition et les paramètres de cette évaluation sont verrouillés après réception de tentatives ou de résultats';
  END IF;

  IF OLD.published AND (
    NEW.allow_multiple_choice IS DISTINCT FROM OLD.allow_multiple_choice
    OR NEW.allow_written IS DISTINCT FROM OLD.allow_written
  ) THEN
    RAISE EXCEPTION
      'Les modes de réponse ne peuvent plus être modifiés après publication';
  END IF;

  IF NEW.published AND NOT OLD.published THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.assessment_questions q
      WHERE q.assessment_id = NEW.id
    ) THEN
      RAISE EXCEPTION
        'Ajoutez au moins une question avant de publier l''évaluation';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.assessment_questions q
      WHERE q.assessment_id = NEW.id
        AND (
          (
            q.question_type = 'multiple_choice'
            AND (
              NOT NEW.allow_multiple_choice
              OR (
                SELECT count(*)
                FROM public.assessment_options o
                WHERE o.question_id = q.id
              ) < 2
              OR NOT EXISTS (
                SELECT 1
                FROM public.assessment_answer_keys k
                WHERE k.question_id = q.id
                  AND cardinality(k.correct_option_ids) > 0
              )
            )
          )
          OR (
            q.question_type = 'written'
            AND NOT NEW.allow_written
          )
        )
    ) THEN
      RAISE EXCEPTION
        'Certaines questions sont incomplètes ou leur type de réponse est désactivé';
    END IF;
  END IF;

  IF NEW.results_published AND NOT OLD.results_published THEN
    IF EXISTS (
      SELECT 1
      FROM public.assessment_responses r
      JOIN public.assessment_attempts at
        ON at.id = r.attempt_id
      WHERE at.assessment_id = NEW.id
        AND r.points_awarded IS NULL
    ) THEN
      RAISE EXCEPTION
        'Corrigez toutes les réponses écrites avant de publier les résultats';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_assessment_publication
ON public.assessments;

CREATE TRIGGER validate_assessment_publication
BEFORE INSERT OR UPDATE ON public.assessments
FOR EACH ROW
EXECUTE FUNCTION public.validate_assessment_publication();
