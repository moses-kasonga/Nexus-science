-- NEXUS SCIENCE staging security remediation
-- Harden teacher invitation redemption and application lifecycle.
-- Scope: teacher_invitation / teacher_application flow only.

begin;

-- Serialize invitation creation for the same normalized email address.
-- Prevents two concurrent admin requests from leaving multiple active invitations.
create or replace function public.create_teacher_invitation(p_email text)
returns table(invitation_id uuid, raw_token text, email text, expires_at timestamp with time zone)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := lower(btrim(p_email));
  v_token text;
  v_id uuid;
  v_expires timestamptz := now() + interval '12 hours';
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Réservé aux administrateurs';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_email, 0)
  );

  update public.teacher_invitations ti
     set revoked_at = now()
   where lower(ti.email) = v_email
     and ti.used_at is null
     and ti.revoked_at is null
     and ti.expires_at > now();

  v_token := translate(
    encode(extensions.gen_random_bytes(32), 'base64'),
    '+/=',
    '-_'
  );

  insert into public.teacher_invitations (email, token_hash, expires_at, created_by)
  values (
    v_email,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires,
    auth.uid()
  )
  returning id into v_id;

  return query select v_id, v_token, v_email, v_expires;
end;
$function$;

-- The invitation row is locked while the caller validates and creates the application.
-- The email must belong to the authenticated Supabase user and be confirmed.
-- Only student accounts may enter the teacher-approval workflow.
create or replace function public.submit_teacher_application(
  p_token text,
  p_specialty text,
  p_qualifications text,
  p_experience text,
  p_motivation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text;
  v_inv uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise';
  end if;

  select lower(btrim(u.email))
    into v_email
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'Une adresse e-mail confirmée est requise pour utiliser cette invitation';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'student'
  ) then
    raise exception 'Seuls les comptes élèves peuvent demander le statut enseignant';
  end if;

  -- token_hash is unique; FOR UPDATE serializes this redemption with revocation
  -- and other redemption attempts. The status predicates are rechecked after waits.
  select ti.id
    into v_inv
  from public.teacher_invitations ti
  where p_token is not null
    and length(p_token) > 0
    and ti.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and ti.expires_at > now()
    and ti.used_at is null
    and ti.revoked_at is null
    and lower(btrim(ti.email)) = v_email
  for update;

  if v_inv is null then
    raise exception 'Invitation invalide, expirée, déjà utilisée ou destinée à une autre adresse e-mail';
  end if;

  if exists (
    select 1
    from public.teacher_applications a
    where a.user_id = auth.uid()
  ) then
    raise exception 'Une candidature existe déjà pour ce compte';
  end if;

  insert into public.teacher_applications (
    user_id,
    invitation_id,
    specialty,
    qualifications,
    experience,
    motivation
  )
  values (
    auth.uid(),
    v_inv,
    left(nullif(btrim(p_specialty), ''), 300),
    left(nullif(btrim(p_qualifications), ''), 2000),
    left(nullif(btrim(p_experience), ''), 2000),
    left(nullif(btrim(p_motivation), ''), 2000)
  )
  returning id into v_id;

  return v_id;
end;
$function$;

-- Fail closed if an insert reaches the trigger with an expired, revoked or already-used invite.
-- Any failure rolls back the application insert as well.
create or replace function public.mark_invitation_used()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invitation_id uuid;
begin
  update public.teacher_invitations
     set used_at = now()
   where id = new.invitation_id
     and used_at is null
     and revoked_at is null
     and expires_at > now()
  returning id into v_invitation_id;

  if v_invitation_id is null then
    raise exception 'Invitation indisponible : déjà utilisée, expirée ou révoquée';
  end if;

  return new;
end;
$function$;

-- Approval is an administrative transition, but the account must still be a
-- confirmed-email student matching the invited address at the moment of approval.
create or replace function public.approve_teacher_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_app public.teacher_applications%rowtype;
  v_role text;
  v_inv_email text;
  v_user_email text;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Réservé aux administrateurs';
  end if;

  select *
    into v_app
  from public.teacher_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Candidature introuvable';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'Candidature déjà traitée (statut : %)', v_app.status;
  end if;

  select p.role
    into v_role
  from public.profiles p
  where p.id = v_app.user_id
  for update;

  if v_role is distinct from 'student' then
    raise exception 'Seul un compte élève peut être promu enseignant';
  end if;

  select lower(btrim(ti.email))
    into v_inv_email
  from public.teacher_invitations ti
  where ti.id = v_app.invitation_id;

  select lower(btrim(u.email))
    into v_user_email
  from auth.users u
  where u.id = v_app.user_id
    and u.email_confirmed_at is not null;

  if v_inv_email is null or v_user_email is null or v_inv_email <> v_user_email then
    raise exception 'L''adresse e-mail confirmée du compte ne correspond pas à celle de l''invitation';
  end if;

  update public.profiles
     set role = 'teacher',
         updated_at = now()
   where id = v_app.user_id;

  update public.teacher_applications
     set status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         rejection_reason = null,
         updated_at = now()
   where id = p_application_id;
end;
$function$;

-- This trigger function does not need public in its search path.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.role is distinct from new.role
     and not public.is_admin() then
    raise exception 'Modification du rôle non autorisée';
  end if;

  return new;
end;
$function$;

-- The UI already uses submit/approve/reject RPCs. Remove unused direct DML paths
-- so application state can only change through the controlled functions.
drop policy if exists teacher_applications_insert_own on public.teacher_applications;
drop policy if exists teacher_applications_update_own_pending on public.teacher_applications;
drop policy if exists teacher_applications_admin_update on public.teacher_applications;

revoke insert, update, delete on table public.teacher_applications from authenticated;

-- Direct insertion/deletion of invitations is not used by the UI; creation goes
-- through create_teacher_invitation(), which generates and hashes the token.
drop policy if exists teacher_invitations_admin_insert on public.teacher_invitations;
drop policy if exists teacher_invitations_admin_delete on public.teacher_invitations;
revoke insert, delete on table public.teacher_invitations from authenticated;

-- No remaining policy or frontend caller uses this helper.
drop function if exists public.validate_teacher_invitation(uuid);

commit;
