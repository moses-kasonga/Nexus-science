import { useCallback, useEffect, useState, type FormEvent } from "react";
import { addSchedule, assignTeacher, deleteCourse, deleteLesson, deleteSchedule, listAllCourses, listCourseLessons, listPeople, personName, saveCourse, saveLesson, setScheduleStatus, unassignTeacher, type AdminCourse, type AdminSchedule, type PersonRow } from "../../lib/adminData";
import { Feedback, dayLabel, errorText, sessionStatusLabel } from "./shared";
import { useT } from "../../lib/i18n";

function CourseForm({ initial, busy, onSave, onCancel }: { initial?: AdminCourse; busy: boolean; onSave: (value: { name: string; category: string; description: string; published: boolean }) => void; onCancel: () => void }) {
  const t = useT({fr:{edit:"Modifier le cours",create:"Nouveau cours",name:"Nom du cours",category:"Catégorie",placeholder:"Biologie, Chimie, Physique…",description:"Description",published:"Publié (visible par tout le monde)",save:"Enregistrer",cancel:"Annuler"},en:{edit:"Edit course",create:"New course",name:"Course name",category:"Category",placeholder:"Biology, Chemistry, Physics…",description:"Description",published:"Published (visible to everyone)",save:"Save",cancel:"Cancel"},pt:{edit:"Editar curso",create:"Novo curso",name:"Nome do curso",category:"Categoria",placeholder:"Biologia, Química, Física…",description:"Descrição",published:"Publicado (visível para todos)",save:"Guardar",cancel:"Cancelar"},es:{edit:"Editar curso",create:"Nuevo curso",name:"Nombre del curso",category:"Categoría",placeholder:"Biología, Química, Física…",description:"Descripción",published:"Publicado (visible para todos)",save:"Guardar",cancel:"Cancelar"}});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ name: String(form.get("name") ?? ""), category: String(form.get("category") ?? ""), description: String(form.get("description") ?? ""), published: form.get("published") === "on" });
  }
  return (
    <form className="form panel" onSubmit={submit}>
      <h3>{initial ? t.edit : t.create}</h3>
      <label>{t.name}<input name="name" required maxLength={150} defaultValue={initial?.name ?? ""} /></label>
      <label>{t.category}<input name="category" required maxLength={80} placeholder={t.placeholder} defaultValue={initial?.category ?? ""} /></label>
      <label>{t.description}<textarea name="description" rows={4} maxLength={2000} defaultValue={initial?.description ?? ""} /></label>
      <label className="check"><input type="checkbox" name="published" defaultChecked={initial?.published ?? false} /> {t.published}</label>
      <div className="row"><button className="btn primary" type="submit" disabled={busy}>{t.save}</button><button className="btn" type="button" onClick={onCancel}>{t.cancel}</button></div>
    </form>
  );
}

function ScheduleAdder({ busy, onAdd }: { busy: boolean; onAdd: (start: string, end: string, status: AdminSchedule["status"]) => void }) {
  const t = useT({fr:{start:"Début",end:"Fin",status:"État",scheduled:"Planifiée",published:"Publiée",cancelled:"Annulée",add:"Ajouter la session"},en:{start:"Start",end:"End",status:"Status",scheduled:"Scheduled",published:"Published",cancelled:"Cancelled",add:"Add session"},pt:{start:"Início",end:"Fim",status:"Estado",scheduled:"Agendada",published:"Publicada",cancelled:"Cancelada",add:"Adicionar sessão"},es:{start:"Inicio",end:"Fin",status:"Estado",scheduled:"Programada",published:"Publicada",cancelled:"Cancelada",add:"Añadir sesión"}});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onAdd(String(form.get("start") ?? ""), String(form.get("end") ?? ""), String(form.get("status") ?? "scheduled") as AdminSchedule["status"]);
    event.currentTarget.reset();
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <label>{t.start}<input type="date" name="start" required /></label>
      <label>{t.end}<input type="date" name="end" required /></label>
      <label>{t.status}<select name="status" defaultValue="scheduled"><option value="scheduled">{t.scheduled}</option><option value="published">{t.published}</option><option value="cancelled">{t.cancelled}</option></select></label>
      <button className="btn small" type="submit" disabled={busy}>{t.add}</button>
    </form>
  );
}


