-- Configuration de la page d'accueil : brouillon privé et publication publique explicite.
-- Migration préparée pour validation ; elle n'est pas exécutée automatiquement.
BEGIN;

CREATE TABLE IF NOT EXISTS public.homepage_content_drafts (
  id text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  content jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.homepage_content_published (
  id text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  content jsonb NOT NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.homepage_content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_content_published ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS homepage_drafts_admin_select ON public.homepage_content_drafts;
CREATE POLICY homepage_drafts_admin_select ON public.homepage_content_drafts FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS homepage_drafts_admin_insert ON public.homepage_content_drafts;
CREATE POLICY homepage_drafts_admin_insert ON public.homepage_content_drafts FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS homepage_drafts_admin_update ON public.homepage_content_drafts;
CREATE POLICY homepage_drafts_admin_update ON public.homepage_content_drafts FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS homepage_drafts_admin_delete ON public.homepage_content_drafts;
CREATE POLICY homepage_drafts_admin_delete ON public.homepage_content_drafts FOR DELETE TO authenticated USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS homepage_published_public_read ON public.homepage_content_published;
CREATE POLICY homepage_published_public_read ON public.homepage_content_published FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_content_drafts TO authenticated;
GRANT SELECT ON public.homepage_content_published TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.publish_homepage_content()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_content jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Accès réservé à l’administration.' USING ERRCODE = '42501'; END IF;
  SELECT content INTO v_content FROM public.homepage_content_drafts WHERE id = 'singleton';
  IF v_content IS NULL THEN RAISE EXCEPTION 'Aucun brouillon de page d’accueil à publier.' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.homepage_content_published (id, content, published_by, published_at)
  VALUES ('singleton', v_content, auth.uid(), now())
  ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, published_by = EXCLUDED.published_by, published_at = EXCLUDED.published_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.publish_homepage_content() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_homepage_content() TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('homepage-assets','homepage-assets',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/avif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/avif'];
DROP POLICY IF EXISTS homepage_assets_public_read ON storage.objects;
CREATE POLICY homepage_assets_public_read ON storage.objects FOR SELECT TO public USING (bucket_id = 'homepage-assets');
DROP POLICY IF EXISTS homepage_assets_admin_insert ON storage.objects;
CREATE POLICY homepage_assets_admin_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'homepage-assets' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS homepage_assets_admin_update ON storage.objects;
CREATE POLICY homepage_assets_admin_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'homepage-assets' AND (SELECT public.is_admin())) WITH CHECK (bucket_id = 'homepage-assets' AND (SELECT public.is_admin()));
DROP POLICY IF EXISTS homepage_assets_admin_delete ON storage.objects;
CREATE POLICY homepage_assets_admin_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'homepage-assets' AND (SELECT public.is_admin()));
COMMIT;
