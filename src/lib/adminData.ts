import { supabase } from "./supabase";
import type { Role } from "./auth";

/** Convertit une erreur Supabase en message lisible (les messages des fonctions de la base sont déjà en français). */
function fail(error: { message: string } | null, fallback: string): never {
  const detail = error?.message && /[àâçéèêëîïôûùüœ]|Réservé|déjà|introuvable|invalide/i.test(error.message) ? error.message : "";
  throw new Error(detail ? `${fallback} (${detail})` : fallback);
}

export type AdminSchedule = { id: string; start_date: string; end_date: string; status: "scheduled" | "published" | "cancelled" };
export type AdminCourse = { id: string; name: string; category: string; description: string | null; published: boolean; course_schedules: AdminSchedule[]; course_teachers: { teacher_id: string }[] };
export type PersonRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; role: Role };
export type EnrollmentRow = { id: string; student_id: string; status: "active" | "revoked"; created_at: string };
export type InvitationRow = { id: string; email: string; expires_at: string; used_at: string | null; revoked_at: string | null; created_at: string };
export type ApplicationRow = { id: string; user_id: string; specialty: string | null; qualifications: string | null; experience: string | null; motivation: string | null; status: "pending" | "approved" | "rejected"; rejection_reason: string | null; created_at: string };

export function personName(person?: Pick<PersonRow, "first_name" | "last_name" | "email"> | null): string {
  const full = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
  return full || person?.email || "Compte sans nom";
}

// ---------- Cours ----------
export async function listAllCourses(): Promise<AdminCourse[]> {
  const { data, error } = await supabase.from("courses")
    .select("id, name, category, description, published, course_schedules(id, start_date, end_date, status), course_teachers(teacher_id)")
    .order("name", { ascending: true });
  if (error) fail(error, "Les cours n'ont pas pu être chargés.");
  return ((data ?? []) as AdminCourse[]).map((course) => ({ ...course, course_schedules: [...course.course_schedules].sort((a, b) => a.start_date.localeCompare(b.start_date)) }));
}

export async function saveCourse(input: { id?: string; name: string; category: string; description: string; published: boolean }, adminId: string): Promise<void> {
  const row = { name: input.name.trim(), category: input.category.trim(), description: input.description.trim() || null, published: input.published, updated_at: new Date().toISOString() };
  const { error } = input.id
    ? await supabase.from("courses").update(row).eq("id", input.id)
    : await supabase.from("courses").insert({ ...row, admin_id: adminId });
  if (error) fail(error, "Le cours n'a pas pu être enregistré.");
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) fail(error, "Le cours n'a pas pu être supprimé.");
}

export async function addSchedule(courseId: string, start: string, end: string, status: AdminSchedule["status"], adminId: string): Promise<void> {
  const { error } = await supabase.from("course_schedules").insert({ course_id: courseId, start_date: start, end_date: end, status, created_by: adminId });
  if (error) fail(error, "La session n'a pas pu être ajoutée (vérifiez que la date de fin n'est pas avant le début).");
}

export async function setScheduleStatus(id: string, status: AdminSchedule["status"]): Promise<void> {
  const { error } = await supabase.from("course_schedules").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error, "La session n'a pas pu être modifiée.");
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from("course_schedules").delete().eq("id", id);
  if (error) fail(error, "La session n'a pas pu être supprimée.");
}

// ---------- Personnes ----------
export async function listPeople(): Promise<PersonRow[]> {
  const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, email, role").order("created_at", { ascending: true });
  if (error) fail(error, "La liste des comptes n'a pas pu être chargée.");
  return (data ?? []) as PersonRow[];
}


// ---------- Leçons (administration) ----------
export type AdminLesson = { id: string; course_id: string; title: string; content: string | null; order_index: number; published: boolean };

export async function listCourseLessons(courseId: string): Promise<AdminLesson[]> {
  const { data, error } = await supabase.from("lessons")
    .select("id, course_id, title, content, order_index, published")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });
  if (error) fail(error, "Les leçons de ce cours n'ont pas pu être chargées.");
  return (data ?? []) as AdminLesson[];
}

