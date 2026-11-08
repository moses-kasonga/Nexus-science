import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPublishedCourses, formatRange, sessionState, sessionStateLabel, type Course } from "../lib/courses";
import { useAuth } from "../lib/auth";

export default function Home() {
  const { session } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchPublishedCourses().then((list) => { if (active) setCourses(list); }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">Plateforme d'apprentissage en ligne</p>
            <h1>Les sciences, expliquées <em>pas à pas</em>.</h1>
            <p className="lead">Des cours par sessions datées, préparés par des enseignants, et un assistant, MOÏSE, pour comprendre et réviser à votre rythme.</p>
            <div className="actions">
              <a className="btn primary" href="#cours">Voir les cours</a>
              {!session && <Link className="btn" to="/inscription">Créer un compte</Link>}
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <svg viewBox="0 0 240 240" width="100%" height="100%"><g fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="120" cy="120" rx="100" ry="38" /><ellipse cx="120" cy="120" rx="100" ry="38" transform="rotate(60 120 120)" /><ellipse cx="120" cy="120" rx="100" ry="38" transform="rotate(120 120 120)" /></g><circle cx="120" cy="120" r="12" fill="currentColor" /><circle cx="220" cy="120" r="5" fill="currentColor" /><circle cx="70" cy="33" r="5" fill="currentColor" /><circle cx="70" cy="207" r="5" fill="currentColor" /></svg>
          </div>
        </div>
      </section>

      <section id="cours" className="wrap page" aria-labelledby="titre-cours">
        <h2 id="titre-cours">Cours disponibles</h2>
        {error && <p className="notice error" role="alert">{error}</p>}
        {!error && courses === null && <p className="muted" role="status">Chargement des cours…</p>}
        {courses && courses.length === 0 && <p className="notice">Aucun cours n'est publié pour le moment. Revenez bientôt.</p>}
        <ul className="cards">
          {courses?.map((course) => (
            <li key={course.id} className="card">
              <p className="tag">{course.category}</p>
              <h3><Link to={`/cours/${course.id}`}>{course.name}</Link></h3>
              {course.description && <p className="clamp">{course.description}</p>}
              <ul className="sessions" aria-label="Sessions">
                {course.course_schedules.length === 0 && <li className="muted">Aucune session publiée</li>}
                {course.course_schedules.map((item) => {
                  const state = sessionState(item);
                  return <li key={item.start_date + item.end_date}><span className={`pill ${state}`}>{sessionStateLabel[state]}</span> {formatRange(item)}</li>;
                })}
              </ul>
              <Link className="more" to={`/cours/${course.id}`}>Voir le cours →</Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
