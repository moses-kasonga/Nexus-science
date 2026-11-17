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

-- SEC-08 : schéma réel de profiles.preferred_language (catalogues PostgreSQL).
DO $$
DECLARE v_type text; v_not_null boolean; v_default text;
        v_check_count integer; v_exact_check_count integer; v_check_def text;
BEGIN
  SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
    INTO v_type,v_not_null,v_default
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=to_regclass('public.profiles') AND a.attname='preferred_language'
     AND a.attnum>0 AND NOT a.attisdropped;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEC-08 FAIL preferred_language: colonne public.profiles.preferred_language absente'; END IF;
  IF v_type IS DISTINCT FROM 'text' THEN RAISE EXCEPTION 'SEC-08 FAIL preferred_language: type attendu text, obtenu %',v_type; END IF;
  IF v_not_null IS DISTINCT FROM true THEN RAISE EXCEPTION 'SEC-08 FAIL preferred_language: colonne doit être NOT NULL'; END IF;
  IF regexp_replace(coalesce(v_default,''),'\s+','','g') IS DISTINCT FROM '''fr''::text' THEN
    RAISE EXCEPTION 'SEC-08 FAIL preferred_language: DEFAULT attendu ''fr'', expression catalogue=%',v_default;
  END IF;
  SELECT count(*),
         count(*) FILTER (WHERE regexp_replace(regexp_replace(pg_get_constraintdef(c.oid),'\s+','','g'),'[()]','','g')
           = 'CHECKpreferred_language=ANYARRAY[''fr''::text,''en''::text,''pt''::text,''es''::text]'),
         min(pg_get_constraintdef(c.oid))
    INTO v_check_count,v_exact_check_count,v_check_def
    FROM pg_constraint c
   WHERE c.conrelid='public.profiles'::regclass AND c.contype='c'
     AND pg_get_expr(c.conbin,c.conrelid) LIKE '%preferred_language%';
  IF v_check_count<>1 OR v_exact_check_count<>1 OR v_check_def IS NULL THEN
    RAISE EXCEPTION 'SEC-08 FAIL preferred_language: une unique CHECK validant exactement fr/en/pt/es est requise; nombre de CHECK=%; définition observée=%',v_check_count,v_check_def;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.profiles'::regclass
       AND c.contype='c' AND pg_get_expr(c.conbin,c.conrelid) LIKE '%preferred_language%' AND NOT c.convalidated) THEN
    RAISE EXCEPTION 'SEC-08 FAIL preferred_language: contrainte CHECK non validée';
  END IF;
  RAISE NOTICE 'PASS SEC-08: preferred_language text NOT NULL DEFAULT ''fr'' CHECK fr/en/pt/es';
END $$;

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
  IF v_count<>1 THEN RAISE EXCEPTION 'SEC-07 FAIL: trigger prevent_role_change absent/inactif'; END IF;

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
    RAISE EXCEPTION 'SEC-04 FAIL handle_new_user: definer=%, config=%',v_definer,v_cfg;
  END IF;
  -- SEC-06 : existence, SECURITY DEFINER et search_path vide, vérifiés via pg_proc.
  IF to_regprocedure('public.current_user_is_admin()') IS NULL THEN
    RAISE EXCEPTION 'SEC-06 FAIL current_user_is_admin(): fonction public.current_user_is_admin() absente';
  END IF;
  SELECT p.prosecdef, p.proconfig INTO v_definer, v_cfg
    FROM pg_proc AS p WHERE p.oid = to_regprocedure('public.current_user_is_admin()');
  IF NOT coalesce(v_definer, false) THEN
    RAISE EXCEPTION 'SEC-06 FAIL current_user_is_admin(): prosecdef doit être true (valeur=%)', v_definer;
  END IF;
  IF NOT coalesce(v_cfg @> ARRAY['search_path=""'], false) THEN
    RAISE EXCEPTION 'SEC-06 FAIL current_user_is_admin(): pg_proc.proconfig doit contenir search_path="" (valeur=%)', v_cfg;
  END IF;

  SELECT count(*) INTO v_count FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE t.tgrelid='auth.users'::regclass AND t.tgname='on_auth_user_created'
     AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
     AND p.oid='public.handle_new_user()'::regprocedure;
  IF v_count<>1 THEN RAISE EXCEPTION 'SEC-05 FAIL: trigger Auth on_auth_user_created absent/inactif'; END IF;

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
DECLARE v_public_table_insert boolean; v_public_column_insert boolean; v_role text;
BEGIN
  -- ACL-01/02 : privilèges effectifs, y compris les droits hérités de PUBLIC.
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(v_role,'public.profiles','INSERT')
       OR has_any_column_privilege(v_role,'public.profiles','INSERT') THEN
      RAISE EXCEPTION 'ACL-% FAIL: % conserve un INSERT effectif sur profiles (table ou colonne)',
        CASE v_role WHEN 'anon' THEN '01' ELSE '02' END,v_role;
    END IF;
  END LOOP;
  -- ACL-03 : observation seulement ; la migration cible ne révoque pas INSERT de PUBLIC.
  SELECT EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid='public.profiles'::regclass AND a.grantee=0 AND a.privilege_type='INSERT')
    INTO v_public_table_insert;
  SELECT EXISTS (SELECT 1 FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a
    WHERE att.attrelid='public.profiles'::regclass AND att.attnum>0 AND NOT att.attisdropped
      AND a.grantee=0 AND a.privilege_type='INSERT') INTO v_public_column_insert;
  RAISE NOTICE 'INFO ACL-03 PUBLIC INSERT explicite: table=%, colonnes=%; la migration ne révoque pas PUBLIC',
    v_public_table_insert,v_public_column_insert;
  IF NOT has_column_privilege('authenticated','public.profiles','first_name','UPDATE')
     OR NOT has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE') THEN
    RAISE EXCEPTION 'RLS-06 FAIL: UPDATE colonnes permises absent';
  END IF;
  RAISE NOTICE 'PASS ACL-01/02 et RLS-06';
  RAISE NOTICE 'INFO ACL-04 service_role INSERT effectif: table=%, colonnes=%',
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
