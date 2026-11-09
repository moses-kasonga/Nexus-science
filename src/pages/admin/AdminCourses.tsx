import { useCallback, useEffect, useState, type FormEvent } from "react";
import { addSchedule, assignTeacher, deleteCourse, deleteLesson, deleteSchedule, listAllCourses, listCourseLessons, listPeople, personName, saveCourse, saveLesson, setScheduleStatus, unassignTeacher, type AdminCourse, type AdminSchedule, type PersonRow } from "../../lib/adminData";
import { Feedback, dayLabel, errorText, sessionStatusLabel } from "./shared";

function CourseForm({ initial, busy, onSave, onCancel }: { initial?: AdminCourse; busy: boolean; onSave: (value: { name: string; category: string; description: string; published: boolean }) => void; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ name: String(form.get("name") ?? ""), category: String(form.get("category") ?? ""), description: String(form.get("description") ?? ""), published: form.get("published") === "on" });
  }
  return (
    <form className="form panel" onSubmit={submit}>
      <h3>{initial ? "Modifier le cours" : "Nouveau cours"}</h3>
      <label>Nom du cours<input name="name" required maxLength={150} defaultValue={initial?.name ?? ""} /></label>
      <label>Catégorie<input name="category" required maxLength={80} placeholder="Biologie, Chimie, Physique…" defaultValue={initial?.category ?? ""} /></label>
      <label>Description<textarea name="description" rows={4} maxLength={2000} defaultValue={initial?.description ?? ""} /></label>
      <label className="check"><input type="checkbox" name="published" defaultChecked={initial?.published ?? false} /> Publié (visible par tout le monde)</label>
      <div className="row"><button className="btn primary" type="submit" disabled={busy}>Enregistrer</button><button className="btn" type="button" onClick={onCancel}>Annuler</button></div>
    </form>
  );
}

function ScheduleAdder({ busy, onAdd }: { busy: boolean; onAdd: (start: string, end: string, status: AdminSchedule["status"]) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onAdd(String(form.get("start") ?? ""), String(form.get("end") ?? ""), String(form.get("status") ?? "scheduled") as AdminSchedule["status"]);
    event.currentTarget.reset();
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <label>Début<input type="date" name="start" required /></label>
      <label>Fin<input type="date" name="end" required /></label>
      <label>État<select name="status" defaultValue="scheduled"><option value="scheduled">Planifiée</option><option value="published">Publiée</option><option value="cancelled">Annulée</option></select></label>
      <button className="btn small" type="submit" disabled={busy}>Ajouter la session</button>
    </form>
  );
}