function LessonManager({ courseId, busy, onRun }: { courseId: string; busy: boolean; onRun: (action: () => Promise<void>) => Promise<void> }) {
  const t = useT({fr:{lessons:"Leçons",add:"Ajouter une leçon",new:"Nouvelle leçon",editLesson:"Modifier la leçon",title:"Titre",content:"Contenu pédagogique",order:"Ordre pédagogique",published:"Publiée (visible aux élèves autorisés)",save:"Enregistrer",cancel:"Annuler",loading:"Chargement des leçons…",none:"Aucune leçon créée pour ce cours.",draft:"Brouillon",edit:"Modifier",unpublish:"Dépublier",publish:"Publier",remove:"Supprimer",confirm:"Supprimer définitivement la leçon « {title} » ?"},en:{lessons:"Lessons",add:"Add a lesson",new:"New lesson",editLesson:"Edit lesson",title:"Title",content:"Learning content",order:"Display order",published:"Published (visible to authorized students)",save:"Save",cancel:"Cancel",loading:"Loading lessons…",none:"No lessons created for this course.",draft:"Draft",edit:"Edit",unpublish:"Unpublish",publish:"Publish",remove:"Delete",confirm:"Permanently delete lesson “{title}”?"},pt:{lessons:"Aulas",add:"Adicionar aula",new:"Nova aula",editLesson:"Editar aula",title:"Título",content:"Conteúdo pedagógico",order:"Ordem pedagógica",published:"Publicada (visível para alunos autorizados)",save:"Guardar",cancel:"Cancelar",loading:"A carregar aulas…",none:"Ainda não foram criadas aulas para este curso.",draft:"Rascunho",edit:"Editar",unpublish:"Retirar publicação",publish:"Publicar",remove:"Eliminar",confirm:"Eliminar definitivamente a aula « {title} »?"},es:{lessons:"Lecciones",add:"Añadir una lección",new:"Nueva lección",editLesson:"Editar lección",title:"Título",content:"Contenido didáctico",order:"Orden didáctico",published:"Publicada (visible para los alumnos autorizados)",save:"Guardar",cancel:"Cancelar",loading:"Cargando lecciones…",none:"Todavía no se han creado lecciones para este curso.",draft:"Borrador",edit:"Editar",unpublish:"Retirar publicación",publish:"Publicar",remove:"Eliminar",confirm:"¿Eliminar definitivamente la lección « {title} »?"}});
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
      <div className="row between"><h4>{t.lessons}</h4>{!editing && <button className="btn small" disabled={busy} onClick={() => setEditing("new")}>{t.add}</button>}</div>
      {loadError && <Feedback error={loadError} />}
      {editing && (
        <form className="form panel" onSubmit={(event) => void submit(event)}>
          <h4>{editing === "new" ? t.new : t.editLesson}</h4>
          <label>{t.title}<input name="title" required maxLength={180} defaultValue={editing === "new" ? "" : editing.title} /></label>
          <label>{t.content}<textarea name="content" rows={7} maxLength={50000} defaultValue={editing === "new" ? "" : editing.content ?? ""} /></label>
          <label>{t.order}<input name="order_index" type="number" min="0" step="1" required defaultValue={editing === "new" ? (lessons?.length ?? 0) + 1 : editing.order_index} /></label>
          <label className="check"><input type="checkbox" name="published" defaultChecked={editing === "new" ? false : editing.published} /> {t.published}</label>
          <div className="row"><button className="btn primary small" type="submit" disabled={busy}>{t.save}</button><button className="btn small" type="button" onClick={() => setEditing(null)}>{t.cancel}</button></div>
        </form>
      )}
      {lessons === null && <p className="muted">{t.loading}</p>}
      {lessons?.length === 0 && !editing && <p className="muted small-text">{t.none}</p>}
      <ol className="stack tight">
        {lessons?.map((lesson) => (
          <li className="panel" key={lesson.id}>
            <div className="row between"><strong>{lesson.order_index}. {lesson.title}</strong><span className={`pill ${lesson.published ? "ongoing" : "past"}`}>{lesson.published ? t.published : t.draft}</span></div>
            {lesson.content && <p className="muted small-text">{lesson.content.slice(0, 240)}{lesson.content.length > 240 ? "…" : ""}</p>}
            <div className="row">
              <button className="btn small" disabled={busy} onClick={() => setEditing(lesson)}>{t.edit}</button>
              <button className="btn small" disabled={busy} onClick={() => void onRun(async () => { await saveLesson({ ...lesson, published: !lesson.published, title: lesson.title, content: lesson.content ?? "" }); await reload(); })}>{lesson.published ? t.unpublish : t.publish}</button>
              <button className="btn small danger" disabled={busy} onClick={() => { if (window.confirm(t.confirm.replace("{title}", lesson.title))) void onRun(async () => { await deleteLesson(lesson.id, courseId); await reload(); }); }}>{t.remove}</button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AdminCourses({ adminId }: { adminId: string }) {
  const t = useT({fr:{courses:"Cours",new:"Nouveau cours",loading:"Chargement…",none:"Aucun cours pour le moment.",published:"Publié",draft:"Brouillon",scheduled:"Planifiée",cancelled:"Annulée",edit:"Modifier",unpublish:"Dépublier",publish:"Publier",remove:"Supprimer",confirmCourse:"Supprimer définitivement « {name} », ses sessions, ses leçons et ses inscriptions ?",sessions:"Sessions",noSessions:"Aucune session.",sessionState:"État de la session",deleteSession:"Supprimer cette session ?",teachers:"Enseignants du cours",noTeachers:"Aucun enseignant attribué.",removeTeacher:"Retirer",assign:"Attribuer un enseignant",choose:"Choisir…",assignButton:"Attribuer",noneAvailable:"Aucun enseignant disponible : invitez-en un depuis l'onglet « Enseignants »."},en:{courses:"Courses",new:"New course",loading:"Loading…",none:"No courses yet.",published:"Published",draft:"Draft",scheduled:"Scheduled",cancelled:"Cancelled",edit:"Edit",unpublish:"Unpublish",publish:"Publish",remove:"Delete",confirmCourse:"Permanently delete “{name}”, its sessions, lessons and enrollments?",sessions:"Sessions",noSessions:"No sessions.",sessionState:"Session status",deleteSession:"Delete this session?",teachers:"Course teachers",noTeachers:"No teacher assigned.",removeTeacher:"Remove",assign:"Assign a teacher",choose:"Choose…",assignButton:"Assign",noneAvailable:"No teacher available. Invite one from the Teachers tab."},pt:{courses:"Cursos",new:"Novo curso",loading:"A carregar…",none:"Ainda não existem cursos.",published:"Publicado",draft:"Rascunho",scheduled:"Agendada",cancelled:"Cancelada",edit:"Editar",unpublish:"Retirar publicação",publish:"Publicar",remove:"Eliminar",confirmCourse:"Eliminar definitivamente « {name} », as suas sessões, aulas e inscrições?",sessions:"Sessões",noSessions:"Não existem sessões.",sessionState:"Estado da sessão",deleteSession:"Eliminar esta sessão?",teachers:"Professores do curso",noTeachers:"Nenhum professor atribuído.",removeTeacher:"Retirar",assign:"Atribuir um professor",choose:"Escolher…",assignButton:"Atribuir",noneAvailable:"Não há professores disponíveis: convide um no separador « Professores »."},es:{courses:"Cursos",new:"Nuevo curso",loading:"Cargando…",none:"Todavía no hay cursos.",published:"Publicado",draft:"Borrador",scheduled:"Programada",cancelled:"Cancelada",edit:"Editar",unpublish:"Retirar publicación",publish:"Publicar",remove:"Eliminar",confirmCourse:"¿Eliminar definitivamente « {name} », sus sesiones, lecciones e inscripciones?",sessions:"Sesiones",noSessions:"No hay sesiones.",sessionState:"Estado de la sesión",deleteSession:"¿Eliminar esta sesión?",teachers:"Profesores del curso",noTeachers:"No hay profesores asignados.",removeTeacher:"Retirar",assign:"Asignar un profesor",choose:"Elegir…",assignButton:"Asignar",noneAvailable:"No hay profesores disponibles: invita a uno desde la pestaña « Profesores »."}});
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
      <div className="row between"><h2>{t.courses}</h2>{!editing && <button className="btn primary small" onClick={() => setEditing("new")}>{t.new}</button>}</div>
      <Feedback error={error} />
      {editing && (
        <CourseForm initial={editing === "new" ? undefined : editing} busy={busy} onCancel={() => setEditing(null)}
          onSave={(value) => void run(async () => { await saveCourse({ ...value, id: editing === "new" ? undefined : editing.id }, adminId); setEditing(null); })} />
      )}
      {courses === null && <p className="muted" role="status">{t.loading}</p>}
      {courses?.length === 0 && !editing && <p className="notice">{t.none}</p>}
      <ul className="stack">
        {courses?.map((course) => {
          const assigned = course.course_teachers.map((item) => item.teacher_id);
          const available = teachers.filter((teacher) => !assigned.includes(teacher.id));
          return (
            <li key={course.id} className="panel">
              <div className="row between">
                <div><p className="tag">{course.category}</p><h3>{course.name}</h3></div>
                <span className={`pill ${course.published ? "ongoing" : "past"}`}>{course.published ? t.published : t.draft}</span>
              </div>
              {course.description && <p className="muted">{course.description}</p>}
              <div className="row">
                <button className="btn small" disabled={busy} onClick={() => setEditing(course)}>{t.edit}</button>
                <button className="btn small" disabled={busy} onClick={() => void run(() => saveCourse({ id: course.id, name: course.name, category: course.category, description: course.description ?? "", published: !course.published }, adminId))}>{course.published ? t.unpublish : t.publish}</button>
                <button className="btn small danger" disabled={busy} onClick={() => { if (window.confirm(t.confirmCourse.replace("{name}", course.name))) void run(() => deleteCourse(course.id)); }}>{t.remove}</button>
              </div>

              <h4>{t.sessions}</h4>
              <ul className="stack tight">
                {course.course_schedules.length === 0 && <li className="muted">{t.noSessions}</li>}
                {course.course_schedules.map((item) => (
                  <li key={item.id} className="row between">
                    <span>{dayLabel(item.start_date)} → {dayLabel(item.end_date)} · {sessionStatusLabel[item.status]}</span>
                    <span className="row">
                      <select aria-label={t.sessionState} value={item.status} disabled={busy} onChange={(event) => void run(() => setScheduleStatus(item.id, event.target.value as AdminSchedule["status"]))}>
                        <option value="scheduled">{t.scheduled}</option><option value="published">{t.published}</option><option value="cancelled">{t.cancelled}</option>
                      </select>
                      <button className="btn small danger" disabled={busy} onClick={() => { if (window.confirm(t.deleteSession)) void run(() => deleteSchedule(item.id)); }}>{t.remove}</button>
                    </span>
                  </li>
                ))}
              </ul>
              <ScheduleAdder busy={busy} onAdd={(start, end, status) => void run(() => addSchedule(course.id, start, end, status, adminId))} />

              <LessonManager courseId={course.id} busy={busy} onRun={run} />

              <h4>{t.teachers}</h4>
              <ul className="stack tight">
                {assigned.length === 0 && <li className="muted">{t.noTeachers}</li>}
                {assigned.map((id) => (
                  <li key={id} className="row between"><span>{personName(byId.get(id))}</span><button className="btn small" disabled={busy} onClick={() => void run(() => unassignTeacher(course.id, id))}>{t.removeTeacher}</button></li>
                ))}
              </ul>
              {available.length > 0
                ? <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get("teacher") ?? ""); if (value) void run(() => assignTeacher(course.id, value)); }}>
                    <label>{t.assign}<select name="teacher" defaultValue="">{<option value="" disabled>{t.choose}</option>}{available.map((teacher) => <option key={teacher.id} value={teacher.id}>{personName(teacher)}</option>)}</select></label>
                    <button className="btn small" type="submit" disabled={busy}>{t.assignButton}</button>
                  </form>
                : <p className="muted small-text">{t.noneAvailable}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
