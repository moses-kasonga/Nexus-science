import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCourse, fetchLessons, formatRange, sessionState, sessionStateLabel, type Course, type Lesson, type Language } from "../lib/courses";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

export default function CoursePage({ language }: { language: Language }) {
  const { id = "" } = useParams();
  const { session, profile, loading: authLoading } = useAuth();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState("");
  const [reload, setReload] = useState(0);
  const [course, setCourse] = useState<Course | null | undefined>(undefined);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lessonsError, setLessonsError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setCourse(undefined); setError("");
    fetchCourse(id, language).then((value) => { if (active) setCourse(value); }).catch((cause: Error) => { if (active) { setError(cause.message); setCourse(null); } });
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
          setLessonsError(cause.message || "Une erreur inconnue est survenue.");
        }
      });
    return () => { active = false; };
  }, [id, userId, reload, language]);

  useEffect(() => {
    let active = true;
    setEnrolled(null);
    if (!userId) return;
    supabase.from("enrollments").select("status").eq("course_id", id).eq("student_id", userId).maybeSingle()
      .then(({ data }) => { if (active) setEnrolled(data?.status === "active"); });
    return () => { active = false; };
  }, [id, userId, reload]);

  async function enroll() {
    setEnrollBusy(true); setEnrollError("");
    const { error: failure } = await supabase.rpc("enroll_in_course", { p_course_id: id });
    setEnrollBusy(false);
    if (failure) setEnrollError(failure.message); else setReload((value) => value + 1);
  }

  if (course === undefined) return <section className="wrap page"><p className="muted" role="status">Chargement du cours…</p></section>;
  if (!course) return <section className="wrap page"><h1>Cours introuvable</h1>{error && <p className="notice error" role="alert">{error}</p>}<p><Link to="/">← Retour aux cours</Link></p></section>;

  return (
    <section className="wrap page narrow">
      <p><Link to="/">← Tous les cours</Link></p>
      <p className="tag">{course.category}</p>
      <h1>{course.name}</h1>
      {course.description && <p className="lead">{course.description}</p>}

      <h2>Sessions</h2>
      <ul className="sessions big">
        {course.course_schedules.length === 0 && <li className="muted">Aucune session publiée pour l'instant.</li>}
        {course.course_schedules.map((item) => { const state = sessionState(item); return <li key={item.start_date + item.end_date}><span className={`pill ${state}`}>{sessionStateLabel[language][state]}</span> {formatRange(item, language)}</li>; })}
      </ul>

      {session && profile?.role === "student" && enrolled === false && (
        <div className="notice">
          <p>Inscrivez-vous pour accéder aux leçons. Votre évaluation sera coordonnée par l'enseignant titulaire du cours et suivie par l'administration.</p>
          <button className="btn primary" type="button" onClick={() => void enroll()} disabled={enrollBusy}>{enrollBusy ? "Inscription…" : "M'inscrire à cette formation"}</button>
          {enrollError && <p className="notice error" role="alert">{enrollError}</p>}
        </div>
      )}
      {session && enrolled === true && <p className="notice" role="status">Vous êtes inscrit à cette formation.</p>}

      <h2>Leçons</h2>
      {!session && !authLoading && <p className="notice">Les leçons sont réservées aux élèves inscrits. <Link to="/connexion">Connectez-vous</Link> ou <Link to="/inscription">créez un compte</Link> pour continuer.</p>}
      {session && lessons === null && <p className="muted" role="status">Chargement des leçons…</p>}
      {session && lessonsError && <p className="notice error" role="alert">Impossible de charger les leçons. Détail : {lessonsError}</p>}
      {session && !lessonsError && lessons !== null && lessons.length === 0 && <p className="notice">Aucune leçon accessible pour ce cours pour le moment.</p>}
      {lessons && lessons.length > 0 && (
        <ol className="lessons">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <details>
                <summary>{lesson.title}</summary>
                <div className="lesson-body">{lesson.content ? lesson.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p className="muted">Cette leçon n'a pas encore de contenu.</p>}</div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
