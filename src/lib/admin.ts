import { supabase } from "./supabase";

export type AdminSummary = {
  courses: number | null;
  sessions: number | null;
  pendingApplications: number | null;
};

export async function fetchAdminSummary(): Promise<AdminSummary> {
  const [courses, sessions, applications] = await Promise.all([
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("course_schedules").select("id", { count: "exact", head: true }),
    supabase.from("teacher_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const errors = [courses.error, sessions.error, applications.error].filter(Boolean);
  if (errors.length) {
    throw new Error("Certaines statistiques ne sont pas accessibles avec les autorisations actuelles.");
  }

  return {
    courses: courses.count ?? 0,
    sessions: sessions.count ?? 0,
    pendingApplications: applications.count ?? 0,
  };
}
