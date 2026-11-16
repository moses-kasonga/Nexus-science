-- NEXUS SCIENCE — Backend security hardening
-- Prepared on 2026-11-16 for review only.
-- Target project: zggyzsnracscupaigjcs
-- IMPORTANT: this migration has NOT been executed against Supabase.
-- Apply only after reviewing docs/security/backend-hardening-plan-2026-11-16.md,
-- especially the PostgREST exposed-schema precondition for the private schema.

BEGIN;

-- 1) Harden the homepage publishing SECURITY DEFINER function.
-- All non-built-in objects are schema-qualified; built-in now() is explicit too.
CREATE OR REPLACE FUNCTION public.publish_homepage_content()
RETURNS pg_catalog.void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_content pg_catalog.jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé à l’administration.'
      USING ERRCODE = '42501';
  END IF;

  SELECT d.content
    INTO v_content
    FROM public.homepage_content_drafts AS d
   WHERE d.id = 'singleton';

  IF v_content IS NULL THEN
    RAISE EXCEPTION 'Aucun brouillon de page d’accueil à publier.'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.homepage_content_published
    (id, content, published_by, published_at)
  VALUES
    ('singleton', v_content, auth.uid(), pg_catalog.now())
  ON CONFLICT (id) DO UPDATE
    SET content = EXCLUDED.content,
        published_by = EXCLUDED.published_by,
        published_at = EXCLUDED.published_at;
END;
$function$;

-- Preserve the existing RPC permission contract.
REVOKE ALL ON FUNCTION public.publish_homepage_content() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_homepage_content() TO authenticated;

-- 2) Harden the existing trigger function without changing its logic or trigger.
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS pg_catalog.trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
       AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Modification du rôle non autorisée';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) Move the RLS helper out of the public API schema.
-- PRECONDITION: "private" must NOT be listed in Supabase API > Exposed schemas.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE CREATE ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.teaches_student(p_student uuid)
RETURNS pg_catalog.boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.enrollments AS e
      JOIN public.course_teachers AS ct
        ON ct.course_id = e.course_id
     WHERE e.student_id = p_student
       AND ct.teacher_id = auth.uid()
  );
$function$;

-- The policy evaluates this function as authenticated, so EXECUTE is required.
-- Keeping the schema out of PostgREST's exposed-schema list prevents direct RPC.
REVOKE ALL ON FUNCTION private.teaches_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.teaches_student(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_select_my_students ON public.profiles;
CREATE POLICY profiles_select_my_students
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT private.teaches_student(id)));

-- The only database dependency found for the old public helper was this policy.
DROP FUNCTION public.teaches_student(uuid);

-- 4) Remove unnecessary INSERT grants from API roles.
-- Revoke table-level AND per-column grants: column grants survive a table-level
-- REVOKE if they were granted separately.
REVOKE INSERT ON TABLE public.profiles FROM anon, authenticated;
REVOKE INSERT (
  id,
  first_name,
  last_name,
  email,
  role,
  avatar_url,
  bio,
  created_at,
  updated_at,
  preferred_language
) ON TABLE public.profiles FROM anon, authenticated;

COMMIT;
