import { supabase } from "./supabase";

export type AdminSummary = {
  courses: number | null;
  sessions: number | null;
  pendingApplications: number | null;
  users: number | null;
  students: number | null;
  teachers: number | null;
};

export async function fetchAdminSummary(): Promise<AdminSummary> {
  const [courses, sessions, teacherApplications, candidateApplications, users, students, teachers] = await Promise.all([
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("course_schedules").select("id", { count: "exact", head: true }),
    supabase.from("teacher_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("candidate_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher"),
  ]);

  const candidateTableMissing = candidateApplications.error?.code === "PGRST205" || candidateApplications.error?.code === "42P01";
  const errors = [courses.error, sessions.error, teacherApplications.error, users.error, students.error, teachers.error, candidateApplications.error && !candidateTableMissing ? candidateApplications.error : null].filter(Boolean);
  if (errors.length) {
    throw new Error("Certaines statistiques ne sont pas accessibles avec les autorisations actuelles.");
  }

  return {
    courses: courses.count ?? 0,
    sessions: sessions.count ?? 0,
    pendingApplications: (teacherApplications.count ?? 0) + (candidateTableMissing ? 0 : candidateApplications.count ?? 0),
    users: users.count ?? 0,
    students: students.count ?? 0,
    teachers: teachers.count ?? 0,
  };
}
