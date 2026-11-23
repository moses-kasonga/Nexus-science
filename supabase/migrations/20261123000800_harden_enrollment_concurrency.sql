-- Stabilize student self-enrollment against duplicate concurrent requests
-- and remove an unnecessary search_path dependency from the role helper.

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$function$;

create or replace function public.enroll_in_course(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_status text;
  v_profile_id uuid;
  v_course_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  -- Lock the caller's role row so a concurrent role change cannot cross
  -- the authorization check and the enrollment write.
  select p.id
    into v_profile_id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'student'
  for share;

  if v_profile_id is null then
    raise exception 'Seuls les comptes élèves peuvent s''inscrire à une formation';
  end if;

  -- Prevent a course from being unpublished between validation and insert.
  select c.id
    into v_course_id
  from public.courses c
  where c.id = p_course_id
    and c.published = true
  for share;

  if v_course_id is null then
    raise exception 'Formation indisponible';
  end if;

  select e.id, e.status
    into v_id, v_status
  from public.enrollments e
  where e.course_id = p_course_id
    and e.student_id = auth.uid()
  for update;

  if found then
    if v_status = 'revoked' then
      raise exception 'Votre accès à cette formation a été retiré par l''administration';
    end if;
    return v_id;
  end if;

  -- A unique constraint already prevents duplicates; ON CONFLICT turns
  -- simultaneous repeated requests into an idempotent lookup instead of
  -- leaking a unique-violation error to the student.
  insert into public.enrollments (course_id, student_id, status, granted_by)
  values (p_course_id, auth.uid(), 'active', null)
  on conflict (course_id, student_id) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select e.id, e.status
    into v_id, v_status
  from public.enrollments e
  where e.course_id = p_course_id
    and e.student_id = auth.uid()
  for update;

  if v_id is null then
    raise exception 'Inscription non confirmée ; veuillez réessayer';
  end if;

  if v_status = 'revoked' then
    raise exception 'Votre accès à cette formation a été retiré par l''administration';
  end if;

  return v_id;
end;
$function$;

commit;