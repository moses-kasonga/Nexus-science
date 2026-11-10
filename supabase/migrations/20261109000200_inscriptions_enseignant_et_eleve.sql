-- 1) Candidature d'un enseignant invité : le lien contient un jeton secret ; la fonction vérifie que le compte
--    connecté porte bien l'adresse invitée, puis enregistre la candidature (l'invitation est alors marquée utilisée).
create or replace function public.submit_teacher_application(
  p_token text, p_specialty text, p_qualifications text, p_experience text, p_motivation text)
 returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;

  select ti.id into v_inv
  from public.teacher_invitations ti
  where ti.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and ti.expires_at > now() and ti.used_at is null and ti.revoked_at is null
    and lower(ti.email) = v_email
  limit 1;
  if v_inv is null then
    raise exception 'Invitation invalide, expirée, déjà utilisée ou destinée à une autre adresse e-mail';
  end if;

  if exists (select 1 from public.teacher_applications where user_id = auth.uid()) then
    raise exception 'Une candidature existe déjà pour ce compte';
  end if;

  insert into public.teacher_applications (user_id, invitation_id, specialty, qualifications, experience, motivation)
  values (auth.uid(), v_inv,
          left(nullif(btrim(p_specialty), ''), 300), left(nullif(btrim(p_qualifications), ''), 2000),
          left(nullif(btrim(p_experience), ''), 2000), left(nullif(btrim(p_motivation), ''), 2000))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_teacher_application(text, text, text, text, text) from public, anon;
grant execute on function public.submit_teacher_application(text, text, text, text, text) to authenticated;

-- 2) Inscription d'un élève à une formation publiée. Réservée aux comptes « élève ».
--    granted_by reste vide : c'est ce qui distingue une inscription personnelle d'un accès accordé par l'administration.
--    Un accès retiré par l'administration ne peut pas être récupéré par l'élève.
create or replace function public.enroll_in_course(p_course_id uuid)
 returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'student') then
    raise exception 'Seuls les comptes élèves peuvent s''inscrire à une formation';
  end if;
  if not exists (select 1 from public.courses where id = p_course_id and published = true) then
    raise exception 'Formation indisponible';
  end if;

  select id, status into v_id, v_status
  from public.enrollments where course_id = p_course_id and student_id = auth.uid();
  if found then
    if v_status = 'revoked' then raise exception 'Votre accès à cette formation a été retiré par l''administration'; end if;
    return v_id;
  end if;

  insert into public.enrollments (course_id, student_id, status, granted_by)
  values (p_course_id, auth.uid(), 'active', null)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.enroll_in_course(uuid) from public, anon;
grant execute on function public.enroll_in_course(uuid) to authenticated;
