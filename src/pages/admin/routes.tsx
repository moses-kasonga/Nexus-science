import { useAuth } from "../../lib/auth";
import AdminCourses from "./AdminCourses";
import AdminStudents from "./AdminStudents";

/** Les écrans qui enregistrent des données ont besoin de l'identifiant de l'administrateur connecté. */
export function CoursesRoute() {
  const { session } = useAuth();
  return session ? <AdminCourses adminId={session.user.id} /> : null;
}

export function StudentsRoute() {
  const { session } = useAuth();
  return session ? <AdminStudents adminId={session.user.id} /> : null;
}
