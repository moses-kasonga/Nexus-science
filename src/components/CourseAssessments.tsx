import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Language } from "../lib/courses";

type Item = { id: string; title: string; description: string | null; kind: string; max_score: number; due_date: string | null; results_published: boolean };
type Result = { assessment_id: string; score: number | null; comment: string | null };

const text: Record<Language, { title: string; none: string; due: string; pending: string; grade: string; comment: string; of: string; kinds: Record<string, string> }> = {
  fr: { title: "Évaluations", none: "Aucune évaluation publiée pour l'instant.", due: "À rendre pour le", pending: "Résultat à venir", grade: "Note", comment: "Commentaire de l'enseignant", of: "sur", kinds: { quiz: "Quiz", devoir: "Devoir", examen: "Examen" } },
  en: { title: "Assessments", none: "No assessments have been published yet.", due: "Due on", pending: "Result to come", grade: "Grade", comment: "Teacher's comment", of: "out of", kinds: { quiz: "Quiz", devoir: "Assignment", examen: "Exam" } },
  pt: { title: "Avaliações", none: "Ainda não há avaliações publicadas.", due: "Entrega até", pending: "Resultado em breve", grade: "Nota", comment: "Comentário do professor", of: "em", kinds: { quiz: "Quiz", devoir: "Trabalho", examen: "Exame" } },
  es: { title: "Evaluaciones", none: "Todavía no hay evaluaciones publicadas.", due: "Fecha límite", pending: "Resultado pendiente", grade: "Nota", comment: "Comentario del profesor", of: "sobre", kinds: { quiz: "Quiz", devoir: "Tarea", examen: "Examen" } },
};
const locale: Record<Language, string> = { fr: "fr-FR", en: "en-GB", pt: "pt-PT", es: "es-ES" };

export default function CourseAssessments({ courseId, language }: { courseId: string; language: Language }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const t = text[language];

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await supabase.from("assessments").select("id, title, description, kind, max_score, due_date, results_published").eq("course_id", courseId).order("created_at");
      if (list.error) throw list.error;
      const own = await supabase.from("assessment_results").select("assessment_id, score, comment");
      return { list: (list.data ?? []) as Item[], own: (own.data ?? []) as Result[] };
    })().then(({ list, own }) => { if (active) { setItems(list); setResults(new Map(own.map((row) => [row.assessment_id, row]))); } })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [courseId]);

  if (items === null) return null;
  return (
    <>
      <h2>{t.title}</h2>
      {items.length === 0 && <p className="notice">{t.none}</p>}
      <ul className="stack tight">
        {items.map((item) => {
          const result = results.get(item.id);
          return (
            <li key={item.id} className="panel">
              <strong>{item.title}</strong> <span className="tag">{t.kinds[item.kind] ?? item.kind}</span>
              {item.due_date && <p className="muted small-text">{t.due} {new Intl.DateTimeFormat(locale[language], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(item.due_date + "T00:00:00Z"))}</p>}
              {item.description && <p>{item.description}</p>}
              {item.results_published && result && result.score !== null
                ? <p><strong>{t.grade} : {result.score} {t.of} {item.max_score}</strong>{result.comment && <><br /><span className="muted small-text">{t.comment} : {result.comment}</span></>}</p>
                : <p className="muted small-text">{t.pending}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
