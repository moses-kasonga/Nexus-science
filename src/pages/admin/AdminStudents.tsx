import { useCallback, useEffect, useState } from "react";
import { grantEnrollment, listAllCourses, listEnrollments, listPeople, personName, setEnrollmentStatus, type AdminCourse, type EnrollmentRow, type PersonRow } from "../../lib/adminData";
import { Feedback, errorText } from "./shared";

export default function AdminStudents({ adminId }: { adminId: string }) {
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [courseId, setCourseId] = useState("");
  const [rows, setRows] = useState<EnrollmentRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([listAllCourses(), listPeople()]).then(([list, accounts]) => { setCourses(list); setPeople(accounts); if (list[0]) setCourseId(list[0].id); }).catch((cause) => setError(errorText(cause)));
  }, []);

  const reload = useCallback(async () => {
    if (!courseId) { setRows([]); return; }
    try { setRows(await listEnrollments(courseId)); } catch (cause) { setError(errorText(cause)); setRows([]); }
  }, [courseId]);
  useEffect(() => { setRows(null); void reload(); }, [reload]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); await reload(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  const byId = new Map(people.map((person) => [person.id, person]));
  const enrolled = new Set((rows ?? []).filter((row) => row.status === "active").map((row) => row.student_id));
  const candidates = people.filter((person) => person.role === "student" && !enrolled.has(person.id));

  return (
    <div>
      <h2>Accès des élèves aux cours</h2>
      <p className="muted">Un élève ne voit les leçons d'un cours que si son accès est actif.</p>
      <Feedback error={error} />
      {courses.length === 0 ? <p className="notice">Créez d'abord un cours dans l'onglet « Cours ».</p> : (
        <>
          <label>Cours<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get("student") ?? ""); if (value) void run(() => grantEnrollment(courseId, value, adminId)); }}>
            <label>Accorder l'accès à<select name="student" defaultValue="">{<option value="" disabled>Choisir un élève…</option>}{candidates.map((student) => <option key={student.id} value={student.id}>{personName(student)} {student.email ? `(${student.email})` : ""}</option>)}</select></label>
            <button className="btn small" type="submit" disabled={busy || candidates.length === 0}>Accorder</button>
          </form>
          {candidates.length === 0 && <p className="muted small-text">Aucun élève sans accès. Les élèves apparaissent ici après avoir créé un compte.</p>}
          <h3>Élèves de ce cours</h3>
          {rows === null && <p className="muted" role="status">Chargement…</p>}
          {rows?.length === 0 && <p className="notice">Aucun élève n'a encore accès à ce cours.</p>}
          <ul className="stack tight">
            {rows?.map((row) => (
              <li key={row.id} className="panel row between">
                <span>{personName(byId.get(row.student_id))} <span className={`pill ${row.status === "active" ? "ongoing" : "past"}`}>{row.status === "active" ? "Accès actif" : "Accès retiré"}</span></span>
                <button className="btn small" disabled={busy} onClick={() => void run(() => setEnrollmentStatus(row.id, row.status === "active" ? "revoked" : "active"))}>{row.status === "active" ? "Retirer l'accès" : "Rétablir"}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
