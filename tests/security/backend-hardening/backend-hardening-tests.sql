-- NEXUS SCIENCE — assertions post-migration, base locale uniquement.
-- Toutes les fixtures sont annulées par ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('test.student_id', :'student_id', true);
SELECT set_config('test.other_id', :'other_id', true);
SELECT set_config('test.teacher_id', :'teacher_id', true);
SELECT set_config('test.admin_id', :'admin_id', true);

DO $$
DECLARE v_id uuid; v_role text;
BEGIN
  FOREACH v_id IN ARRAY ARRAY[
    current_setting('test.student_id')::uuid,
    current_setting('test.other_id')::uuid,
    current_setting('test.teacher_id')::uuid,
    current_setting('test.admin_id')::uuid
  ] LOOP
    SELECT role INTO v_role FROM public.profiles WHERE id=v_id;
    IF NOT FOUND OR v_role IS DISTINCT FROM 'student' THEN
      RAISE EXCEPTION 'AUTH-02 FAIL: profil étudiant absent pour %',v_id;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS AUTH-02: profils Auth créés avec role student';
END $$;

DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'FIXTURE FAIL: exécuter avec le rôle postgres local';
  END IF;
END $$;

-- Promouvoir les fixtures uniquement dans cette transaction jetable.
ALTER TABLE public.profiles DISABLE TRIGGER profiles_prevent_role_change;
UPDATE public.profiles SET role='teacher' WHERE id=current_setting('test.teacher_id')::uuid;
UPDATE public.profiles SET role='admin' WHERE id=current_setting('test.admin_id')::uuid;
ALTER TABLE public.profiles ENABLE TRIGGER profiles_prevent_role_change;

-- Colonnes exactes issues du baseline : admin_id TEXT, teacher_id UUID.
INSERT INTO public.courses(admin_id,name,category,description,teacher_id,published)
VALUES(current_setting('test.admin_id'),'NEXUS SECURITY TEST','test','fixture',current_setting('test.teacher_id')::uuid,false)
RETURNING id AS test_course_id \gset
INSERT INTO public.course_teachers(course_id,teacher_id)
VALUES(:'test_course_id',current_setting('test.teacher_id')::uuid);
INSERT INTO public.enrollments(course_id,student_id,status,granted_by)
VALUES(:'test_course_id',current_setting('test.student_id')::uuid,'active',current_setting('test.admin_id')::uuid);