export async function saveLesson(input: { id?: string; course_id: string; title: string; content: string; order_index: number; published: boolean }): Promise<void> {
  const row = { title: input.title.trim(), content: input.content.trim() || null, order_index: input.order_index, published: input.published, updated_at: new Date().toISOString() };
  const { error } = input.id
    ? await supabase.from("lessons").update(row).eq("id", input.id).eq("course_id", input.course_id)
    : await supabase.from("lessons").insert({ ...row, course_id: input.course_id });
  if (error) fail(error, "La leçon n'a pas pu être enregistrée.");
}

export async function deleteLesson(id: string, courseId: string): Promise<void> {
  const { error } = await supabase.from("lessons").delete().eq("id", id).eq("course_id", courseId);
  if (error) fail(error, "La leçon n'a pas pu être supprimée.");
}

// ---------- Inscriptions et enseignants d'un cours ----------
export async function listEnrollments(courseId: string): Promise<EnrollmentRow[]> {
  const { data, error } = await supabase.from("enrollments").select("id, student_id, status, created_at").eq("course_id", courseId).order("created_at", { ascending: false });
  if (error) fail(error, "Les inscriptions n'ont pas pu être chargées.");
  return (data ?? []) as EnrollmentRow[];
}

export async function grantEnrollment(courseId: string, studentId: string, adminId: string): Promise<void> {
  const { error } = await supabase.from("enrollments").upsert({ course_id: courseId, student_id: studentId, status: "active", granted_by: adminId, updated_at: new Date().toISOString() }, { onConflict: "course_id,student_id" });
  if (error) fail(error, "L'accès n'a pas pu être accordé.");
}

export async function setEnrollmentStatus(id: string, status: EnrollmentRow["status"]): Promise<void> {
  const { error } = await supabase.from("enrollments").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) fail(error, "L'inscription n'a pas pu être modifiée.");
}

export async function assignTeacher(courseId: string, teacherId: string): Promise<void> {
  const { error } = await supabase.from("course_teachers").upsert({ course_id: courseId, teacher_id: teacherId }, { onConflict: "course_id,teacher_id", ignoreDuplicates: true });
  if (error) fail(error, "L'enseignant n'a pas pu être attribué au cours.");
}

export async function unassignTeacher(courseId: string, teacherId: string): Promise<void> {
  const { error } = await supabase.from("course_teachers").delete().eq("course_id", courseId).eq("teacher_id", teacherId);
  if (error) fail(error, "L'enseignant n'a pas pu être retiré du cours.");
}

// ---------- Invitations et candidatures d'enseignants ----------
export async function listInvitations(): Promise<InvitationRow[]> {
  const { data, error } = await supabase.from("teacher_invitations").select("id, email, expires_at, used_at, revoked_at, created_at").order("created_at", { ascending: false }).limit(50);
  if (error) fail(error, "Les invitations n'ont pas pu être chargées.");
  return (data ?? []) as InvitationRow[];
}

/** Le jeton en clair n'est renvoyé qu'une seule fois, à la création : la base n'en garde que l'empreinte. */
export async function createInvitation(email: string): Promise<{ token: string; email: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc("create_teacher_invitation", { p_email: email });
  if (error) fail(error, "L'invitation n'a pas pu être créée.");
  const row = (Array.isArray(data) ? data[0] : data) as { raw_token: string; email: string; expires_at: string } | undefined;
  if (!row?.raw_token) throw new Error("L'invitation n'a pas pu être créée.");
  return { token: row.raw_token, email: row.email, expiresAt: row.expires_at };
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await supabase.from("teacher_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("used_at", null).is("revoked_at", null);
  if (error) fail(error, "L'invitation n'a pas pu être annulée.");
}

export async function listApplications(): Promise<ApplicationRow[]> {
  const { data, error } = await supabase.from("teacher_applications").select("id, user_id, specialty, qualifications, experience, motivation, status, rejection_reason, created_at").order("created_at", { ascending: false }).limit(50);
  if (error) fail(error, "Les candidatures n'ont pas pu être chargées.");
  return (data ?? []) as ApplicationRow[];
}

export async function approveApplication(id: string): Promise<void> {
  const { error } = await supabase.rpc("approve_teacher_application", { p_application_id: id });
  if (error) fail(error, "La candidature n'a pas pu être approuvée.");
}

export async function rejectApplication(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("reject_teacher_application", { p_application_id: id, p_reason: reason.trim() || null });
  if (error) fail(error, "La candidature n'a pas pu être refusée.");
}
