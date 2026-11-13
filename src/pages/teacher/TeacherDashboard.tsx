import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { displayName, useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { Feedback, dayLabel, errorText } from "../admin/shared";
import { dateLocale, useLanguage } from "../../lib/i18n";

type Schedule = { start_date: string; end_date: string; status: string };
type MyCourse = { id: string; name: string; category: string; published: boolean; course_schedules: Schedule[] };

export default function TeacherDashboard() {
  const language = useLanguage();
  const labels = {
    fr: ["Espace enseignant","Cet espace est réservé aux enseignants approuvés par l’administration.","Retour à l’accueil","Bonjour","Vos formations : gérez les leçons et les évaluations, et suivez les élèves inscrits.","Chargement de vos formations…","Aucune formation ne vous est encore attribuée. L’administration peut vous en affecter dans Administration, puis Formations.","Aucune session","Non publiée","Ouvrir","Chargement…"],
    en: ["Teacher space","This space is reserved for teachers approved by the administration.","Back to home","Hello","Your courses: manage lessons and assessments, and follow your enrolled students.","Loading your courses…","No course has been assigned to you yet. The administration can assign one under Administration, then Courses.","No session","Unpublished","Open","Loading…"],
    pt: ["Espaço do professor","Este espaço é reservado aos professores aprovados pela administração.","Voltar ao início","Olá","Os seus cursos: gira as aulas e avaliações e acompanhe os alunos inscritos.","A carregar os seus cursos…","Ainda não lhe foi atribuído nenhum curso. A administração pode atribuí-lo em Administração e depois Cursos.","Nenhuma sessão","Não publicado","Abrir","A carregar…"],
    es: ["Espacio del profesor","Este espacio está reservado a los profesores aprobados por la administración.","Volver al inicio","Hola","Tus cursos: gestiona las lecciones y evaluaciones y sigue a los alumnos inscritos.","Cargando tus cursos…","Aún no tienes ningún curso asignado. La administración puede asignártelo en Administración y después Cursos.","Ninguna sesión","No publicado","Abrir"]
  }[language];
  const { session, profile, loading } = useAuth();
  const [courses, setCourses] = useState<MyCourse[] | null>(null);
  const [error, setError] = useState("");
  const userId = session?.user.id;
  const isTeacher = profile?.role === "teacher";

  useEffect(() => {
    if (!userId || !isTeacher) return;
    let active = true;
    (async () => {
      const { data: links, error: linkError } = await supabase.from("course_teachers").select("course_id").eq("teacher_id", userId);
      if (linkError) throw linkError;
      const ids = (links ?? []).map((row) => row.course_id as string);
      if (ids.length === 0) return [] as MyCourse[];
      const { data, error: courseError } = await supabase.from("courses")
        .select("id, name, category, published, course_schedules(start_date, end_date, status)").in("id", ids).order("name");
      if (courseError) throw courseError;
      return (data ?? []) as MyCourse[];
    })().then((value) => { if (active) setCourses(value); })
      .catch((cause) => { if (active) { setError(errorText(cause)); setCourses([]); } });
    return () => { active = false; };
  }, [userId, isTeacher]);

  if (loading) return <section className="wrap page"><p className="muted" role="status">{labels[10]}</p></section>;
  if (!session) return <Navigate to="/connexion?retour=%2Fenseignant" replace />;
  if (!isTeacher) return <section className="wrap page narrow"><h1>{labels[0]}</h1><p className="notice">{labels[1]}</p><p><Link to="/">{labels[2]}</Link></p></section>;

  return (
    <section className="wrap page">
      <p className="eyebrow">{labels[0]}</p>
      <h1>{labels[3]} {displayName(profile, session.user.email)}</h1>
      <p className="muted">{labels[4]}</p>\n      <div className="panel" style={{ margin: "1.25rem 0", padding: "1rem" }}>
        <strong>MOÏSE — {language === "fr" ? "Assistant pédagogique" : language === "pt" ? "Assistente pedagógico" : language === "es" ? "Asistente pedagógico" : "Teaching assistant"}</strong>
        <p className="muted">{language === "fr" ? "Préparez vos leçons, exercices et évaluations avec votre assistant." : language === "pt" ? "Prepare aulas, exercícios e avaliações com o seu assistente." : language === "es" ? "Prepara lecciones, ejercicios y evaluaciones con tu asistente." : "Prepare lessons, exercises and assessments with your assistant."}</p>
        <Link className="btn primary small" to="/moise">{language === "fr" ? "Ouvrir MOÏSE →" : language === "pt" ? "Abrir MOÏSE →" : language === "es" ? "Abrir MOÏSE →" : "Open MOÏSE →"}</Link>
      </div>
      <Feedback error={error} />
      {courses === null && <p className="muted" role="status">{labels[5]}</p>}
      {courses?.length === 0 && !error && <p className="notice">{labels[6]}</p>}
      <ul className="stack">
        {courses?.map((course) => (
          <li key={course.id} className="panel row between">
            <span>
              <strong>{course.name}</strong> <span className="tag">{course.category}</span> {!course.published && <span className="pill past">{labels[8]}</span>}<br />
              <span className="muted small-text">{course.course_schedules.length === 0 ? labels[7] : course.course_schedules.slice().sort((a, b) => a.start_date.localeCompare(b.start_date)).map((item) => `${dayLabel(item.start_date)} → ${dayLabel(item.end_date)}`).join(" · ")}</span>
            </span>
            <Link className="btn primary small" to={`/enseignant/cours/${course.id}`}>{labels[9]}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