function LessonManager({ courseId, busy, onRun }: { courseId: string; busy: boolean; onRun: (action: () => Promise<void>) => Promise<void> }) {
  const [lessons, setLessons] = useState<import("../../lib/adminData").AdminLesson[] | null>(null);
  const [editing, setEditing] = useState<import("../../lib/adminData").AdminLesson | "new" | null>(null);
  const [loadError, setLoadError] = useState("");
  const reload = useCallback(async () => {
    try { const rows = await listCourseLessons(courseId); setLessons(rows); setLoadError(""); }
    catch (cause) { setLoadError(errorText(cause)); setLessons([]); }
  }, [courseId]);
  useEffect(() => { void reload(); }, [reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      id: editing !== "new" && editing ? editing.id : undefined,
      course_id: courseId,
      title: String(form.get("title") ?? ""),
      content: String(form.get("content") ?? ""),
      order_index: Math.max(0, Number(form.get("order_index") ?? 0)),
      published: form.get("published") === "on",
    };
    await onRun(async () => {
      await saveLesson(input);
      setEditing(null);
      await reload();
    });
  }

  return (
    <section className="lesson-admin">
      <div className="row between"><h4>Leçons</h4>{!editing && <button className="btn small" disabled={busy} onClick={() => setEditing("new")}>Ajouter une leçon</button>}</div>
      {loadError && <Feedback error={loadError} />}
      {editing && (
        <form className="form panel" onSubmit={(event) => void submit(event)}>
          <h4>{editing === "new" ? "Nouvelle leçon" : "Modifier la leçon"}</h4>
          <label>Titre<input name="title" required maxLength={180} defaultValue={editing === "new" ? "" : editing.title} /></label>
          <label>Contenu pédagogique<textarea name="content" rows={7} maxLength={50000} defaultValue={editing === "new" ? "" : editing.content ?? ""} /></label>
          <label>Ordre pédagogique<input name="order_index" type="number" min="0" step="1" required defaultValue={editing === "new" ? (lessons?.length ?? 0) + 1 : editing.order_index} /></label>
          <label className="check"><input type="checkbox" name="published" defaultChecked={editing === "new" ? false : editing.published} /> Publiée (visible aux élèves autorisés)</label>
          <div className="row"><button className="btn primary small" type="submit" disabled={busy}>Enregistrer</button><button className="btn small" type="button" onClick={() => setEditing(null)}>Annuler</button></div>
        </form>
      )}
      {lessons === null && <p className="muted">Chargement des leçons…</p>}
      {lessons?.length === 0 && !editing && <p className="muted small-text">Aucune leçon créée pour ce cours.</p>}
      <ol className="stack tight">
        {lessons?.map((lesson) => (
          <li className="panel" key={lesson.id}>
            <div className="row between"><strong>{lesson.order_index}. {lesson.title}</strong><span className={`pill ${lesson.published ? "ongoing" : "past"}`}>{lesson.published ? "Publiée" : "Brouillon"}</span></div>
            {lesson.content && <p className="muted small-text">{lesson.content.slice(0, 240)}{lesson.content.length > 240 ? "…" : ""}</p>}
            <div className="row">
              <button className="btn small" disabled={busy} onClick={() => setEditing(lesson)}>Modifier</button>
              <button className="btn small" disabled={busy} onClick={() => void onRun(async () => { await saveLesson({ ...lesson, published: !lesson.published, title: lesson.title, content: lesson.content ?? "" }); await reload(); })}>{lesson.published ? "Dépublier" : "Publier"}</button>
              <button className="btn small danger" disabled={busy} onClick={() => { if (window.confirm(`Supprimer définitivement la leçon « ${lesson.title} » ?`)) void onRun(async () => { await deleteLesson(lesson.id, courseId); await reload(); }); }}>Supprimer</button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AdminCourses({ adminId }: { adminId: string }) {
  const [courses, setCourses] = useState<AdminCourse[] | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [editing, setEditing] = useState<AdminCourse | "new" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try { const [list, accounts] = await Promise.all([listAllCourses(), listPeople()]); setCourses(list); setPeople(accounts); }
    catch (cause) { setError(errorText(cause)); setCourses((current) => current ?? []); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); await reload(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  const teachers = people.filter((person) => person.role === "teacher");
  const byId = new Map(people.map((person) => [person.id, person]));

  return (
    <div>
      <div className="row between"><h2>Cours</h2>{!editing && <button className="btn primary small" onClick={() => setEditing("new")}>Nouveau cours</button>}</div>
      <Feedback error={error} />
      {editing && (
        <CourseForm initial={editing === "new" ? undefined : editing} busy={busy} onCancel={() => setEditing(null)}
          onSave={(value) => void run(async () => { await saveCourse({ ...value, id: editing === "new" ? undefined : editing.id }, adminId); setEditing(null); })} />
      )}
      {courses === null && <p className="muted" role="status">Chargement…</p>}
      {courses?.length === 0 && !editing && <p className="notice">Aucun cours pour le moment.</p>}
      <ul className="stack">
        {courses?.map((course) => {
          const assigned = course.course_teachers.map((item) => item.teacher_id);
          const available = teachers.filter((teacher) => !assigned.includes(teacher.id));
          return (
            <li key={course.id} className="panel">
              <div className="row between">
                <div><p className="tag">{course.category}</p><h3>{course.name}</h3></div>
                <span className={`pill ${course.published ? "ongoing" : "past"}`}>{course.published ? "Publié" : "Brouillon"}</span>
              </div>
              {course.description && <p className="muted">{course.description}</p>}
              <div className="row">
                <button className="btn small" disabled={busy} onClick={() => setEditing(course)}>Modifier</button>
                <button className="btn small" disabled={busy} onClick={() => void run(() => saveCourse({ id: course.id, name: course.name, category: course.category, description: course.description ?? "", published: !course.published }, adminId))}>{course.published ? "Dépublier" : "Publier"}</button>
                <button className="btn small danger" disabled={busy} onClick={() => { if (window.confirm(`Supprimer définitivement « ${course.name} », ses sessions, ses leçons et ses inscriptions ?`)) void run(() => deleteCourse(course.id)); }}>Supprimer</button>
              </div>

              <h4>Sessions</h4>
              <ul className="stack tight">
                {course.course_schedules.length === 0 && <li className="muted">Aucune session.</li>}
                {course.course_schedules.map((item) => (
                  <li key={item.id} className="row between">
                    <span>{dayLabel(item.start_date)} → {dayLabel(item.end_date)} · {sessionStatusLabel[item.status]}</span>
                    <span className="row">
                      <select aria-label="État de la session" value={item.status} disabled={busy} onChange={(event) => void run(() => setScheduleStatus(item.id, event.target.value as AdminSchedule["status"]))}>
                        <option value="scheduled">Planifiée</option><option value="published">Publiée</option><option value="cancelled">Annulée</option>
                      </select>
                      <button className="btn small danger" disabled={busy} onClick={() => { if (window.confirm("Supprimer cette session ?")) void run(() => deleteSchedule(item.id)); }}>Supprimer</button>
                    </span>
                  </li>
                ))}
              </ul>
              <ScheduleAdder busy={busy} onAdd={(start, end, status) => void run(() => addSchedule(course.id, start, end, status, adminId))} />

              <LessonManager courseId={course.id} busy={busy} onRun={run} />

              <h4>Enseignants du cours</h4>
              <ul className="stack tight">
                {assigned.length === 0 && <li className="muted">Aucun enseignant attribué.</li>}
                {assigned.map((id) => (
                  <li key={id} className="row between"><span>{personName(byId.get(id))}</span><button className="btn small" disabled={busy} onClick={() => void run(() => unassignTeacher(course.id, id))}>Retirer</button></li>
                ))}
              </ul>
              {available.length > 0
                ? <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get("teacher") ?? ""); if (value) void run(() => assignTeacher(course.id, value)); }}>
                    <label>Attribuer un enseignant<select name="teacher" defaultValue="">{<option value="" disabled>Choisir…</option>}{available.map((teacher) => <option key={teacher.id} value={teacher.id}>{personName(teacher)}</option>)}</select></label>
                    <button className="btn small" type="submit" disabled={busy}>Attribuer</button>
                  </form>
                : <p className="muted small-text">Aucun enseignant disponible : invitez-en un depuis l'onglet « Enseignants ».</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
