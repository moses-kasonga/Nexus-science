-- =====================================================================
-- NEXUS SCIENCE : structure de la base de données (projet Supabase zggyzsnracscupaigjcs)
-- Extraite en lecture seule le 2026-11-07. Contient la structure, la sécurité (RLS),
-- les fonctions et les déclencheurs du schéma "public". AUCUNE donnée, AUCUN secret.
--
-- Ce fichier est une reconstitution fidèle de l'état actuel, pas les migrations d'origine.
-- Il ne contient PAS : le code de l'application Nexus (pages, composants), les réglages
-- d'authentification Supabase, le stockage de fichiers, ni les contenus (cours, comptes).
-- Pour recréer la base sur un projet vide, exécute les blocs dans l'ordre.
-- =====================================================================

-- ---------- 1. TABLES ----------

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  first_name text,
  last_name text,
  email text,
  role text NOT NULL DEFAULT 'student'::text,
  avatar_url text,
  bio text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  teacher_id uuid,
  published boolean NOT NULL DEFAULT false
);

CREATE TABLE public.course_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.course_teachers (
  course_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.lessons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  title text NOT NULL,
  content text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  granted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.quiz_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  email text NOT NULL,
  quiz_title text NOT NULL,
  score integer,
  total_questions integer,
  completed_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.teacher_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.teacher_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  specialty text,
  qualifications text,
  experience text,
  motivation text,
  status text NOT NULL DEFAULT 'pending'::text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Anciennes tables (vides, plus utilisées : l'authentification passe par Supabase Auth).
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.auth_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  auth_code text NOT NULL,
  expires_at timestamp without time zone NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

-- ---------- 2. CLÉS ET CONTRAINTES ----------

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.courses ADD CONSTRAINT courses_pkey PRIMARY KEY (id);
ALTER TABLE public.courses ADD CONSTRAINT courses_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.course_schedules ADD CONSTRAINT course_schedules_pkey PRIMARY KEY (id);
ALTER TABLE public.course_schedules ADD CONSTRAINT course_schedules_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.course_schedules ADD CONSTRAINT course_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.course_schedules ADD CONSTRAINT course_schedules_date_check CHECK ((end_date >= start_date));
ALTER TABLE public.course_schedules ADD CONSTRAINT course_schedules_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'published'::text, 'cancelled'::text])));

ALTER TABLE public.course_teachers ADD CONSTRAINT course_teachers_pkey PRIMARY KEY (course_id, teacher_id);
ALTER TABLE public.course_teachers ADD CONSTRAINT course_teachers_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.course_teachers ADD CONSTRAINT course_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.lessons ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);
ALTER TABLE public.lessons ADD CONSTRAINT lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_course_id_student_id_key UNIQUE (course_id, student_id);
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);
ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])));

ALTER TABLE public.quiz_submissions ADD CONSTRAINT quiz_submissions_pkey PRIMARY KEY (id);

ALTER TABLE public.teacher_invitations ADD CONSTRAINT teacher_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.teacher_invitations ADD CONSTRAINT teacher_invitations_token_hash_key UNIQUE (token_hash);
ALTER TABLE public.teacher_invitations ADD CONSTRAINT teacher_invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.teacher_applications ADD CONSTRAINT teacher_applications_pkey PRIMARY KEY (id);
ALTER TABLE public.teacher_applications ADD CONSTRAINT teacher_applications_invitation_unique UNIQUE (invitation_id);
ALTER TABLE public.teacher_applications ADD CONSTRAINT teacher_applications_user_unique UNIQUE (user_id);
ALTER TABLE public.teacher_applications ADD CONSTRAINT teacher_applications_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES public.teacher_invitations(id);
ALTER TABLE public.teacher_applications ADD CONSTRAINT teacher_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.teacher_applications ADD CONSTRAINT teacher_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.teacher_applications ADD CONSTRAINT teacher_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE public.auth_sessions ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.auth_sessions ADD CONSTRAINT auth_sessions_auth_code_key UNIQUE (auth_code);
ALTER TABLE public.auth_sessions ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ---------- 3. INDEX ----------

CREATE INDEX idx_auth_code ON public.auth_sessions USING btree (auth_code);
CREATE INDEX idx_course_schedules_course_id ON public.course_schedules USING btree (course_id);
CREATE INDEX idx_course_schedules_dates ON public.course_schedules USING btree (start_date, end_date);
CREATE INDEX idx_course_schedules_status ON public.course_schedules USING btree (status);
CREATE INDEX idx_courses_admin ON public.courses USING btree (admin_id);
CREATE INDEX idx_courses_teacher ON public.courses USING btree (teacher_id);
CREATE INDEX idx_lessons_course ON public.lessons USING btree (course_id);
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);
CREATE INDEX idx_submissions_user ON public.quiz_submissions USING btree (user_id);
CREATE INDEX teacher_invitations_email_idx ON public.teacher_invitations USING btree (email);
CREATE INDEX teacher_invitations_expires_idx ON public.teacher_invitations USING btree (expires_at);

