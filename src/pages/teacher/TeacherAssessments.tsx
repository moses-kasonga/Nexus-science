import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { Feedback, dayLabel, errorText } from "../admin/shared";

export type RosterStudent = { id: string; name: string; email: string; status: string };
type Assessment = { id: string; title: string; description: string | null; kind: "quiz" | "devoir" | "examen"; max_score: number; due_date: string | null; published: boolean; results_published: boolean };
type Result = { student_id: string; score: number | null; comment: string | null };
type Draft = { score: string; comment: string };

const kindLabel = { quiz: "Quiz", devoir: "Devoir", examen: "Examen" } as const;

export default function TeacherAssessments({ courseId, students }: { courseId: string; students: RosterStudent[] }) {
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
    if (!title) { setError("Le titre est obligatoire."); return; }
    if (!Number.isFinite(max) || max <= 0) { setError("Le barème doit être un nombre positif."); return; }
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
      setNotice("Évaluation enregistrée."); setEditing(null); await load();
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
    if (!window.confirm(`Supprimer « ${item.title} » et toutes ses notes ?`)) return;
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await supabase.from("assessments").delete().eq("id", item.id);
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    if (grading?.id === item.id) setGrading(null);
    setNotice("Évaluation supprimée."); await load();
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
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > item.max_score)) { setError(`La note de ${student.name} doit être comprise entre 0 et ${item.max_score}.`); return; }
    setBusy(true); setError(""); setNotice("");
    const { error: failure } = await supabase.rpc("save_assessment_result", { p_assessment_id: item.id, p_student_id: student.id, p_score: score, p_comment: draft.comment });
    setBusy(false);
    if (failure) setError(failure.message); else setNotice(`Note de ${student.name} enregistrée.`);
  }

  const active = students.filter((student) => student.status === "active");

  return (
    <div>
      <h2>Évaluations</h2>
      <p className="muted small-text">Vous coordonnez l'évaluation de vos élèves ; l'administration suit l'ensemble. Les élèves ne voient une évaluation qu'une fois publiée, et leur note qu'une fois les résultats publiés.</p>
      <Feedback error={error} notice={notice} />
      {items === null && <p className="muted" role="status">Chargement…</p>}
      {items?.length === 0 && <p className="notice">Aucune évaluation pour l'instant.</p>}
      <ul className="stack">
        {items?.map((item) => (
          <li key={item.id} className="panel">
            <div className="row between">
              <span><strong>{item.title}</strong> <span className="tag">{kindLabel[item.kind]}</span> sur {item.max_score}{item.due_date && <> · pour le {dayLabel(item.due_date)}</>}</span>
              <span className="row">
                <span className={`pill ${item.published ? "ongoing" : "past"}`}>{item.published ? "Publiée" : "Brouillon"}</span>
                <span className={`pill ${item.results_published ? "ongoing" : "past"}`}>{item.results_published ? "Résultats publiés" : "Résultats masqués"}</span>
              </span>
            </div>
            {item.description && <p className="muted small-text">{item.description}</p>}
            <div className="row">
              <button className="btn small" type="button" disabled={busy} onClick={() => void toggle(item, "published")}>{item.published ? "Dépublier" : "Publier"}</button>
              <button className="btn small" type="button" disabled={busy} onClick={() => void toggle(item, "results_published")}>{item.results_published ? "Masquer les résultats" : "Publier les résultats"}</button>
              <button className="btn small primary" type="button" disabled={busy} onClick={() => void openGrading(item)}>Saisir les notes</button>
              <button className="btn small" type="button" onClick={() => { setEditing(item); setNotice(""); }}>Modifier</button>
              <button className="btn small danger" type="button" disabled={busy} onClick={() => void remove(item)}>Supprimer</button>
            </div>
          </li>
        ))}
      </ul>

      {!editing && <button className="btn primary" type="button" onClick={() => { setEditing("new"); setNotice(""); }}>Créer une évaluation</button>}
      {editing && (
        <form className="panel form" onSubmit={save} key={editing === "new" ? "new" : editing.id}>
          <h3>{editing === "new" ? "Nouvelle évaluation" : "Modifier l'évaluation"}</h3>
          <label>Titre<input name="title" required maxLength={200} defaultValue={editing === "new" ? "" : editing.title} /></label>
          <label>Type
            <select name="kind" defaultValue={editing === "new" ? "devoir" : editing.kind}><option value="quiz">Quiz</option><option value="devoir">Devoir</option><option value="examen">Examen</option></select>
          </label>
          <label>Barème (note maximale)<input name="max_score" inputMode="decimal" required defaultValue={editing === "new" ? "20" : String(editing.max_score)} /></label>
          <label>Date limite (facultatif)<input name="due_date" type="date" defaultValue={editing === "new" ? "" : editing.due_date ?? ""} /></label>
          <label>Consignes (facultatif)<textarea name="description" rows={4} defaultValue={editing === "new" ? "" : editing.description ?? ""} /></label>
          <div className="row"><button className="btn primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button><button className="btn" type="button" onClick={() => setEditing(null)}>Annuler</button></div>
        </form>
      )}

      {grading && (
        <div className="panel">
          <div className="row between"><h3>Notes — {grading.title} (sur {grading.max_score})</h3><button className="btn small" type="button" onClick={() => setGrading(null)}>Fermer</button></div>
          {active.length === 0 && <p className="notice">Aucun élève actif à noter.</p>}
          <ul className="stack tight">
            {active.map((student) => {
              const draft = drafts[student.id] ?? { score: "", comment: "" };
              const update = (patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [student.id]: { ...draft, ...patch } }));
              return (
                <li key={student.id} className="panel">
                  <strong>{student.name}</strong> <span className="muted small-text">{student.email}</span>
                  <div className="inline-form">
                    <label>Note<input inputMode="decimal" value={draft.score} onChange={(event) => update({ score: event.target.value })} placeholder={`/ ${grading.max_score}`} /></label>
                    <label>Commentaire<input value={draft.comment} maxLength={1000} onChange={(event) => update({ comment: event.target.value })} /></label>
                    <button className="btn small primary" type="button" disabled={busy} onClick={() => void saveGrade(grading, student)}>Enregistrer</button>
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
