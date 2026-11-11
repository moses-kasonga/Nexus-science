import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { Feedback, dateTimeLabel, errorText } from "../admin/shared";
import TeacherAssessments from "./TeacherAssessments";

type LessonRow = { id: string; title: string; content: string | null; order_index: number; published: boolean };
type Student = { id: string; name: string; email: string; status: string; since: string };

export default function TeacherCourse() {
  const { id = "" } = useParams();
  const { session, profile, loading } = useAuth();
  const userId = session?.user.id;
  const isTeacher = profile?.role === "teacher";
  const [courseName, setCourseName] = useState<string | null | undefined>(undefined);
  const [lessons, setLessons] = useState<LessonRow[] | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [editing, setEditing] = useState<LessonRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: link, error: linkError } = await supabase.from("course_teachers").select("course_id").eq("course_id", id).eq("teacher_id", userId).maybeSingle();
      if (linkError) throw linkError;
      if (!link) { setCourseName(null); return; }
      const [course, lessonRows, enrollRows] = await Promise.all([
        supabase.from("courses").select("name").eq("id", id).maybeSingle(),
        supabase.from("lessons").select("id, title, content, order_index, published").eq("course_id", id).order("order_index"),
        supabase.from("enrollments").select("student_id, status, created_at").eq("course_id", id).order("created_at"),
      ]);
      if (course.error) throw course.error;
      if (lessonRows.error) throw lessonRows.error;
      if (enrollRows.error) throw enrollRows.error;
      setCourseName(course.data?.name ?? null);
      setLessons((lessonRows.data ?? []) as LessonRow[]);
      const ids = (enrollRows.data ?? []).map((row) => row.student_id as string);
      const people = new Map<string, { first_name: string | null; last_name: string | null; email: string | null }>();
      if (ids.length > 0) {
        const { data, error: peopleError } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids);
        if (peopleError) throw peopleError;
        for (const row of data ?? []) people.set(row.id as string, row as { first_name: string | null; last_name: string | null; email: string | null });
      }
      setStudents((enrollRows.data ?? []).map((row) => {
        const person = people.get(row.student_id as string);
        const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Élève";
        return { id: row.student_id as string, name, email: person?.email ?? "", status: row.status as string, since: row.created_at as string };
      }));
    } catch (cause) { setError(errorText(cause)); setCourseName((current) => current ?? null); setLessons((current) => current ?? []); setStudents((current) => current ?? []); }
  }, [id, userId]);
  useEffect(() => { if (isTeacher) void load(); }, [isTeacher, load]);

  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const content = String(form.get("content") ?? "").trim();
    const published = form.get("published") === "on";
    if (!title) { setError("Le titre de la leçon est obligatoire."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if (editing && editing !== "new") {
        const { error: failure } = await supabase.from("lessons").update({ title, content: content || null, published, updated_at: new Date().toISOString() }).eq("id", editing.id);
        if (failure) throw failure;
      } else {
        const next = (lessons ?? []).reduce((max, item) => Math.max(max, item.order_index), 0) + 1;
        const { error: failure } = await supabase.from("lessons").insert({ course_id: id, title, content: content || null, order_index: next, published });
        if (failure) throw failure;
      }
      setNotice("Leçon enregistrée."); setEditing(null); await load();
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function move(lesson: LessonRow, direction: -1 | 1) {
    const list = lessons ?? [];
    const index = list.findIndex((item) => item.id === lesson.id);
    const other = list[index + direction];
    if (!other) return;
    setBusy(true); setError("");
    try {
      const first = await supabase.from("lessons").update({ order_index: other.order_index }).eq("id", lesson.id);
      if (first.error) throw first.error;
      const second = await supabase.from("lessons").update({ order_index: lesson.order_index }).eq("id", other.id);
      if (second.error) throw second.error;
      await load();
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  if (loading) return <section className="wrap page"><p className="muted" role="status">Chargement…</p></section>;
  if (!session) return <Navigate to="/connexion" replace />;
  if (!isTeacher) return <Navigate to="/enseignant" replace />;
  if (courseName === undefined) return <section className="wrap page"><p className="muted" role="status">Chargement de la formation…</p></section>;
  if (courseName === null) return <section className="wrap page narrow"><h1>Formation introuvable</h1>{error && <p className="notice error" role="alert">{error}</p>}<p className="muted">Cette formation n'existe pas ou ne vous est pas attribuée.</p><p><Link to="/enseignant">← Mes formations</Link></p></section>;

  return (
    <section className="wrap page">
      <p><Link to="/enseignant">← Mes formations</Link></p>
      <h1>{courseName}</h1>
      <Feedback error={error} notice={notice} />

      <h2>Leçons</h2>
      {lessons === null && <p className="muted" role="status">Chargement…</p>}
      {lessons?.length === 0 && <p className="notice">Aucune leçon pour l'instant.</p>}
      <ol className="stack">
        {lessons?.map((lesson, index) => (
          <li key={lesson.id} className="panel row between">
            <span><strong>{lesson.title}</strong> {lesson.published ? <span className="pill ongoing">Publiée</span> : <span className="pill past">Brouillon</span>}</span>
            <span className="row">
              <button className="btn small" type="button" disabled={busy || index === 0} onClick={() => void move(lesson, -1)} aria-label="Monter">↑</button>
              <button className="btn small" type="button" disabled={busy || index === (lessons.length - 1)} onClick={() => void move(lesson, 1)} aria-label="Descendre">↓</button>
              <button className="btn small" type="button" onClick={() => { setEditing(lesson); setNotice(""); }}>Modifier</button>
            </span>
          </li>
        ))}
      </ol>
      {!editing && <button className="btn primary" type="button" onClick={() => { setEditing("new"); setNotice(""); }}>Ajouter une leçon</button>}
      {editing && (
        <form className="panel form" onSubmit={saveLesson} key={editing === "new" ? "new" : editing.id}>
          <h3>{editing === "new" ? "Nouvelle leçon" : "Modifier la leçon"}</h3>
          <label>Titre<input name="title" required maxLength={200} defaultValue={editing === "new" ? "" : editing.title} /></label>
          <label>Contenu<textarea name="content" rows={10} defaultValue={editing === "new" ? "" : editing.content ?? ""} /></label>
          <label className="check"><input type="checkbox" name="published" defaultChecked={editing === "new" ? false : editing.published} /> Publier cette leçon (visible par les élèves)</label>
          <div className="row"><button className="btn primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button><button className="btn" type="button" onClick={() => setEditing(null)}>Annuler</button></div>
        </form>
      )}

      {students && <TeacherAssessments courseId={id} students={students.map((student) => ({ id: student.id, name: student.name, email: student.email, status: student.status }))} />}

      <h2>Élèves inscrits</h2>
      {students === null && <p className="muted" role="status">Chargement…</p>}
      {students?.length === 0 && <p className="notice">Aucun élève inscrit à cette formation pour le moment.</p>}
      <ul className="stack tight">
        {students?.map((student) => (
          <li key={student.id} className="panel row between">
            <span>{student.name}<br /><span className="muted small-text">{student.email} · inscrit le {dateTimeLabel(student.since)}</span></span>
            <span className={`pill ${student.status === "active" ? "ongoing" : "past"}`}>{student.status === "active" ? "Actif" : "Accès retiré"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