-- ---------- 4. FONCTIONS (à créer avant les règles de sécurité qui les utilisent) ----------

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_course_access(p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists (select 1 from public.course_teachers ct where ct.course_id = p_course_id and ct.teacher_id = auth.uid())
    or exists (select 1 from public.enrollments e where e.course_id = p_course_id and e.student_id = auth.uid() and e.status = 'active');
$function$;

CREATE OR REPLACE FUNCTION public.is_assigned_teacher(p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.course_teachers ct
    join public.profiles p on p.id = ct.teacher_id
    where ct.course_id = p_course_id and ct.teacher_id = auth.uid() and p.role = 'teacher'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_course_teacher(p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.course_teachers ct
    where ct.course_id = p_course_id and ct.teacher_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.validate_teacher_invitation(p_invitation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.teacher_invitations ti
    where ti.id = p_invitation_id
      and ti.expires_at > now()
      and ti.used_at is null
      and ti.revoked_at is null
      and lower(ti.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$function$;

CREATE OR REPLACE FUNCTION public.redeem_teacher_invitation(p_token text)
 RETURNS TABLE(email text, expires_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ti.email, ti.expires_at
  from public.teacher_invitations ti
  where p_token is not null and length(p_token) > 0
    and ti.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and ti.expires_at > now()
    and ti.used_at is null
    and ti.revoked_at is null
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.create_teacher_invitation(p_email text)
 RETURNS TABLE(invitation_id uuid, raw_token text, email text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := lower(btrim(p_email));
  v_token text;
  v_id uuid;
  v_expires timestamptz := now() + interval '12 hours';
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Réservé aux administrateurs';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;

  update public.teacher_invitations ti
  set revoked_at = now()
  where ti.email = v_email
    and ti.used_at is null and ti.revoked_at is null and ti.expires_at > now();

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.teacher_invitations (email, token_hash, expires_at, created_by)
  values (v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires, auth.uid())
  returning id into v_id;

  return query select v_id, v_token, v_email, v_expires;
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_teacher_application(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_app public.teacher_applications%rowtype;
  v_role text;
  v_inv_email text;
  v_user_email text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Réservé aux administrateurs';
  end if;

  select * into v_app from public.teacher_applications where id = p_application_id for update;
  if not found then raise exception 'Candidature introuvable'; end if;
  if v_app.status <> 'pending' then raise exception 'Candidature déjà traitée (statut : %)', v_app.status; end if;

  select role into v_role from public.profiles where id = v_app.user_id;
  if v_role is null then raise exception 'Profil du candidat introuvable'; end if;

  select lower(email) into v_inv_email from public.teacher_invitations where id = v_app.invitation_id;
  select lower(email) into v_user_email from auth.users where id = v_app.user_id;
  if v_inv_email is null or v_user_email is null or v_inv_email <> v_user_email then
    raise exception 'L''e-mail du compte ne correspond pas à celui de l''invitation';
  end if;

  update public.teacher_applications
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null, updated_at = now()
   where id = p_application_id;

  if v_role = 'student' then
    update public.profiles set role = 'teacher', updated_at = now() where id = v_app.user_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_teacher_application(p_application_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Réservé aux administrateurs';
  end if;

  select status into v_status from public.teacher_applications where id = p_application_id for update;
  if v_status is null then raise exception 'Candidature introuvable'; end if;
  if v_status <> 'pending' then raise exception 'Candidature déjà traitée (statut : %)', v_status; end if;

  update public.teacher_applications
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = nullif(btrim(p_reason), ''), updated_at = now()
   where id = p_application_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, email, first_name, last_name, role)
  values (
    new.id,
    new.email,
    nullif(btrim(new.raw_user_meta_data->>'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data->>'last_name'), ''),
    'student'
  )
  on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_invitation_used()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.teacher_invitations
  set used_at = now()
  where id = new.invitation_id and used_at is null;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Modification du rôle non autorisée';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_course_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    if new.id is distinct from old.id
       or new.admin_id is distinct from old.admin_id
       or new.teacher_id is distinct from old.teacher_id
       or new.published is distinct from old.published
       or new.created_at is distinct from old.created_at then
      raise exception 'Modification non autorisee de ces champs du cours';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_teacher_application_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is not null
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    if new.user_id is distinct from old.user_id
       or new.invitation_id is distinct from old.invitation_id
       or new.status is distinct from old.status
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.rejection_reason is distinct from old.rejection_reason then
      raise exception 'Modification non autorisée de ces champs';
    end if;
  end if;
  return new;
end;
$function$;

-- Fonction d'événement (active la sécurité par ligne sur toute nouvelle table du schéma public).
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- ---------- 5. DÉCLENCHEURS ----------

CREATE TRIGGER on_teacher_application_created AFTER INSERT ON public.teacher_applications FOR EACH ROW EXECUTE FUNCTION mark_invitation_used();
CREATE TRIGGER profiles_prevent_role_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_role_change();
CREATE TRIGGER protect_course_columns BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION protect_course_columns();
CREATE TRIGGER protect_teacher_application_columns BEFORE UPDATE ON public.teacher_applications FOR EACH ROW EXECUTE FUNCTION protect_teacher_application_columns();

-- Création automatique du profil à l'inscription (schéma auth ; présent dans le projet Nexus, vérifié le 2026-11-08).
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- 6. SÉCURITÉ PAR LIGNE (RLS) ----------

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ---------- 7. RÈGLES D'ACCÈS (POLICIES) ----------

-- profiles
CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((id = auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

-- courses
CREATE POLICY courses_select_anon ON public.courses AS PERMISSIVE FOR SELECT TO anon USING ((published = true));
CREATE POLICY courses_select_authenticated ON public.courses AS PERMISSIVE FOR SELECT TO authenticated USING (((published = true) OR ( SELECT has_course_access(courses.id) AS has_course_access)));
CREATE POLICY courses_admin_insert ON public.courses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY courses_admin_update ON public.courses AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_admin() AS is_admin)) WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY courses_admin_delete ON public.courses AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT is_admin() AS is_admin));
CREATE POLICY courses_teacher_update ON public.courses AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_assigned_teacher(courses.id) AS is_assigned_teacher)) WITH CHECK (( SELECT is_assigned_teacher(courses.id) AS is_assigned_teacher));

-- course_schedules
CREATE POLICY public_read_published_schedules ON public.course_schedules AS PERMISSIVE FOR SELECT TO anon USING ((status = 'published'::text));
CREATE POLICY authenticated_read_schedules ON public.course_schedules AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'published'::text) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['teacher'::text, 'admin'::text])))))));
CREATE POLICY admin_insert_schedules ON public.course_schedules AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY admin_update_schedules ON public.course_schedules AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));
CREATE POLICY admin_delete_schedules ON public.course_schedules AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));

