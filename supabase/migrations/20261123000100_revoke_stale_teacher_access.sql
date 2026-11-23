-- Security remediation: revoke course access when a teacher loses the teacher role.
-- Keep course_teachers as the active assignment registry; role eligibility is checked
-- at authorization time so stale assignments cannot preserve teacher privileges.

CREATE OR REPLACE FUNCTION public.is_course_teacher(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.is_assigned_teacher(p_course_id);
$function$;

CREATE OR REPLACE FUNCTION public.has_course_access(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    public.is_admin()
    OR public.is_assigned_teacher(p_course_id)
    OR EXISTS (
      SELECT 1
      FROM public.enrollments e
      WHERE e.course_id = p_course_id
        AND e.student_id = auth.uid()
        AND e.status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION public.teaches_student(p_student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.course_teachers ct ON ct.course_id = e.course_id
    JOIN public.profiles teacher_profile ON teacher_profile.id = ct.teacher_id
    WHERE e.student_id = p_student
      AND ct.teacher_id = auth.uid()
      AND teacher_profile.role = 'teacher'
      AND e.status = 'active'
  );
$function$;
