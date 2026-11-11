import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Feedback, dayLabel, errorText } from "./shared";
import { dateLocale, useLanguage, useT } from "../../lib/i18n";

type Row = { id: string; title: string; kind: string; max_score: number; due_date: string | null; published: boolean; results_published: boolean; course_id: string; courses: { name: string } | null };
type Summary = Row & { graded: number; enrolled: number; average: number | null };

export default function AdminAssessments() {
  const locale = dateLocale[useLanguage()];
  const t = useT({
    fr:{title:"Suivi des évaluations",intro:"Vue d’ensemble des évaluations créées par les enseignants titulaires : avancement de la notation et moyennes.",loading:"Chargement…",empty:"Aucune évaluation n’a encore été créée.",course:"Formation",due:"pour le",published:"Publiée",draft:"Brouillon",results:"Résultats publiés",hidden:"Résultats masqués",grading:"Notation",students:"élèves",average:"Moyenne",quiz:"Quiz",homework:"Devoir",exam:"Examen"},
    en:{title:"Assessment overview",intro:"Overview of assessments created by course teachers, including grading progress and averages.",loading:"Loading…",empty:"No assessments have been created yet.",course:"Course",due:"due",published:"Published",draft:"Draft",results:"Results published",hidden:"Results hidden",grading:"Grading",students:"students",average:"Average",quiz:"Quiz",homework:"Assignment",exam:"Exam"},
    pt:{title:"Acompanhamento das avaliações",intro:"Visão geral das avaliações criadas pelos professores responsáveis: progresso da classificação e médias.",loading:"A carregar…",empty:"Ainda não foi criada nenhuma avaliação.",course:"Curso",due:"para",published:"Publicada",draft:"Rascunho",results:"Resultados publicados",hidden:"Resultados ocultos",grading:"Classificação",students:"alunos",average:"Média",quiz:"Questionário",homework:"Trabalho",exam:"Exame"},
    es:{title:"Seguimiento de evaluaciones",intro:"Resumen de las evaluaciones creadas por los profesores responsables: progreso de la calificación y promedios.",loading:"Cargando…",empty:"Todavía no se ha creado ninguna evaluación.",course:"Curso",due:"para el",published:"Publicada",draft:"Borrador",results:"Resultados publicados",hidden:"Resultados ocultos",grading:"Calificación",students:"alumnos",average:"Promedio",quiz:"Cuestionario",homework:"Tarea",exam:"Examen"}
  });
  const kindLabel: Record<string, string> = { quiz:t.quiz, devoir:t.homework, examen:t.exam };
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
      <h2>{t.title}</h2>
      <p className="muted">{t.intro}</p>
      <Feedback error={error} />
      {rows === null && <p className="muted" role="status">{t.loading}</p>}
      {rows?.length === 0 && !error && <p className="notice">{t.empty}</p>}
      <ul className="stack">
        {rows?.map((row) => (
          <li key={row.id} className="panel">
            <div className="row between">
              <span><strong>{row.title}</strong> <span className="tag">{kindLabel[row.kind] ?? row.kind}</span><br /><span className="muted small-text">{row.courses?.name ?? t.course}{row.due_date && <> · {t.due} {dayLabel(row.due_date, locale)}</>}</span></span>
              <span className="row">
                <span className={`pill ${row.published ? "ongoing" : "past"}`}>{row.published ? t.published : t.draft}</span>
                <span className={`pill ${row.results_published ? "ongoing" : "past"}`}>{row.results_published ? t.results : t.hidden}</span>
              </span>
            </div>
            <p className="small-text">{t.grading} : {row.graded} / {row.enrolled} {t.students} · {t.average} : {row.average === null ? "—" : `${row.average.toFixed(2)} / ${row.max_score}`}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