-- course_teachers
CREATE POLICY course_teachers_admin_select ON public.course_teachers AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT is_admin() AS is_admin));
CREATE POLICY course_teachers_admin_insert ON public.course_teachers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY course_teachers_admin_update ON public.course_teachers AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_admin() AS is_admin)) WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY course_teachers_admin_delete ON public.course_teachers AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT is_admin() AS is_admin));

-- lessons (visibles seulement pour les inscrits, les enseignants du cours et les administrateurs)
CREATE POLICY lessons_select_access ON public.lessons AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT has_course_access(lessons.course_id) AS has_course_access));
CREATE POLICY lessons_admin_insert ON public.lessons AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY lessons_admin_update ON public.lessons AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_admin() AS is_admin)) WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY lessons_admin_delete ON public.lessons AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT is_admin() AS is_admin));
CREATE POLICY lessons_teacher_insert ON public.lessons AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT is_assigned_teacher(lessons.course_id) AS is_assigned_teacher));
CREATE POLICY lessons_teacher_update ON public.lessons AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_assigned_teacher(lessons.course_id) AS is_assigned_teacher)) WITH CHECK (( SELECT is_assigned_teacher(lessons.course_id) AS is_assigned_teacher));

-- enrollments
CREATE POLICY enrollments_select_own ON public.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING ((student_id = auth.uid()));
CREATE POLICY enrollments_select_teacher ON public.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT is_course_teacher(enrollments.course_id) AS is_course_teacher));
CREATE POLICY enrollments_admin_select ON public.enrollments AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT is_admin() AS is_admin));
CREATE POLICY enrollments_admin_insert ON public.enrollments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY enrollments_admin_update ON public.enrollments AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_admin() AS is_admin)) WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY enrollments_admin_delete ON public.enrollments AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT is_admin() AS is_admin));

-- quiz_submissions
CREATE POLICY quiz_select_own ON public.quiz_submissions AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = (( SELECT auth.uid() AS uid))::text));
CREATE POLICY quiz_insert_own ON public.quiz_submissions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));
CREATE POLICY quiz_admin_select_all ON public.quiz_submissions AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT is_admin() AS is_admin));

-- teacher_invitations (administrateurs seulement)
CREATE POLICY teacher_invitations_admin_select ON public.teacher_invitations AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT is_admin() AS is_admin));
CREATE POLICY teacher_invitations_admin_insert ON public.teacher_invitations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY teacher_invitations_admin_update ON public.teacher_invitations AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_admin() AS is_admin)) WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY teacher_invitations_admin_delete ON public.teacher_invitations AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT is_admin() AS is_admin));

-- teacher_applications
CREATE POLICY teacher_applications_select_own ON public.teacher_applications AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY teacher_applications_insert_own ON public.teacher_applications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (status = 'pending'::text) AND validate_teacher_invitation(invitation_id)));
CREATE POLICY teacher_applications_update_own_pending ON public.teacher_applications AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (status = 'pending'::text))) WITH CHECK (((user_id = auth.uid()) AND (status = 'pending'::text)));
CREATE POLICY teacher_applications_admin_select ON public.teacher_applications AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT is_admin() AS is_admin));
CREATE POLICY teacher_applications_admin_update ON public.teacher_applications AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT is_admin() AS is_admin)) WITH CHECK (( SELECT is_admin() AS is_admin));

-- users et auth_sessions : anciennes tables, aucune règle (inaccessibles via l'API). À supprimer si inutiles.
