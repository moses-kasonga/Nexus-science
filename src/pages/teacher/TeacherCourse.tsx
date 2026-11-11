import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { dateLocale, useLanguage, useT } from "../../lib/i18n";
import { supabase } from "../../lib/supabase";
import { Feedback, dateTimeLabel, errorText } from "../admin/shared";
import TeacherAssessments from "./TeacherAssessments";
import LessonResourcesEditor from "./LessonResourcesEditor";
import TeacherLessonPreview from "./TeacherLessonPreview";

type LessonRow = { id: string; title: string; content: string | null; order_index: number; published: boolean };
type CourseInfo = { name: string; category: string; subcategory: string | null; level: string | null; course_type: string; duration_minutes: number | null; published: boolean };
type Student = { id: string; name: string; email: string; status: string; since: string };

export default function TeacherCourse() {
  const { id = "" } = useParams();
  const locale = dateLocale[useLanguage()];
  const t = useT({
    fr: { back:"← Mes formations", loading:"Chargement…", loadingCourse:"Chargement de la formation…", missing:"Formation introuvable", noAccess:"Cette formation n'existe pas ou ne vous est pas attribuée.", lessons:"Leçons", noLessons:"Aucune leçon pour l'instant.", published:"Publiée", draft:"Brouillon", up:"Monter", down:"Descendre", edit:"Modifier", addLesson:"Ajouter une leçon", newLesson:"Nouvelle leçon", editLesson:"Modifier la leçon", title:"Titre", content:"Contenu", publish:"Publier cette leçon (visible par les élèves)", saving:"Enregistrement…", save:"Enregistrer", cancel:"Annuler", students:"Élèves inscrits", noStudents:"Aucun élève inscrit à cette formation pour le moment.", active:"Actif", removed:"Accès retiré", student:"Élève", required:"Le titre de la leçon est obligatoire.", saved:"Leçon enregistrée.", enrolled:"inscrit le" },
    en: { back:"← My courses", loading:"Loading…", loadingCourse:"Loading course…", missing:"Course not found", noAccess:"This course does not exist or has not been assigned to you.", lessons:"Lessons", noLessons:"No lessons yet.", published:"Published", draft:"Draft", up:"Move up", down:"Move down", edit:"Edit", addLesson:"Add a lesson", newLesson:"New lesson", editLesson:"Edit lesson", title:"Title", content:"Content", publish:"Publish this lesson (visible to students)", saving:"Saving…", save:"Save", cancel:"Cancel", students:"Enrolled students", noStudents:"No students are enrolled in this course yet.", active:"Active", removed:"Access revoked", student:"Student", required:"The lesson title is required.", saved:"Lesson saved.", enrolled:"enrolled on" },
    pt: { back:"← Os meus cursos", loading:"A carregar…", loadingCourse:"A carregar o curso…", missing:"Curso não encontrado", noAccess:"Este curso não existe ou não lhe foi atribuído.", lessons:"Aulas", noLessons:"Ainda não existem aulas.", published:"Publicado", draft:"Rascunho", up:"Mover para cima", down:"Mover para baixo", edit:"Editar", addLesson:"Adicionar uma aula", newLesson:"Nova aula", editLesson:"Editar aula", title:"Título", content:"Conteúdo", publish:"Publicar esta aula (visível para os alunos)", saving:"A guardar…", save:"Guardar", cancel:"Cancelar", students:"Alunos inscritos", noStudents:"Ainda não há alunos inscritos neste curso.", active:"Ativo", removed:"Acesso removido", student:"Aluno", required:"O título da aula é obrigatório.", saved:"Aula guardada.", enrolled:"inscrito em" },
    es: { back:"← Mis cursos", loading:"Cargando…", loadingCourse:"Cargando el curso…", missing:"Curso no encontrado", noAccess:"Este curso no existe o no te ha sido asignado.", lessons:"Lecciones", noLessons:"Todavía no hay lecciones.", published:"Publicada", draft:"Borrador", up:"Subir", down:"Bajar", edit:"Editar", addLesson:"Añadir una lección", newLesson:"Nueva lección", editLesson:"Editar lección", title:"Título", content:"Contenido", publish:"Publicar esta lección (visible para los alumnos)", saving:"Guardando…", save:"Guardar", cancel:"Cancelar", students:"Alumnos inscritos", noStudents:"Todavía no hay alumnos inscritos en este curso.", active:"Activo", removed:"Acceso revocado", student:"Alumno", required:"El título de la lección es obligatorio.", saved:"Lección guardada.", enrolled:"inscrito el" }
  });
  const { session, profile, loading } = useAuth();
  const userId = session?.user.id;
  const isTeacher = profile?.role === "teacher";
  const [courseName, setCourseName] = useState<string | null | undefined>(undefined);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [lessons, setLessons] = useState<LessonRow[] | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [editing, setEditing] = useState<LessonRow | "new" | null>(null);
  const [lessonContent, setLessonContent] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
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
        supabase.from("courses").select("name, category, subcategory, level, course_type, duration_minutes, published").eq("id", id).maybeSingle(),
        supabase.from("lessons").select("id, title, content, order_index, published").eq("course_id", id).order("order_index"),
        supabase.from("enrollments").select("student_id, status, created_at").eq("course_id", id).order("created_at"),
      ]);
      if (course.error) throw course.error;
      if (lessonRows.error) throw lessonRows.error;
      if (enrollRows.error) throw enrollRows.error;
      setCourseName(course.data?.name ?? null);
      setCourseInfo(course.data as CourseInfo | null);
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
        const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ") || t.student;
        return { id: row.student_id as string, name, email: person?.email ?? "", status: row.status as string, since: row.created_at as string };
      }));
    } catch (cause) { setError(errorText(cause)); setCourseName((current) => current ?? null); setLessons((current) => current ?? []); setStudents((current) => current ?? []); }
  }, [id, userId]);
  useEffect(() => { if (isTeacher) void load(); }, [isTeacher, load]);

  async function saveCourseInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();
    const durationRaw = String(form.get("duration_minutes") ?? "").trim();
    const duration = durationRaw ? Number(durationRaw) : null;
    if (!name || !category || (duration !== null && (!Number.isInteger(duration) || duration <= 0))) { setError("Vérifiez le titre, la discipline et la durée."); return; }
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await supabase.from("courses").update({
      name, category, subcategory: String(form.get("subcategory") ?? "").trim() || null,
      level: String(form.get("level") ?? "").trim() || null, course_type: String(form.get("course_type") ?? "Leçon"),
      duration_minutes: duration, updated_at: new Date().toISOString(),
    }).eq("id", id);
    setBusy(false);
    if (failure) { setError(errorText(failure)); return; }
    setNotice("Informations de la formation enregistrées.");
    await load();
  }

  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const content = lessonContent.trim();
    const published = form.get("published") === "on";
    if (!title) { setError(t.required); return; }
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
      setNotice(t.saved); setEditing(null); setLessonContent(""); setLessonTitle(""); setPreviewOpen(false); await load();
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

  if (loading) return <section className="wrap page teacher-course-page"><p className="muted" role="status">{t.loading}</p></section>;
  if (!session) return <Navigate to="/connexion" replace />;
  if (!isTeacher) return <Navigate to="/enseignant" replace />;
  if (courseName === undefined) return <section className="wrap page"><p className="muted" role="status">{t.loadingCourse}</p></section>;
  if (courseName === null) return <section className="wrap page narrow"><h1>{t.missing}</h1>{error && <p className="notice error" role="alert">{error}</p>}<p className="muted">{t.noAccess}</p><p><Link to="/enseignant">{t.back}</Link></p></section>;

  return (
    <section className="wrap page">
      <p><Link to="/enseignant">{t.back}</Link></p>
      <h1>{courseName}</h1>
      <Feedback error={error} notice={notice} />

      {courseInfo && <details className="panel" open>
        <summary><strong>Informations du cours</strong></summary>
        <form className="form" onSubmit={saveCourseInfo}>
          <label>Titre<input name="name" required maxLength={200} defaultValue={courseInfo.name} /></label>
          <label>Discipline<input name="category" required defaultValue={courseInfo.category} /></label>
          <label>Sous-discipline<input name="subcategory" defaultValue={courseInfo.subcategory ?? ""} /></label>
          <label>Niveau<select name="level" defaultValue={courseInfo.level ?? "Débutant"}><option>Débutant</option><option>Intermédiaire</option><option>Avancé</option></select></label>
          <label>Type<select name="course_type" defaultValue={courseInfo.course_type || "Leçon"}><option>Leçon</option><option>Formation</option><option>Atelier</option><option>Module</option></select></label>
          <label>Durée (minutes)<input name="duration_minutes" type="number" min="1" step="1" defaultValue={courseInfo.duration_minutes ?? 30} /></label>
          <label>Statut<input value={courseInfo.published ? "Publié" : "Brouillon"} readOnly /></label>
          <p className="muted small-text">Le statut de publication reste contrôlé par l'administration.</p>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer les informations"}</button>
        </form>
      </details>}

      <h2>{t.lessons}</h2>
      {lessons === null && <p className="muted" role="status">{t.loading}</p>}
      {lessons?.length === 0 && <p className="notice">{t.noLessons}</p>}
      <ol className="stack">
        {lessons?.map((lesson, index) => (
          <li key={lesson.id} className="panel row between">
            <span><strong>{lesson.title}</strong> {lesson.published ? <span className="pill ongoing">{t.published}</span> : <span className="pill past">{t.draft}</span>}</span>
            <span className="row">
              <button className="btn small" type="button" disabled={busy || index === 0} onClick={() => void move(lesson, -1)} aria-label={t.up}>↑</button>
              <button className="btn small" type="button" disabled={busy || index === (lessons.length - 1)} onClick={() => void move(lesson, 1)} aria-label={t.down}>↓</button>
              <button className="btn small" type="button" onClick={() => { setEditing(lesson); setLessonTitle(lesson.title); setLessonContent(lesson.content ?? ""); setPreviewOpen(false); setNotice(""); }}>{t.edit}</button>
            </span>
          </li>
        ))}
      </ol>
      {!editing && <button className="btn primary" type="button" onClick={() => { setEditing("new"); setLessonTitle(""); setLessonContent(""); setPreviewOpen(false); setNotice(""); }}>{t.addLesson}</button>}
      {editing && (
        <form className="teacher-lesson-editor" onSubmit={saveLesson} key={editing === "new" ? "new" : editing.id}>
          <div className="teacher-editor-heading">
            <div>
              <p className="eyebrow">ESPACE ENSEIGNANT · CONSTRUCTION DU COURS</p>
              <h2>{editing === "new" ? t.newLesson : t.editLesson}</h2>
              <p className="muted small-text">Préparez le contenu, ajoutez vos supports, puis vérifiez le rendu avant publication.</p>
            </div>
            <span className={editing === "new" || !editing.published ? "pill past" : "pill ongoing"}>{editing === "new" || !editing.published ? "Brouillon" : "Publiée"}</span>
          </div>

          <div className="teacher-editor-main">
            <section className="teacher-editor-section">
              <div className="teacher-section-heading"><span className="teacher-section-number">1</span><div><h3>Contenu de la leçon</h3><p className="muted small-text">Donnez un titre clair et structurez votre explication.</p></div></div>
              <label>{t.title}<input name="title" required maxLength={200} value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="Ex. : La cellule, unité fondamentale du vivant" /></label>
              <label>{t.content}<textarea className="teacher-lesson-content-input" name="content" rows={16} value={lessonContent} onChange={(event) => setLessonContent(event.target.value)} placeholder="Commencez à rédiger votre leçon ici…&#10;&#10;Présentez les notions essentielles, les explications et les exemples." /></label>
            </section>

            <section className="teacher-editor-section teacher-editor-resources">
              <div className="teacher-section-heading"><span className="teacher-section-number">2</span><div><h3>Supports pédagogiques</h3><p className="muted small-text">Illustrez la leçon avec des images, des vidéos et des documents.</p></div></div>
              {editing !== "new" && <LessonResourcesEditor courseId={id} lessonId={editing.id} content={lessonContent} onContentChange={setLessonContent} />}
              {editing === "new" && <p className="teacher-editor-hint">Enregistrez d’abord cette leçon en brouillon. Vous pourrez ensuite ajouter ses images, vidéos et fichiers PDF depuis le même espace.</p>}
            </section>
          </div>

          <aside className="teacher-editor-settings">
            <div className="teacher-section-heading"><span className="teacher-section-number">3</span><div><h3>Publication</h3><p className="muted small-text">Contrôlez la visibilité de cette leçon.</p></div></div>
            <label className="teacher-publish-option"><input type="checkbox" name="published" defaultChecked={editing === "new" ? false : editing.published} /><span><strong>Publier cette leçon</strong><small>Visible par les élèves inscrits après enregistrement.</small></span></label>
            <p className="muted small-text">Vous pouvez prévisualiser votre travail sans le publier. L’aperçu ne change jamais le statut de la leçon.</p>
          </aside>

          <div className="teacher-editor-actions">
            <button className="btn" type="button" onClick={() => setPreviewOpen(true)} disabled={!lessonTitle.trim()}>Aperçu avant publication</button>
            <span className="teacher-editor-action-spacer" />
            <button className="btn" type="button" onClick={() => { setEditing(null); setLessonTitle(""); setLessonContent(""); setPreviewOpen(false); }}>{t.cancel}</button>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? t.saving : t.save}</button>
          </div>
          {previewOpen && <TeacherLessonPreview courseId={id} lessonId={editing === "new" ? null : editing.id} title={lessonTitle} content={lessonContent} onClose={() => setPreviewOpen(false)} />}
        </form>
      )}

      {students && <TeacherAssessments courseId={id} students={students.map((student) => ({ id: student.id, name: student.name, email: student.email, status: student.status }))} />}

      <h2>{t.students}</h2>
      {students === null && <p className="muted" role="status">{t.loading}</p>}
      {students?.length === 0 && <p className="notice">{t.noStudents}</p>}
      <ul className="stack tight">
        {students?.map((student) => (
          <li key={student.id} className="panel row between">
            <span>{student.name}<br /><span className="muted small-text">{student.email} · {t.enrolled} {dateTimeLabel(student.since, locale)}</span></span>
            <span className={`pill ${student.status === "active" ? "ongoing" : "past"}`}>{student.status === "active" ? t.active : t.removed}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
