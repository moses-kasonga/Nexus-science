import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { displayName, useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { dateLocale, useLanguage, useSetLanguage, useT } from "../lib/i18n";
import { pagesText } from "../lib/translations";
import StudentFeedback from "../components/StudentFeedback";

type StudentCourse = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  course_schedules: { start_date: string; end_date: string; status: string }[];
};
type Enrollment = {
  id: string;
  status: "active" | "revoked";
  created_at: string;
  courses: StudentCourse | null;
};

const dateLabel = (value: string, locale: string) => new Intl.DateTimeFormat(locale, {
  day: "numeric", month: "long", year: "numeric",
}).format(new Date(value + "T12:00:00"));

export default function StudentDashboard() {
  const { session, profile, loading } = useAuth();
  const t = useT(pagesText);
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const locale = dateLocale[language];
  const languageLabel = { fr:"Langue", en:"Language", pt:"Idioma", es:"Idioma" }[language];
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const studentId = session?.user.id;
  useEffect(() => {
    let active = true;
    if (!studentId) { setBusy(false); return; }
    setBusy(true);
    setError("");
    supabase.from("enrollments")
      .select("id, status, created_at, courses(id, name, category, description, course_schedules(start_date, end_date, status))")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .then(({ data, error: failure }) => {
        if (!active) return;
        if (failure) setError(t.loadError + " " + failure.message);
        else setEnrollments((data ?? []) as unknown as Enrollment[]);
        setBusy(false);
      });
    return () => { active = false; };
  }, [studentId]);

  const activeCourses = useMemo(
    () => enrollments.filter((item) => item.status === "active" && item.courses).map((item) => item.courses as StudentCourse),
    [enrollments],
  );
  const nextSession = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return activeCourses.flatMap((course) => (course.course_schedules ?? [])
      .filter((item) => item.status === "published" && item.end_date >= today)
      .map((item) => ({ ...item, courseName: course.name, courseId: course.id })))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
  }, [activeCourses]);

  if (loading) return <section className="student-loading">{t.prepare}</section>;
  if (!session) return <Navigate to="/connexion?retour=%2Fespace-etudiant" replace />;
  if (profile?.role !== "student") return <Navigate to={profile?.role === "admin" ? "/admin" : "/compte"} replace />;

  const name = displayName(profile, session.user.email).split(" ")[0];

  return (
    <div className="student-shell">
      <aside className="student-sidebar">
        <Link to="/" className="student-brand"><span>🧬</span><strong>NEXUS <em>SCIENCE</em></strong></Link>
        <p className="student-nav-caption">{t.myLearning}</p>
        <nav aria-label={t.navLabel}>
          <a className="student-nav-link active" href="#accueil">▦ <span>{t.dashboard}</span></a>
          <a className="student-nav-link" href="#mes-cours">▤ <span>{t.myCourses}</span></a>
          <span className="student-nav-link disabled" aria-disabled="true">✎ <span>{t.exercises}</span><small>{t.soon}</small></span>
          <span className="student-nav-link disabled" aria-disabled="true">▦ <span>{t.calendar}</span><small>{t.soon}</small></span>
          <a className="student-nav-link" href="#student-feedback-title">✉ <span>Feedback</span></a>
        </nav>
        <div className="student-sidebar-bottom">
          <Link to="/compte">{t.myProfile}</Link>
          <Link to="/">{t.publicSite}</Link>
        </div>
      </aside>

      <main className="student-main" id="accueil">
        <header className="student-topbar">
          <div><span className="student-kicker">{t.studentSpace}</span><h1>{t.myLearningTitle}</h1></div>
          <div className="row">
            <label className="language-picker" aria-label={languageLabel}>
              <span aria-hidden="true">{language.toUpperCase()}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as "fr" | "en" | "pt" | "es")}>
                <option value="fr">FR</option><option value="en">EN</option><option value="pt">PT</option><option value="es">ES</option>
              </select>
            </label>
            <Link to="/compte" className="student-avatar" aria-label={t.openProfile}>{name.slice(0, 1).toUpperCase()}</Link>
          </div>
        </header>

        <section className="student-welcome">
          <div><p className="student-kicker">{t.welcomeKicker}</p><h2>{t.hello} {name} 👋</h2><p>{t.welcomeText}</p></div>
          <span className="student-welcome-mark" aria-hidden="true">🧬</span>
        </section>

        <section className="student-section student-next">
          <div><p className="student-kicker">MOÏSE</p><h2>{language === "fr" ? "Votre assistant pédagogique" : language === "pt" ? "O seu assistente pedagógico" : language === "es" ? "Tu asistente pedagógico" : "Your learning assistant"}</h2><p className="student-muted">{language === "fr" ? "Posez vos questions sur les cours, révisez et travaillez vos exercices avec MOÏSE." : language === "pt" ? "Faça perguntas sobre as aulas, reveja e pratique exercícios com MOÏSE." : language === "es" ? "Pregunta sobre las lecciones, repasa y practica ejercicios con MOÏSE." : "Ask questions about lessons, revise and practise exercises with MOÏSE."}</p><Link className="student-button" to="/moise">{language === "fr" ? "Ouvrir MOÏSE →" : language === "pt" ? "Abrir MOÏSE →" : language === "es" ? "Abrir MOÏSE →" : "Open MOÏSE →"}</Link></div>
        </section>

        <section className="student-stats" aria-label={t.summary}>
          <article className="student-stat"><span>{t.accessibleCourses}</span><strong>{busy ? "—" : activeCourses.length}</strong><small>{t.activeAccess}</small></article>
          <article className="student-stat"><span>{t.upcoming}</span><strong>{busy ? "—" : nextSession ? "1" : "0"}</strong><small>{nextSession ? dateLabel(nextSession.start_date, locale) : t.noSession}</small></article>
          <article className="student-stat"><span>{t.yourStatus}</span><strong>{t.student}</strong><small>{t.activeAccount}</small></article>
        </section>

        <section className="student-section" id="mes-cours">
          <div className="student-section-heading"><div><p className="student-kicker">{t.yourPath}</p><h2>{t.myCourses}</h2></div><span>{busy ? t.loadingShort : activeCourses.length + " " + t.formationsCount}</span></div>
          {error && <p className="student-alert" role="alert">{error}</p>}
          {busy && <p className="student-empty" role="status">{t.loadingCourses}</p>}
          {!busy && !error && activeCourses.length === 0 && (
            <div className="student-empty"><strong>{t.ready}</strong><p>{t.noCourseYet}</p><Link className="student-button" to="/">{t.discover}</Link></div>
          )}
          {!busy && activeCourses.length > 0 && (
            <div className="student-course-grid">
              {activeCourses.map((course) => (
                <article className="student-course-card" key={course.id}>
                  <span className="student-course-category">{course.category}</span>
                  <h3>{course.name}</h3>
                  <p>{course.description || t.defaultDescription}</p>
                  <Link to={`/cours/${course.id}`}>{t.openCourse} <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="student-section student-next">
          <div><p className="student-kicker">{t.next}</p><h2>{t.nextSession}</h2></div>
          {nextSession ? <div className="student-session"><strong>{nextSession.courseName}</strong><span>{dateLabel(nextSession.start_date, locale)} – {dateLabel(nextSession.end_date, locale)}</span><Link to={`/cours/${nextSession.courseId}`}>{t.seeCourse}</Link></div> : <p className="student-muted">{t.sessionsHere}</p>}
        </section>
        <StudentFeedback />
      </main>
    </div>
  );
}
