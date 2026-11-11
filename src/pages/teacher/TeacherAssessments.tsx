import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { Feedback, dayLabel, errorText } from "../admin/shared";
import { useT } from "../../lib/i18n";

export type RosterStudent = { id: string; name: string; email: string; status: string };
type Assessment = { id: string; title: string; description: string | null; kind: "quiz" | "devoir" | "examen"; max_score: number; due_date: string | null; published: boolean; results_published: boolean };
type Result = { student_id: string; score: number | null; comment: string | null };
type Draft = { score: string; comment: string };

export default function TeacherAssessments({ courseId, students }: { courseId: string; students: RosterStudent[] }) {
  const t = useT({
    fr: { title:"Évaluations", intro:"Vous coordonnez l'évaluation de vos élèves ; l'administration suit l'ensemble. Les élèves ne voient une évaluation qu'une fois publiée, et leur note qu'une fois les résultats publiés.", loading:"Chargement…", empty:"Aucune évaluation pour l'instant.", published:"Publiée", draft:"Brouillon", resultsPublished:"Résultats publiés", resultsHidden:"Résultats masqués", unpublish:"Dépublier", publish:"Publier", hideResults:"Masquer les résultats", publishResults:"Publier les résultats", grades:"Saisir les notes", edit:"Modifier", remove:"Supprimer", create:"Créer une évaluation", newTitle:"Nouvelle évaluation", editTitle:"Modifier l'évaluation", fieldTitle:"Titre", kind:"Type", scale:"Barème (note maximale)", due:"Date limite (facultatif)", instructions:"Consignes (facultatif)", saving:"Enregistrement…", save:"Enregistrer", cancel:"Annuler", close:"Fermer", noActive:"Aucun élève actif à noter.", grade:"Note", comment:"Commentaire", required:"Le titre est obligatoire.", positive:"Le barème doit être un nombre positif.", saved:"Évaluation enregistrée.", deleted:"Évaluation supprimée.", confirmDelete:"Supprimer « {title} » et toutes ses notes ?", gradeRange:"La note de {name} doit être comprise entre 0 et {max}.", gradeSaved:"Note de {name} enregistrée.", over:"sur", duePrefix:"pour le", quiz:"Quiz", homework:"Devoir", exam:"Examen", gradeHeading:"Notes" },
    en: { title:"Assessments", intro:"You coordinate your students' assessments; the administration oversees the whole platform. Students can see an assessment only after it is published, and their grades only after results are published.", loading:"Loading…", empty:"No assessments yet.", published:"Published", draft:"Draft", resultsPublished:"Results published", resultsHidden:"Results hidden", unpublish:"Unpublish", publish:"Publish", hideResults:"Hide results", publishResults:"Publish results", grades:"Enter grades", edit:"Edit", remove:"Delete", create:"Create assessment", newTitle:"New assessment", editTitle:"Edit assessment", fieldTitle:"Title", kind:"Type", scale:"Grading scale (maximum score)", due:"Due date (optional)", instructions:"Instructions (optional)", saving:"Saving…", save:"Save", cancel:"Cancel", close:"Close", noActive:"No active students to grade.", grade:"Grade", comment:"Comment", required:"The title is required.", positive:"The grading scale must be a positive number.", saved:"Assessment saved.", deleted:"Assessment deleted.", confirmDelete:"Delete “{title}” and all its grades?", gradeRange:"The grade for {name} must be between 0 and {max}.", gradeSaved:"Grade for {name} saved.", over:"out of", duePrefix:"due", quiz:"Quiz", homework:"Assignment", exam:"Exam", gradeHeading:"Grades" },
    pt: { title:"Avaliações", intro:"Coordena a avaliação dos seus alunos; a administração acompanha o conjunto. Os alunos só podem ver uma avaliação depois de publicada e as notas depois da publicação dos resultados.", loading:"A carregar…", empty:"Ainda não existem avaliações.", published:"Publicada", draft:"Rascunho", resultsPublished:"Resultados publicados", resultsHidden:"Resultados ocultos", unpublish:"Retirar publicação", publish:"Publicar", hideResults:"Ocultar resultados", publishResults:"Publicar resultados", grades:"Registar notas", edit:"Editar", remove:"Eliminar", create:"Criar avaliação", newTitle:"Nova avaliação", editTitle:"Editar avaliação", fieldTitle:"Título", kind:"Tipo", scale:"Cotação (nota máxima)", due:"Data limite (opcional)", instructions:"Instruções (opcional)", saving:"A guardar…", save:"Guardar", cancel:"Cancelar", close:"Fechar", noActive:"Não há alunos ativos para avaliar.", grade:"Nota", comment:"Comentário", required:"O título é obrigatório.", positive:"A cotação deve ser um número positivo.", saved:"Avaliação guardada.", deleted:"Avaliação eliminada.", confirmDelete:"Eliminar «{title}» e todas as respetivas notas?", gradeRange:"A nota de {name} deve estar entre 0 e {max}.", gradeSaved:"Nota de {name} guardada.", over:"de", duePrefix:"para", quiz:"Questionário", homework:"Trabalho", exam:"Exame", gradeHeading:"Notas" },
    es: { title:"Evaluaciones", intro:"Coordinas la evaluación de tus alumnos; la administración supervisa el conjunto. Los alumnos solo pueden ver una evaluación cuando se publica y sus calificaciones cuando se publican los resultados.", loading:"Cargando…", empty:"Todavía no hay evaluaciones.", published:"Publicada", draft:"Borrador", resultsPublished:"Resultados publicados", resultsHidden:"Resultados ocultos", unpublish:"Retirar publicación", publish:"Publicar", hideResults:"Ocultar resultados", publishResults:"Publicar resultados", grades:"Introducir notas", edit:"Editar", remove:"Eliminar", create:"Crear evaluación", newTitle:"Nueva evaluación", editTitle:"Editar evaluación", fieldTitle:"Título", kind:"Tipo", scale:"Escala de calificación (nota máxima)", due:"Fecha límite (opcional)", instructions:"Instrucciones (opcional)", saving:"Guardando…", save:"Guardar", cancel:"Cancelar", close:"Cerrar", noActive:"No hay alumnos activos para calificar.", grade:"Nota", comment:"Comentario", required:"El título es obligatorio.", positive:"La escala debe ser un número positivo.", saved:"Evaluación guardada.", deleted:"Evaluación eliminada.", confirmDelete:"¿Eliminar «{title}» y todas sus notas?", gradeRange:"La nota de {name} debe estar entre 0 y {max}.", gradeSaved:"Nota de {name} guardada.", over:"de", duePrefix:"para" }
  });
  const kindLabel = { quiz: t.quiz, devoir: t.homework, examen: t.exam };
  const format = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

  const [items, setItems] = useState<Assessment[] | null>(null);
  const [editing, setEditing] = useState<Assessment | "new" | null>(null);
  const [grading, setGrading] = useState<Assessment | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data, error: failure } = await supabase.from("assessments")
      .select("id, title, description, kind, max_score, due_date, published, results_published").eq("course_id", courseId).order("created_at", { ascending: false });
    if (failure) { setError(failure.message); setItems((current) => current ?? []); return; }
    setItems((data ?? []) as Assessment[]);
  }, [courseId]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const max = Number(String(form.get("max_score") ?? "20").replace(",", "."));
    if (!title) { setError(t.required); return; }
    if (!Number.isFinite(max) || max <= 0) { setError(t.positive); return; }
    const payload = {
      title, description: String(form.get("description") ?? "").trim() || null, kind: String(form.get("kind") ?? "devoir"),
      max_score: max, due_date: String(form.get("due_date") ?? "") || null,
    };
    setBusy(true); setError(""); setNotice("");
    try {
      if (editing && editing !== "new") {
        const { error: failure } = await supabase.from("assessments").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id);
        if (failure) throw failure;
      } else {
        const { error: failure } = await supabase.from("assessments").insert({ ...payload, course_id: courseId });
        if (failure) throw failure;
      }
      setNotice(t.saved); setEditing(null); await load();
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  async function toggle(item: Assessment, field: "published" | "results_published") {
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await supabase.from("assessments").update({ [field]: !item[field], updated_at: new Date().toISOString() }).eq("id", item.id);
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    await load();
  }

  async function remove(item: Assessment) {
    if (!window.confirm(format(t.confirmDelete, { title: item.title }))) return;
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await supabase.from("assessments").delete().eq("id", item.id);
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    if (grading?.id === item.id) setGrading(null);
    setNotice(t.deleted); await load();
  }

  async function openGrading(item: Assessment) {
    setGrading(item); setError(""); setNotice("");
    const { data, error: failure } = await supabase.from("assessment_results").select("student_id, score, comment").eq("assessment_id", item.id);
    if (failure) { setError(failure.message); return; }
    const next: Record<string, Draft> = {};
    for (const row of (data ?? []) as Result[]) next[row.student_id] = { score: row.score === null ? "" : String(row.score), comment: row.comment ?? "" };
    setDrafts(next);
  }

  async function saveGrade(item: Assessment, student: RosterStudent) {
    const draft = drafts[student.id] ?? { score: "", comment: "" };
    const raw = draft.score.trim().replace(",", ".");
    const score = raw === "" ? null : Number(raw);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > item.max_score)) { setError(format(t.gradeRange, { name: student.name, max: String(item.max_score) })); return; }
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await supabase.rpc("save_assessment_result", { p_assessment_id: item.id, p_student_id: student.id, p_score: score, p_comment: draft.comment });
    setBusy(false);
    if (failure) setError(failure.message); else setNotice(format(t.gradeSaved, { name: student.name }));
  }

  const active = students.filter((student) => student.status === "active");

  return (
    <div>
      <h2>{t.title}</h2>
      <p className="muted small-text">{t.intro}</p>
      <Feedback error={error} notice={notice} />
      {items === null && <p className="muted" role="status">{t.loading}</p>}
      {items?.length === 0 && <p className="notice">{t.empty}</p>}
      <ul className="stack">
        {items?.map((item) => (
          <li key={item.id} className="panel">
            <div className="row between">
              <span><strong>{item.title}</strong> <span className="tag">{kindLabel[item.kind]}</span> {t.over} {item.max_score}{item.due_date && <> · {t.duePrefix} {dayLabel(item.due_date)}</>}</span>
              <span className="row">
                <span className={`pill ${item.published ? "ongoing" : "past"}`}>{item.published ? t.published : t.draft}</span>
                <span className={`pill ${item.results_published ? "ongoing" : "past"}`}>{item.results_published ? t.resultsPublished : t.resultsHidden}</span>
              </span>
            </div>
            {item.description && <p className="muted small-text">{item.description}</p>}
            <div className="row">
              <button className="btn small" type="button" disabled={busy} onClick={() => void toggle(item, "published")}>{item.published ? t.unpublish : t.publish}</button>
              <button className="btn small" type="button" disabled={busy} onClick={() => void toggle(item, "results_published")}>{item.results_published ? t.hideResults : t.publishResults}</button>
              <button className="btn small primary" type="button" disabled={busy} onClick={() => void openGrading(item)}>{t.grades}</button>
              <button className="btn small" type="button" onClick={() => { setEditing(item); setNotice(""); }}>{t.edit}</button>
              <button className="btn small danger" type="button" disabled={busy} onClick={() => void remove(item)}>{t.remove}</button>
            </div>
          </li>
        ))}
      </ul>

      {!editing && <button className="btn primary" type="button" onClick={() => { setEditing("new"); setNotice(""); }}>{t.create}</button>}
      {editing && (
        <form className="panel form" onSubmit={save} key={editing === "new" ? "new" : editing.id}>
          <h3>{editing === "new" ? t.newTitle : t.editTitle}</h3>
          <label>{t.fieldTitle}<input name="title" required maxLength={200} defaultValue={editing === "new" ? "" : editing.title} /></label>
          <label>{t.kind}
            <select name="kind" defaultValue={editing === "new" ? "devoir" : editing.kind}><option value="quiz">{t.quiz}</option><option value="devoir">{t.homework}</option><option value="examen">{t.exam}</option></select>
          </label>
          <label>{t.scale}<input name="max_score" inputMode="decimal" required defaultValue={editing === "new" ? "20" : String(editing.max_score)} /></label>
          <label>{t.due}<input name="due_date" type="date" defaultValue={editing === "new" ? "" : editing.due_date ?? ""} /></label>
          <label>{t.instructions}<textarea name="description" rows={4} defaultValue={editing === "new" ? "" : editing.description ?? ""} /></label>
          <div className="row"><button className="btn primary" type="submit" disabled={busy}>{busy ? t.saving : t.save}</button><button className="btn" type="button" onClick={() => setEditing(null)}>{t.cancel}</button></div>
        </form>
      )}

      {grading && (
        <div className="panel">
          <div className="row between"><h3>{t.gradeHeading} — {grading.title} ({t.over} {grading.max_score})</h3><button className="btn small" type="button" onClick={() => setGrading(null)}>{t.close}</button></div>
          {active.length === 0 && <p className="notice">{t.noActive}</p>}
          <ul className="stack tight">
            {active.map((student) => {
              const draft = drafts[student.id] ?? { score: "", comment: "" };
              const update = (patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [student.id]: { ...draft, ...patch } }));
              return (
                <li key={student.id} className="panel">
                  <strong>{student.name}</strong> <span className="muted small-text">{student.email}</span>
                  <div className="inline-form">
                    <label>{t.grade}<input inputMode="decimal" value={draft.score} onChange={(event) => update({ score: event.target.value })} placeholder={`/ ${grading.max_score}`} /></label>
                    <label>{t.comment}<input value={draft.comment} maxLength={1000} onChange={(event) => update({ comment: event.target.value })} /></label>
                    <button className="btn small primary" type="button" disabled={busy} onClick={() => void saveGrade(grading, student)}>{t.save}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