DO $$
DECLARE v_policy text; v_cfg text[]; v_definer boolean; v_count integer;
BEGIN
  IF to_regprocedure('private.teaches_student(uuid)') IS NULL THEN RAISE EXCEPTION 'API-02 FAIL: helper privé absent'; END IF;
  IF to_regprocedure('public.teaches_student(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'API-01 FAIL: ancien helper public présent'; END IF;
  SELECT pg_get_expr(polqual,polrelid) INTO v_policy FROM pg_policy
   WHERE polrelid='public.profiles'::regclass AND polname='profiles_select_my_students';
  IF v_policy IS NULL OR position('private.teaches_student' IN v_policy)=0 THEN
    RAISE EXCEPTION 'API-02 FAIL: policy incorrecte: %',v_policy;
  END IF;

  SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='public.profiles'::regclass AND t.tgname='profiles_prevent_role_change'
     AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
     AND p.oid='public.prevent_role_change()'::regprocedure;
  IF v_count<>1 THEN RAISE EXCEPTION 'SEC-04 FAIL: trigger prevent_role_change absent/inactif'; END IF;

  -- Fonctions SECURITY DEFINER requises et search_path vide.
  SELECT prosecdef,proconfig INTO v_definer,v_cfg FROM pg_proc WHERE oid='public.publish_homepage_content()'::regprocedure;
  IF NOT coalesce(v_definer,false) OR NOT coalesce(v_cfg @> ARRAY['search_path=""'],false) THEN
    RAISE EXCEPTION 'SEC-01 FAIL publisher: definer=%, config=%',v_definer,v_cfg;
  END IF;
  SELECT prosecdef,proconfig INTO v_definer,v_cfg FROM pg_proc WHERE oid='public.prevent_role_change()'::regprocedure;
  IF NOT coalesce(v_definer,false) OR NOT coalesce(v_cfg @> ARRAY['search_path=""'],false) THEN
    RAISE EXCEPTION 'SEC-02 FAIL role trigger: definer=%, config=%',v_definer,v_cfg;
  END IF;
  SELECT prosecdef,proconfig INTO v_definer,v_cfg FROM pg_proc WHERE oid='private.teaches_student(uuid)'::regprocedure;
  IF NOT coalesce(v_definer,false) OR NOT coalesce(v_cfg @> ARRAY['search_path=""'],false) THEN
    RAISE EXCEPTION 'SEC-03 FAIL private helper: definer=%, config=%',v_definer,v_cfg;
  END IF;
  SELECT prosecdef,proconfig INTO v_definer,v_cfg FROM pg_proc WHERE oid='public.handle_new_user()'::regprocedure;
  IF NOT coalesce(v_definer,false) OR NOT coalesce(v_cfg @> ARRAY['search_path=""'],false) THEN
    RAISE EXCEPTION 'SEC-05 FAIL handle_new_user: definer=%, config=%',v_definer,v_cfg;
  END IF;
  SELECT prosecdef INTO v_definer FROM pg_proc WHERE oid='public.current_user_is_admin()'::regprocedure;
  IF NOT coalesce(v_definer,false) THEN RAISE EXCEPTION 'SECURITY DEFINER FAIL current_user_is_admin()'; END IF;

  SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='auth.users'::regclass AND t.tgname='on_auth_user_created'
     AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
     AND p.oid='public.handle_new_user()'::regprocedure;
  IF v_count<>1 THEN RAISE EXCEPTION 'AUTH-02 FAIL: trigger Auth absent/inactif'; END IF;

  IF NOT has_schema_privilege('authenticated','private','USAGE')
     OR NOT has_function_privilege('authenticated','private.teaches_student(uuid)','EXECUTE')
     OR has_schema_privilege('anon','private','USAGE')
     OR has_function_privilege('anon','private.teaches_student(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'API-04 FAIL: grants private incorrects';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname='private' AND a.grantee=0 AND a.privilege_type='USAGE')
     OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid='private.teaches_student(uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'API-04 FAIL: PUBLIC conserve accès au helper';
  END IF;
  IF NOT has_function_privilege('authenticated','public.publish_homepage_content()','EXECUTE')
     OR has_function_privilege('anon','public.publish_homepage_content()','EXECUTE')
     OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       WHERE p.oid='public.publish_homepage_content()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'ACL FAIL: droits EXECUTE publisher incorrects';
  END IF;
  RAISE NOTICE 'PASS API/SEC: helper, policy, triggers, SECURITY DEFINER, search_path et grants';
END $$;

DO $$
DECLARE v_schemas text;
BEGIN
  v_schemas:=current_setting('pgrst.db_schemas',true);
  IF v_schemas IS NULL THEN
    RAISE NOTICE 'MANUEL API-03: vérifier que private est absent de Supabase API Exposed schemas';
  ELSIF v_schemas ~ '(^|[,[:space:]])private([,[:space:]]|$)' THEN
    RAISE EXCEPTION 'API-03 FAIL: private exposé: %',v_schemas;
  ELSE
    RAISE NOTICE 'PASS API-03 setting: private absent de pgrst.db_schemas ; test HTTP local à compléter';
  END IF;
END $$;

DO $$
DECLARE v_role text; v_public boolean;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(v_role,'public.profiles','INSERT')
       OR has_any_column_privilege(v_role,'public.profiles','INSERT') THEN
      RAISE EXCEPTION 'ACL FAIL: % conserve INSERT profiles',v_role;
    END IF;
  END LOOP;
  SELECT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid='public.profiles'::regclass AND a.grantee=0 AND a.privilege_type='INSERT')
    OR EXISTS(SELECT 1 FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
    WHERE att.attrelid='public.profiles'::regclass AND att.attnum>0 AND NOT att.attisdropped
      AND a.grantee=0 AND a.privilege_type='INSERT') INTO v_public;
  IF v_public THEN RAISE EXCEPTION 'ACL FAIL: PUBLIC conserve INSERT'; END IF;
  IF NOT has_column_privilege('authenticated','public.profiles','first_name','UPDATE')
     OR NOT has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE') THEN
    RAISE EXCEPTION 'RLS-06 FAIL: UPDATE colonnes permises absent';
  END IF;
  RAISE NOTICE 'PASS ACL-01/02/03 et RLS-06';
  RAISE NOTICE 'INFO ACL-04 service_role INSERT table=%, colonnes=%',
    has_table_privilege('service_role','public.profiles','INSERT'),
    has_any_column_privilege('service_role','public.profiles','INSERT');
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.profiles(id,email,role) VALUES(gen_random_uuid(),'anon-denied@nexus.invalid','student');
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS INS-01: INSERT anon refusé'; RETURN;
  END;
  RAISE EXCEPTION 'INS-01 FAIL: INSERT anon accepté';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student_id'),'role','authenticated','aud','authenticated')::text,true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.profiles(id,email,role) VALUES(gen_random_uuid(),'auth-denied@nexus.invalid','student');
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS INS-02: INSERT authenticated refusé'; RETURN;
  END;
  RAISE EXCEPTION 'INS-02 FAIL: INSERT authenticated accepté';
END $$;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE id=current_setting('test.student_id')::uuid;
  IF n<>1 THEN RAISE EXCEPTION 'RLS-01 FAIL'; END IF;
  SELECT count(*) INTO n FROM public.profiles WHERE id=current_setting('test.other_id')::uuid;
  IF n<>0 THEN RAISE EXCEPTION 'RLS-02 FAIL'; END IF;
END $$;
UPDATE public.profiles SET first_name='Nexus Test',avatar_url='https://example.invalid/nexus.png'
 WHERE id=current_setting('test.student_id')::uuid;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=current_setting('test.student_id')::uuid
    AND first_name='Nexus Test' AND avatar_url='https://example.invalid/nexus.png') THEN
    RAISE EXCEPTION 'RLS-06 FAIL: UPDATE non effectif';
  END IF;
  RAISE NOTICE 'PASS RLS-01/02/06';
