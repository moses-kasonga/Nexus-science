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
          <div className="hero-art holo-stage" aria-hidden="true">
            <div className="holo-glow" />
            <svg className="holo-orb" viewBox="0 0 420 420" role="presentation">
              <defs>
                <radialGradient id="holoCore" cx="45%" cy="38%" r="62%">
                  <stop offset="0%" stopColor="#f2ffff" />
                  <stop offset="24%" stopColor="#8cecff" />
                  <stop offset="66%" stopColor="#248ed0" />
                  <stop offset="100%" stopColor="#123d78" />
                </radialGradient>
                <linearGradient id="holoRing" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e2ffff" stopOpacity=".95" />
                  <stop offset="48%" stopColor="#4bc8f5" stopOpacity=".72" />
                  <stop offset="100%" stopColor="#527bff" stopOpacity=".18" />
                </linearGradient>
                <filter id="holoBlur"><feGaussianBlur stdDeviation="5" /></filter>
              </defs>
              <circle cx="210" cy="210" r="116" fill="#28b9ed" opacity=".1" filter="url(#holoBlur)" />
              <g className="holo-orbits" fill="none" stroke="url(#holoRing)" strokeWidth="1.7">
                <ellipse cx="210" cy="210" rx="160" ry="58" />
                <ellipse cx="210" cy="210" rx="160" ry="58" transform="rotate(60 210 210)" />
                <ellipse cx="210" cy="210" rx="160" ry="58" transform="rotate(120 210 210)" />
              </g>
              <g className="holo-orbits holo-orbits-inner" fill="none" stroke="#9cecff" strokeOpacity=".5" strokeWidth="1">
                <ellipse cx="210" cy="210" rx="128" ry="42" transform="rotate(28 210 210)" />
                <ellipse cx="210" cy="210" rx="128" ry="42" transform="rotate(148 210 210)" />
              </g>
              <circle cx="210" cy="210" r="48" fill="#48cafa" opacity=".22" filter="url(#holoBlur)" />
              <circle cx="210" cy="210" r="31" fill="url(#holoCore)" />
              <circle cx="199" cy="197" r="9" fill="#fff" opacity=".72" />
              <g className="holo-electrons">
                <circle cx="370" cy="210" r="7" fill="#e8ffff" />
                <circle cx="130" cy="71" r="5.5" fill="#8eeaff" />
                <circle cx="130" cy="349" r="6" fill="#70d9ff" />
                <circle cx="275" cy="75" r="4" fill="#fff" />
              </g>
              <g fill="#b9f3ff">
                <circle className="holo-particle particle-one" cx="76" cy="142" r="3" />
                <circle className="holo-particle particle-two" cx="334" cy="315" r="3.5" />
                <circle className="holo-particle particle-three" cx="303" cy="112" r="2.5" />
                <circle className="holo-particle particle-four" cx="102" cy="292" r="2" />
              </g>
            </svg>
            <span className="holo-label holo-label-top">NEXUS / SCIENCE</span>
            <span className="holo-label holo-label-bottom">EXPLORE · DISCOVER · LEARN</span>
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
