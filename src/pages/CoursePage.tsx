import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCourse, fetchLessons, formatRange, sessionState, sessionStateLabel, type Course, type Lesson, type Language } from "../lib/courses";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

const pageCopy = {
  fr: { loading: "Chargement du cours…", missing: "Cours introuvable", back: "← Tous les cours", sessions: "Sessions", noSessions: "Aucune session publiée pour l'instant.", lessons: "Leçons", signup: "Inscrivez-vous pour accéder aux leçons. Votre évaluation sera coordonnée par l'enseignant titulaire du cours et suivie par l'administration.", enroll: "M'inscrire à cette formation", enrolling: "Inscription…", enrolled: "Vous êtes inscrit à cette formation.", reserved: "Les leçons sont réservées aux élèves inscrits.", login: "Connectez-vous", or: "ou", register: "créez un compte", continue: "pour continuer.", loadingLessons: "Chargement des leçons…", noLessons: "Aucune leçon accessible pour ce cours pour le moment.", noContent: "Cette leçon n'a pas encore de contenu.", loadError: "Impossible de charger les leçons. Détail :", unknownError: "Une erreur inconnue est survenue." },
  en: { loading: "Loading course…", missing: "Course not found", back: "← All courses", sessions: "Sessions", noSessions: "No sessions have been published yet.", lessons: "Lessons", signup: "Sign up to access the lessons. Your assessment will be coordinated by the course teacher and monitored by the administration.", enroll: "Enroll in this course", enrolling: "Enrolling…", enrolled: "You are enrolled in this course.", reserved: "Lessons are available to enrolled students only.", login: "Sign in", or: "or", register: "create an account", continue: "to continue.", loadingLessons: "Loading lessons…", noLessons: "No lessons are available for this course yet.", noContent: "This lesson does not have any content yet.", loadError: "Unable to load lessons. Details:", unknownError: "An unknown error occurred." },
  pt: { loading: "A carregar o curso…", missing: "Curso não encontrado", back: "← Todos os cursos", sessions: "Sessões", noSessions: "Ainda não foram publicadas sessões.", lessons: "Aulas", signup: "Inscreva-se para aceder às aulas. A sua avaliação será coordenada pelo professor responsável e acompanhada pela administração.", enroll: "Inscrever-me neste curso", enrolling: "A inscrever…", enrolled: "Está inscrito neste curso.", reserved: "As aulas estão disponíveis apenas para alunos inscritos.", login: "Inicie sessão", or: "ou", register: "crie uma conta", continue: "para continuar.", loadingLessons: "A carregar as aulas…", noLessons: "Ainda não há aulas disponíveis para este curso.", noContent: "Esta aula ainda não tem conteúdo.", loadError: "Não foi possível carregar as aulas. Detalhes:", unknownError: "Ocorreu um erro desconhecido." },
  es: { loading: "Cargando el curso…", missing: "Curso no encontrado", back: "← Todos los cursos", sessions: "Sesiones", noSessions: "Todavía no se han publicado sesiones.", lessons: "Lecciones", signup: "Inscríbete para acceder a las lecciones. Tu evaluación será coordinada por el docente responsable y supervisada por la administración.", enroll: "Inscribirme en este curso", enrolling: "Inscribiendo…", enrolled: "Estás inscrito en este curso.", reserved: "Las lecciones están disponibles solo para estudiantes inscritos.", login: "Inicia sesión", or: "o", register: "crea una cuenta", continue: "para continuar.", loadingLessons: "Cargando lecciones…", noLessons: "Todavía no hay lecciones disponibles para este curso.", noContent: "Esta lección todavía no tiene contenido.", loadError: "No se pudieron cargar las lecciones. Detalles:", unknownError: "Se produjo un error desconocido." },
};

export default function CoursePage({ language }: { language: Language }) {
  const { id = "" } = useParams();
  const { session, profile, loading: authLoading } = useAuth();
  const labels = pageCopy[language];
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState("");
  const [reload, setReload] = useState(0);
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lessonsError, setLessonsError] = useState("");

  useEffect(() => {
    let active = true;
    setCourse(undefined);
    fetchCourse(id, language)
      .then((value) => { if (active) setCourse(value); })
      .catch(() => { if (active) setCourse(null); });
    return () => { active = false; };
  }, [id, language]);

  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    setLessons(null);
    setLessonsError("");
    if (!userId) return;
    fetchLessons(id, language)
      .then((value) => { if (active) setLessons(value); })
      .catch((cause: Error) => {
        if (active) {
          setLessons([]);
          setLessonsError(cause.message || labels.unknownError);
        }
      });
    return () => { active = false; };
  }, [id, userId, reload, language, labels.unknownError]);

  useEffect(() => {
    let active = true;
    setEnrolled(null);
    if (!userId) return;
    supabase.from("enrollments").select("status").eq("course_id", id).eq("student_id", userId).maybeSingle()
      .then(({ data }) => { if (active) setEnrolled(data?.status === "active"); });
    return () => { active = false; };
  }, [id, userId, reload]);

  async function enroll() {
    setEnrollBusy(true);
    setEnrollError("");
    const { error: failure } = await supabase.rpc("enroll_in_course", { p_course_id: id });
    setEnrollBusy(false);
    if (failure) setEnrollError(failure.message);
    else setReload((value) => value + 1);
  }

  if (course === undefined) return <section className="wrap page"><p className="muted" role="status">{labels.loading}</p></section>;
  if (!course) return <section className="wrap page"><h1>{labels.missing}</h1><p><Link to="/">{labels.back}</Link></p></section>;

  return (
    <section className="wrap page narrow">
      <p><Link to="/">{labels.back}</Link></p>
      <p className="tag">{course.category}</p>
      <h1>{course.name}</h1>
      {course.description && <p className="lead">{course.description}</p>}

      <h2>{labels.sessions}</h2>
      <ul className="sessions big">
        {course.course_schedules.length === 0 && <li className="muted">{labels.noSessions}</li>}
        {course.course_schedules.map((item) => {
          const state = sessionState(item);
          return <li key={item.start_date + item.end_date}><span className={`pill ${state}`}>{sessionStateLabel[language][state]}</span> {formatRange(item, language)}</li>;
        })}
      </ul>

      {session && profile?.role === "student" && enrolled === false && (
        <div className="notice">
          <p>{labels.signup}</p>
          <button className="btn primary" type="button" onClick={() => void enroll()} disabled={enrollBusy}>{enrollBusy ? labels.enrolling : labels.enroll}</button>
          {enrollError && <p className="notice error" role="alert">{enrollError}</p>}
        </div>
      )}
      {session && enrolled === true && <p className="notice" role="status">{labels.enrolled}</p>}

      <h2>{labels.lessons}</h2>
      {!session && !authLoading && <p className="notice">{labels.reserved} <Link to="/connexion">{labels.login}</Link> {labels.or} <Link to="/inscription">{labels.register}</Link> {labels.continue}</p>}
      {session && lessons === null && <p className="muted" role="status">{labels.loadingLessons}</p>}
      {session && lessonsError && <p className="notice error" role="alert">{labels.loadError} {lessonsError}</p>}
      {session && !lessonsError && lessons !== null && lessons.length === 0 && <p className="notice">{labels.noLessons}</p>}
      {lessons && lessons.length > 0 && (
        <ol className="lessons">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <details>
                <summary>{lesson.title}</summary>
                <div className="lesson-body">{lesson.content ? lesson.content.split(/\\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p className="muted">{labels.noContent}</p>}</div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
