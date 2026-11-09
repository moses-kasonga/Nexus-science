import { supabase } from "./supabase";

export type Schedule = { start_date: string; end_date: string; status: string };
export type Course = { id: string; name: string; category: string; description: string | null; course_schedules: Schedule[] };
export type Lesson = { id: string; title: string; content: string | null; order_index: number };

/** Seules les sessions « publiées » sont montrées au public, même à un enseignant ou à un administrateur connecté. */
function publishedSessions(course: Course): Course {
  return { ...course, course_schedules: (course.course_schedules ?? []).filter((item) => item.status === "published").sort((a, b) => a.start_date.localeCompare(b.start_date)) };
}

export async function fetchPublishedCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, category, description, course_schedules(start_date, end_date, status)")
    .eq("published", true)
    .order("name", { ascending: true });
  if (error) {
    const detail = [
      error.code,
      error.message,
      error.details,
      error.hint,
    ].filter(Boolean).join(" — ");
    throw new Error(detail || "Les cours n'ont pas pu être chargés.");
  }
  return ((data ?? []) as Course[]).map(publishedSessions);
}

export async function fetchCourse(id: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, category, description, course_schedules(start_date, end_date, status)")
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error("Ce cours n'a pas pu être chargé. Réessayez dans un instant.");
  return data ? publishedSessions(data as Course) : null;
}

/** Les règles RLS ne renvoient les leçons qu'aux inscrits, aux enseignants du cours et aux administrateurs. */
export async function fetchLessons(courseId: string): Promise<Lesson[]> {
  const { data, error } = await supabase.from("lessons").select("id, title, content, order_index").eq("course_id", courseId).order("order_index", { ascending: true });
  if (error) {
    const detail = [error.code, error.message].filter(Boolean).join(" — ");
    throw new Error(detail || "Les leçons n'ont pas pu être chargées.");
  }
  return (data ?? []) as Lesson[];
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export function formatDay(value: string): string { return dateFormat.format(new Date(value + "T00:00:00Z")); }
export function formatRange(item: Schedule): string { return `du ${formatDay(item.start_date)} au ${formatDay(item.end_date)}`; }

export type SessionState = "upcoming" | "ongoing" | "past";
export function sessionState(item: Schedule, today = new Date().toISOString().slice(0, 10)): SessionState {
  if (item.end_date < today) return "past";
  if (item.start_date > today) return "upcoming";
  return "ongoing";
}
export const sessionStateLabel: Record<SessionState, string> = { upcoming: "À venir", ongoing: "En cours", past: "Terminée" };
