import { useCallback, useEffect, useState } from "react";
import { grantEnrollment, listAllCourses, listEnrollments, listPeople, personName, setEnrollmentStatus, type AdminCourse, type EnrollmentRow, type PersonRow } from "../../lib/adminData";
import { Feedback, errorText } from "./shared";
import { useT } from "../../lib/i18n";

export default function AdminStudents({ adminId }: { adminId: string }) {
  const t = useT({
    fr:{title:"Accès des élèves aux cours",intro:"Un élève ne voit les leçons d'un cours que si son accès est actif.",create:"{t.create}",course:"Cours",grantTo:"Accorder l'accès à",choose:"Choisir un élève…",grant:"Accorder",noneCandidate:"{t.noneCandidate}",students:"Élèves de ce cours",loading:"Chargement…",none:"{t.none}",active:"Accès actif",revoked:"Accès retiré",remove:"Retirer l'accès",restore:"Rétablir"},
    en:{title:"Student course access",intro:"Students can only view a course's lessons while their access is active.",create:"Create a course first in the Courses tab.",course:"Course",grantTo:"Grant access to",choose:"Choose a student…",grant:"Grant access",noneCandidate:"All students already have access. New students appear here after creating an account.",students:"Students in this course",loading:"Loading…",none:"No students have access to this course yet.",active:"Access active",revoked:"Access revoked",remove:"Revoke access",restore:"Restore access"},
    pt:{title:"Acesso dos alunos aos cursos",intro:"Os alunos só podem ver as aulas de um curso enquanto o acesso estiver ativo.",create:"Crie primeiro um curso no separador « Cursos ».",course:"Curso",grantTo:"Conceder acesso a",choose:"Escolher um aluno…",grant:"Conceder",noneCandidate:"Todos os alunos já têm acesso. Os novos alunos aparecem aqui depois de criarem uma conta.",students:"Alunos deste curso",loading:"A carregar…",none:"Ainda não há alunos com acesso a este curso.",active:"Acesso ativo",revoked:"Acesso removido",remove:"Retirar acesso",restore:"Restabelecer"},
    es:{title:"Acceso de los alumnos a los cursos",intro:"Los alumnos solo pueden ver las lecciones de un curso mientras su acceso esté activo.",create:"Primero crea un curso en la pestaña « Cursos ».",course:"Curso",grantTo:"Conceder acceso a",choose:"Elegir un alumno…",grant:"Conceder",noneCandidate:"Todos los alumnos ya tienen acceso. Los nuevos alumnos aparecerán aquí después de crear una cuenta.",students:"Alumnos de este curso",loading:"Cargando…",none:"Todavía no hay alumnos con acceso a este curso.",active:"Acceso activo",revoked:"Acceso revocado",remove:"Retirar acceso",restore:"Restablecer"}
  });
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
      <h2>{t.title}</h2>
      <p className="muted">{t.intro}</p>
      <Feedback error={error} />
      {courses.length === 0 ? <p className="notice">Créez d'abord un cours dans l'onglet « Cours ».</p> : (
        <>
          <label>{t.course}<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get("student") ?? ""); if (value) void run(() => grantEnrollment(courseId, value, adminId)); }}>
            <label>{t.grantTo}<select name="student" defaultValue="">{<option value="" disabled>{t.choose}</option>}{candidates.map((student) => <option key={student.id} value={student.id}>{personName(student)} {student.email ? `(${student.email})` : ""}</option>)}</select></label>
            <button className="btn small" type="submit" disabled={busy || candidates.length === 0}>{t.grant}</button>
          </form>
          {candidates.length === 0 && <p className="muted small-text">Aucun élève sans accès. Les élèves apparaissent ici après avoir créé un compte.</p>}
          <h3>{t.students}</h3>
          {rows === null && <p className="muted" role="status">{t.loading}</p>}
          {rows?.length === 0 && <p className="notice">Aucun élève n'a encore accès à ce cours.</p>}
          <ul className="stack tight">
            {rows?.map((row) => (
              <li key={row.id} className="panel row between">
                <span>{personName(byId.get(row.student_id))} <span className={`pill ${row.status === "active" ? "ongoing" : "past"}`}>{row.status === "active" ? t.active : t.revoked}</span></span>
                <button className="btn small" disabled={busy} onClick={() => void run(() => setEnrollmentStatus(row.id, row.status === "active" ? "revoked" : "active"))}>{row.status === "active" ? t.remove : t.restore}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
