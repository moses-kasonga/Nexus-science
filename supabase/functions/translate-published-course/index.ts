import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LANGUAGES = ["fr", "en", "pt", "es"] as const;
type Language = typeof LANGUAGES[number];
type EntityType = "course" | "lesson";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function translateText(text: string, source: Language, target: Language, endpoint: string, apiKey?: string): Promise<string> {
  if (!text.trim() || source === target) return text;
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source,
      target,
      format: "text",
      ...(apiKey ? { api_key: apiKey } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Moteur de traduction indisponible (${response.status}).`);
  const result = await response.json();
  if (typeof result.translatedText !== "string") throw new Error("Réponse de traduction invalide.");
  return result.translatedText;
}

async function detectLanguage(text: string, endpoint: string, apiKey?: string): Promise<Language> {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text.slice(0, 4000), ...(apiKey ? { api_key: apiKey } : {}) }),
  });
  if (!response.ok) throw new Error(`Détection de langue indisponible (${response.status}).`);
  const result = await response.json();
  const detected = Array.isArray(result) ? result[0]?.language : null;
  if (!LANGUAGES.includes(detected)) throw new Error("La langue source doit être le français, l'anglais, le portugais ou l'espagnol.");
  return detected;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const endpoint = Deno.env.get("LIBRETRANSLATE_URL");
  const apiKey = Deno.env.get("LIBRETRANSLATE_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Configuration Supabase incomplète." }, 500);
  if (!endpoint) return json({ error: "Le moteur open source n'est pas encore configuré. Ajoutez LIBRETRANSLATE_URL aux secrets de la fonction." }, 503);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Authentification requise." }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Session invalide." }, 401);

  let payload: { course_id?: string; entity_type?: EntityType; entity_id?: string };
  try { payload = await request.json(); } catch { return json({ error: "Corps de requête invalide." }, 400); }
  const courseId = payload.course_id || (payload.entity_type === "course" ? payload.entity_id : null);
  if (!courseId) return json({ error: "Identifiant de cours manquant." }, 400);

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await service.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (!profile || !["admin", "teacher"].includes(profile.role)) return json({ error: "Accès réservé à l'administration et aux enseignants autorisés." }, 403);

  if (profile.role === "teacher") {
    const { data: assignment } = await service.from("course_teachers").select("course_id").eq("course_id", courseId).eq("teacher_id", authData.user.id).maybeSingle();
    if (!assignment) return json({ error: "Vous n'êtes pas affecté à ce cours." }, 403);
  }

  const { data: course, error: courseError } = await service.from("courses")
    .select("id,name,category,description,published").eq("id", courseId).maybeSingle();
  if (courseError || !course) return json({ error: "Cours introuvable." }, 404);
  if (!course.published) return json({ skipped: true, reason: "Le cours est encore en brouillon." });

  const { data: lessons, error: lessonsError } = await service.from("lessons")
    .select("id,title,content,published").eq("course_id", courseId).eq("published", true);
  if (lessonsError) return json({ error: "Impossible de charger les leçons publiées." }, 500);

  const sourceText = [course.name, course.category, course.description, ...(lessons ?? []).flatMap((lesson) => [lesson.title, lesson.content])].filter(Boolean).join("\n");
  let sourceLanguage: Language;
  try { sourceLanguage = await detectLanguage(sourceText, endpoint, apiKey); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Détection de langue impossible." }, 422); }

  const entities: Array<{ type: EntityType; id: string; fields: Record<string, string | null> }> = [
    { type: "course", id: course.id, fields: { name: course.name, category: course.category, description: course.description } },
    ...(lessons ?? []).map((lesson) => ({ type: "lesson" as const, id: lesson.id, fields: { title: lesson.title, content: lesson.content } })),
  ];

  const results: Array<{ entity_type: EntityType; entity_id: string; language: Language }> = [];
  const failures: string[] = [];
  for (const entity of entities) {
    const sourceHash = await hash({ sourceLanguage, fields: entity.fields });
    for (const target of LANGUAGES) {
      if (target === sourceLanguage) continue;
      const translated: Record<string, string | null> = {};
      try {
        for (const [field, value] of Object.entries(entity.fields)) {
          translated[field] = value === null ? null : await translateText(value, sourceLanguage, target, endpoint, apiKey);
        }
        const { error } = await service.from("content_translations").upsert({
          entity_type: entity.type,
          entity_id: entity.id,
          source_hash: sourceHash,
          source_language: sourceLanguage,
          target_language: target,
          translated_content: translated,
          provider: "libretranslate",
          updated_at: new Date().toISOString(),
        }, { onConflict: "entity_type,entity_id,source_hash,target_language" });
        if (error) throw error;
        results.push({ entity_type: entity.type, entity_id: entity.id, language: target });
      } catch (error) {
        failures.push(`${entity.type}:${entity.id}:${target}: ${error instanceof Error ? error.message : "échec"}`);
      }
    }
  }

  return json({ translated: results.length, failures, source_language: sourceLanguage });
});
