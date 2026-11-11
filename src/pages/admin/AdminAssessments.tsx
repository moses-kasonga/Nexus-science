import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Feedback, dayLabel, errorText } from "./shared";

type Row = { id: string; title: string; kind: string; max_score: number; due_date: string | null; published: boolean; results_published: boolean; course_id: string; courses: { name: string } | null };
type Summary = Row & { graded: number; enrolled: number; average: number | null };

export default function AdminAssessments() {
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const [assessments, results, enrollments] = await Promise.all([
        supabase.from("assessments").select("id, title, kind, max_score, due_date, published, results_published, course_id, courses(name)").order("created_at", { ascending: false }),
        supabase.from("assessment_results").select("assessment_id, score"),
        supabase.from("enrollments").select("course_id").eq("status", "active"),
      ]);
      if (assessments.error) throw assessments.error;
      if (results.error) throw results.error;
      if (enrollments.error) throw enrollments.error;
      const enrolled = new Map<string, number>();
      for (const row of enrollments.data ?? []) enrolled.set(row.course_id as string, (enrolled.get(row.course_id as string) ?? 0) + 1);
      const scores = new Map<string, number[]>();
      for (const row of results.data ?? []) if (row.score !== null) scores.set(row.assessment_id as string, [...(scores.get(row.assessment_id as string) ?? []), Number(row.score)]);
      return ((assessments.data ?? []) as unknown as Row[]).map((row) => {
        const list = scores.get(row.id) ?? [];
        return { ...row, graded: list.length, enrolled: enrolled.get(row.course_id) ?? 0, average: list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null };
      });
    })().then((value) => { if (active) setRows(value); }).catch((cause) => { if (active) { setError(errorText(cause)); setRows([]); } });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <h2>Suivi des évaluations</h2>
      <p className="muted">Vue d'ensemble des évaluations créées par les enseignants titulaires : avancement de la notation et moyennes.</p>
      <Feedback error={error} />
      {rows === null && <p className="muted" role="status">Chargement…</p>}
      {rows?.length === 0 && !error && <p className="notice">Aucune évaluation n'a encore été créée.</p>}
      <ul className="stack">
        {rows?.map((row) => (
          <li key={row.id} className="panel">
            <div className="row between">
              <span><strong>{row.title}</strong> <span className="tag">{row.kind}</span><br /><span className="muted small-text">{row.courses?.name ?? "Formation"}{row.due_date && <> · pour le {dayLabel(row.due_date)}</>}</span></span>
              <span className="row">
                <span className={`pill ${row.published ? "ongoing" : "past"}`}>{row.published ? "Publiée" : "Brouillon"}</span>
                <span className={`pill ${row.results_published ? "ongoing" : "past"}`}>{row.results_published ? "Résultats publiés" : "Résultats masqués"}</span>
              </span>
            </div>
            <p className="small-text">Notation : {row.graded} / {row.enrolled} élèves · Moyenne : {row.average === null ? "—" : `${row.average.toFixed(2)} / ${row.max_score}`}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
