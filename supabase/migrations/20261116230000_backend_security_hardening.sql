-- NEXUS SCIENCE — Backend security hardening
-- Prepared on 2026-11-16. NOT executed against Supabase.
-- Scope: project zggyzsnracscupaigjcs only.
BEGIN;

-- 1) Harden the homepage publication SECURITY DEFINER function.
-- Keep the signature, authorization check, data flow and publication behavior.
CREATE OR REPLACE FUNCTION public.publish_homepage_content()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_content jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé à l’administration.'
      USING ERRCODE = '42501';
  END IF;

  SELECT hcd.content
    INTO v_content
  FROM public.homepage_content_drafts AS hcd
  WHERE hcd.id = 'singleton';

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

REVOKE ALL ON FUNCTION public.publish_homepage_content() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_homepage_content() TO authenticated;

-- 2) Harden the existing role-protection trigger function.
-- CREATE OR REPLACE preserves the function OID and therefore its trigger binding.
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
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

-- 3) Move the teacher/student relationship helper out of the exposed public schema.
-- IMPORTANT: the private schema must NOT be included in PostgREST's exposed schemas.
CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.teaches_student(p_student uuid)
RETURNS boolean
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

REVOKE ALL ON FUNCTION private.teaches_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.teaches_student(uuid) TO authenticated;

-- Rebuild the sole catalog dependency found for public.teaches_student(uuid):
-- profiles_select_my_students. The RLS predicate retains the same semantics.
DROP POLICY IF EXISTS profiles_select_my_students ON public.profiles;
CREATE POLICY profiles_select_my_students
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT private.teaches_student(id)));

-- The application repository had no direct RPC call to public.teaches_student.
-- The policy now calls private.teaches_student, so remove the exposed RPC.
DROP FUNCTION public.teaches_student(uuid);

-- 4) Remove direct INSERT privileges from API roles on profiles.
-- handle_new_user() is SECURITY DEFINER, owned by postgres, and inserts
-- public.profiles from the auth.users trigger; it does not need these grants.
-- Keep owner/service_role privileges untouched.
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
