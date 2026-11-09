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
            <svg className="holo-orb heart-orb" viewBox="0 0 420 420" role="presentation">
              <defs>
                <linearGradient id="heartBody" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff9bba" /><stop offset="48%" stopColor="#e34d78" /><stop offset="100%" stopColor="#8c2458" />
                </linearGradient>
                <linearGradient id="heartBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a7edff" /><stop offset="100%" stopColor="#168bd5" />
                </linearGradient>
                <linearGradient id="heartRed" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffd0d0" /><stop offset="100%" stopColor="#f04458" />
                </linearGradient>
                <filter id="heartGlow"><feGaussianBlur stdDeviation="7" /></filter>
              </defs>
              <circle cx="210" cy="210" r="150" fill="#39bde9" opacity=".09" filter="url(#heartGlow)" />
              <g className="heart-rings" fill="none" stroke="#8be7ff" strokeOpacity=".28">
                <ellipse cx="210" cy="214" rx="172" ry="66" /><ellipse cx="210" cy="214" rx="145" ry="52" />
              </g>
              <g className="heart-vessels" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M158 172 C130 125 133 84 164 70 C195 58 221 83 211 119" stroke="url(#heartBlue)" strokeWidth="18" />
                <path d="M258 170 C286 124 283 82 252 70 C224 59 204 82 211 119" stroke="url(#heartRed)" strokeWidth="18" />
                <path d="M151 198 C112 190 91 160 101 128" stroke="#42b9ef" strokeWidth="15" />
                <path d="M269 198 C309 190 330 160 319 128" stroke="#ff6378" strokeWidth="15" />
              </g>
              <path className="heart-body" d="M210 343 C190 323 102 257 105 190 C107 137 168 119 205 164 C242 119 303 137 315 190 C329 258 231 327 210 343Z" fill="url(#heartBody)" stroke="#ffc4d7" strokeWidth="3" />
              <path d="M210 164 C205 207 207 272 210 337" fill="none" stroke="#ffe1eb" strokeOpacity=".7" strokeWidth="3" />
              <path d="M143 191 C147 166 176 159 195 184 C204 199 199 228 181 247 C164 233 140 217 143 191Z" fill="#167fbd" opacity=".9" />
              <path d="M225 184 C245 159 276 166 282 191 C285 217 257 237 239 251 C219 228 214 199 225 184Z" fill="#c92f58" opacity=".92" />
              <path d="M150 245 C162 267 183 288 202 303 L205 224 C184 210 160 219 150 245Z" fill="#176ca9" opacity=".94" />
              <path d="M216 224 L215 303 C237 287 261 266 273 244 C261 219 237 210 216 224Z" fill="#a9234e" opacity=".96" />
              <g className="blood-flow blood-flow-blue" fill="none" stroke="#9ceaff" strokeWidth="5" strokeLinecap="round" strokeDasharray="9 13">
                <path d="M145 87 C124 118 139 151 163 178 C177 194 176 222 185 250 C192 273 203 293 210 311" />
                <path d="M108 134 C102 163 124 185 151 199" />
              </g>
              <g className="blood-flow blood-flow-red" fill="none" stroke="#fff0b8" strokeWidth="5" strokeLinecap="round" strokeDasharray="9 13">
                <path d="M275 87 C296 118 281 151 257 178 C243 194 244 222 235 250 C228 273 217 293 210 311" />
                <path d="M312 134 C318 163 296 185 269 199" />
              </g>
              <g className="heart-sparkles" fill="#d8f8ff">
                <circle cx="78" cy="235" r="3" /><circle cx="340" cy="235" r="3" />
                <circle cx="95" cy="90" r="2" /><circle cx="325" cy="90" r="2" />
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
