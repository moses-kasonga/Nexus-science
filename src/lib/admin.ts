import { supabase } from "./supabase";

export type AdminSummary = {
  courses: number | null;
  sessions: number | null;
  pendingApplications: number | null;
};

export async function fetchAdminSummary(): Promise<AdminSummary> {
  const [courses, sessions, teacherApplications, candidateApplications] = await Promise.all([
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("course_schedules").select("id", { count: "exact", head: true }),
    supabase.from("teacher_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("candidate_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
  ]);

  const errors = [courses.error, sessions.error, teacherApplications.error, candidateApplications.error].filter(Boolean);
  if (errors.length) {
    throw new Error("Certaines statistiques ne sont pas accessibles avec les autorisations actuelles.");
  }

  return {
    courses: courses.count ?? 0,
    sessions: sessions.count ?? 0,
    pendingApplications: (teacherApplications.count ?? 0) + (candidateApplications.count ?? 0),
  };
}
