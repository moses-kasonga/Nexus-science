import { supabase } from "./supabase";

export type Language = "fr" | "en" | "pt" | "es";
export type Schedule = { start_date: string; end_date: string; status: string };
export type Course = { id: string; name: string; category: string; description: string | null; course_schedules: Schedule[] };
export type Lesson = { id: string; title: string; content: string | null; order_index: number };

type TranslationRow = { entity_id: string; source_hash: string; source_language: Language; translated_content: Record<string, string | null> };

async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function getTranslations(type: "course" | "lesson", ids: string[], language: Language): Promise<Map<string, TranslationRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("content_translations")
    .select("entity_id, source_hash, source_language, translated_content")
    .eq("entity_type", type).eq("target_language", language).in("entity_id", ids);
  if (error) {
    // Le site reste utilisable avec les textes originaux si la migration n'est pas encore appliquée.
    if (error.code === "42P01" || error.code === "PGRST205") return new Map();
    console.warn("NEXUS SCIENCE: traductions indisponibles", error.message);
    return new Map();
  }
  return new Map(((data ?? []) as TranslationRow[]).map((row) => [row.entity_id, row]));
}

async function translatedCourse(course: Course, language: Language, cache: Map<string, TranslationRow>): Promise<Course> {
  const row = cache.get(course.id);
  if (!row) return course;
  const expected = await contentHash({ sourceLanguage: row.source_language, fields: { name: course.name, category: course.category, description: course.description } });
  if (expected !== row.source_hash) return course;
  return { ...course, ...row.translated_content };
}

async function translatedLesson(lesson: Lesson, language: Language, cache: Map<string, TranslationRow>): Promise<Lesson> {
  const row = cache.get(lesson.id);
  if (!row) return lesson;
  const expected = await contentHash({ sourceLanguage: row.source_language, fields: { title: lesson.title, content: lesson.content } });
  if (expected !== row.source_hash) return lesson;
  return { ...lesson, ...row.translated_content };
}

/** Seules les sessions « publiées » sont montrées au public, même à un enseignant ou à un administrateur connecté. */
function publishedSessions(course: Course): Course {
  return { ...course, course_schedules: (course.course_schedules ?? []).filter((item) => item.status === "published").sort((a, b) => a.start_date.localeCompare(b.start_date)) };
}

export async function fetchPublishedCourses(language: Language = "fr"): Promise<Course[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, category, description, course_schedules(start_date, end_date, status)")
    .eq("published", true)
    .order("name", { ascending: true });
  if (error) {
    const detail = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" — ");
    throw new Error(detail || "Les cours n'ont pas pu être chargés.");
  }
  const courses = (data ?? []) as Course[];
  const cache = await getTranslations("course", courses.map((course) => course.id), language);
  return Promise.all(courses.map(async (course) => publishedSessions(await translatedCourse(course, language, cache))));
}

export async function fetchCourse(id: string, language: Language = "fr"): Promise<Course | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, category, description, course_schedules(start_date, end_date, status)")
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error("Ce cours n'a pas pu être chargé. Réessayez dans un instant.");
  if (!data) return null;
  const course = data as Course;
  const cache = await getTranslations("course", [course.id], language);
  return publishedSessions(await translatedCourse(course, language, cache));
}

/** Les règles RLS ne renvoient les leçons qu'aux inscrits, aux enseignants du cours et aux administrateurs. */
export async function fetchLessons(courseId: string, language: Language = "fr"): Promise<Lesson[]> {
  const { data, error } = await supabase.from("lessons").select("id, title, content, order_index").eq("course_id", courseId).eq("published", true).order("order_index", { ascending: true });
  if (error) {
    const detail = [error.code, error.message].filter(Boolean).join(" — ");
    throw new Error(detail || "Les leçons n'ont pas pu être chargées.");
  }
  const lessons = (data ?? []) as Lesson[];
  const cache = await getTranslations("lesson", lessons.map((lesson) => lesson.id), language);
  return Promise.all(lessons.map((lesson) => translatedLesson(lesson, language, cache)));
}

const dateFormats: Record<Language, Intl.DateTimeFormat> = {
  fr: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  pt: new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  es: new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
};
export function formatDay(value: string, language: Language = "fr"): string { return dateFormats[language].format(new Date(value + "T00:00:00Z")); }
export function formatRange(item: Schedule, language: Language = "fr"): string {
  const labels: Record<Language, string> = { fr: "du", en: "from", pt: "de", es: "del" };
  const until: Record<Language, string> = { fr: "au", en: "to", pt: "a", es: "al" };
  return `${labels[language]} ${formatDay(item.start_date, language)} ${until[language]} ${formatDay(item.end_date, language)}`;
}

export type SessionState = "upcoming" | "ongoing" | "past";
export function sessionState(item: Schedule, today = new Date().toISOString().slice(0, 10)): SessionState {
  if (item.end_date < today) return "past";
  if (item.start_date > today) return "upcoming";
  return "ongoing";
}
export const sessionStateLabel: Record<Language, Record<SessionState, string>> = {
  fr: { upcoming: "À venir", ongoing: "En cours", past: "Terminée" },
  en: { upcoming: "Upcoming", ongoing: "In progress", past: "Completed" },
  pt: { upcoming: "A decorrer em breve", ongoing: "Em curso", past: "Concluída" },
  es: { upcoming: "Próxima", ongoing: "En curso", past: "Finalizada" },
};
