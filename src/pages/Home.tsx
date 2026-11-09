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
          <div className="hero-art anatomical-heart-stage">
            <img
              className="anatomical-heart"
              src="/images/c5de127827c76e8_file_00000000bcb0820ebaf339d6baecaa8a_speed_0.25.gif"
              alt="Visualisation anatomique 3D d’un cœur humain avec circulation sanguine rouge et bleue"
              loading="eager"
            />
            <span className="holo-label holo-label-top" aria-hidden="true">NEXUS / SCIENCE</span>
            <span className="holo-label holo-label-bottom" aria-hidden="true">EXPLORE · DISCOVER · LEARN</span>
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