END $$;

RESET ROLE;
GRANT UPDATE(role) ON public.profiles TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student_id'),'role','authenticated','aud','authenticated')::text,true);
DO $$ BEGIN
  BEGIN
    UPDATE public.profiles SET role='admin' WHERE id=current_setting('test.student_id')::uuid;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM='Modification du rôle non autorisée' THEN RAISE NOTICE 'PASS ROLE-01'; RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'ROLE-01 FAIL: trigger n’a pas bloqué';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.teacher_id'),'role','authenticated','aud','authenticated')::text,true);
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.profiles WHERE id=current_setting('test.student_id')::uuid;
  IF n<>1 THEN RAISE EXCEPTION 'RLS-03 FAIL: élève affecté invisible'; END IF;
  SELECT count(*) INTO n FROM public.profiles WHERE id=current_setting('test.other_id')::uuid;
  IF n<>0 THEN RAISE EXCEPTION 'RLS-04 FAIL: élève non affecté visible'; END IF;
  RAISE NOTICE 'PASS RLS-03/04';
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student_id'),'role','authenticated','aud','authenticated')::text,true);
DO $$ BEGIN
  BEGIN
    PERFORM public.publish_homepage_content();
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS HOME-02'; RETURN;
  END;
  RAISE EXCEPTION 'HOME-02 FAIL: non-admin publié';
END $$;
RESET ROLE;

INSERT INTO public.homepage_content_drafts(id,content,updated_by)
VALUES('singleton','{"title":"NEXUS local test"}'::jsonb,current_setting('test.admin_id')::uuid)
ON CONFLICT(id) DO UPDATE SET content=EXCLUDED.content,updated_by=EXCLUDED.updated_by;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin_id'),'role','authenticated','aud','authenticated')::text,true);
SELECT public.publish_homepage_content();
DO $$
DECLARE n integer; v_by uuid; v_at timestamptz;
BEGIN
  SELECT count(*) INTO n FROM public.profiles;
  IF n<4 THEN RAISE EXCEPTION 'RLS-05 FAIL: admin ne voit pas les profils'; END IF;
  SELECT published_by,published_at INTO v_by,v_at FROM public.homepage_content_published WHERE id='singleton';
  IF v_by IS DISTINCT FROM current_setting('test.admin_id')::uuid OR v_at IS NULL THEN
    RAISE EXCEPTION 'HOME-01 FAIL: publication admin invalide';
  END IF;
  RAISE NOTICE 'PASS RLS-05 et HOME-01';
END $$;
UPDATE public.profiles SET role='teacher' WHERE id=current_setting('test.admin_id')::uuid;
DO $$ BEGIN RAISE NOTICE 'PASS ROLE-02'; END $$;
RESET ROLE;

ROLLBACK;
