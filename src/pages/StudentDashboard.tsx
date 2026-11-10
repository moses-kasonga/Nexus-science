import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { displayName, useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

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

const dateLabel = (value: string) => new Intl.DateTimeFormat("fr-FR", {
  day: "numeric", month: "long", year: "numeric",
}).format(new Date(value + "T12:00:00"));

export default function StudentDashboard() {
  const { session, profile, loading } = useAuth();
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
        if (failure) setError("Impossible de charger vos cours pour le moment. " + failure.message);
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

  if (loading) return <section className="student-loading">Préparation de votre espace étudiant…</section>;
  if (!session) return <Navigate to="/connexion?retour=%2Fespace-etudiant" replace />;
  if (profile?.role !== "student") return <Navigate to={profile?.role === "admin" ? "/admin" : "/compte"} replace />;

  const name = displayName(profile, session.user.email).split(" ")[0];

  return (
    <div className="student-shell">
      <aside className="student-sidebar">
        <Link to="/" className="student-brand"><span>🧬</span><strong>NEXUS <em>SCIENCE</em></strong></Link>
        <p className="student-nav-caption">MON APPRENTISSAGE</p>
        <nav aria-label="Navigation de l'espace étudiant">
          <a className="student-nav-link active" href="#accueil">▦ <span>Tableau de bord</span></a>
          <a className="student-nav-link" href="#mes-cours">▤ <span>Mes cours</span></a>
          <span className="student-nav-link disabled" aria-disabled="true">✎ <span>Exercices & évaluations</span><small>Bientôt</small></span>
          <span className="student-nav-link disabled" aria-disabled="true">▦ <span>Calendrier</span><small>Bientôt</small></span>
        </nav>
        <div className="student-sidebar-bottom">
          <Link to="/compte">Mon profil</Link>
          <Link to="/">← Site public</Link>
        </div>
      </aside>

      <main className="student-main" id="accueil">
        <header className="student-topbar">
          <div><span className="student-kicker">ESPACE ÉTUDIANT</span><h1>Mon apprentissage</h1></div>
          <Link to="/compte" className="student-avatar" aria-label="Ouvrir mon profil">{name.slice(0, 1).toUpperCase()}</Link>
        </header>

        <section className="student-welcome">
          <div><p className="student-kicker">BIENVENUE SUR NEXUS SCIENCE</p><h2>Bonjour {name} 👋</h2><p>Retrouvez vos formations et poursuivez votre parcours scientifique.</p></div>
          <span className="student-welcome-mark" aria-hidden="true">🧬</span>
        </section>

        <section className="student-stats" aria-label="Résumé de votre apprentissage">
          <article className="student-stat"><span>Formations accessibles</span><strong>{busy ? "—" : activeCourses.length}</strong><small>Vos cours avec accès actif</small></article>
          <article className="student-stat"><span>Sessions à venir</span><strong>{busy ? "—" : nextSession ? "1" : "0"}</strong><small>{nextSession ? dateLabel(nextSession.start_date) : "Aucune session annoncée"}</small></article>
          <article className="student-stat"><span>Votre statut</span><strong>Étudiant</strong><small>Compte actif</small></article>
        </section>

        <section className="student-section" id="mes-cours">
          <div className="student-section-heading"><div><p className="student-kicker">VOTRE PARCOURS</p><h2>Mes cours</h2></div><span>{busy ? "Chargement…" : activeCourses.length + " formation(s)"}</span></div>
          {error && <p className="student-alert" role="alert">{error}</p>}
          {busy && <p className="student-empty" role="status">Chargement de vos formations…</p>}
          {!busy && !error && activeCourses.length === 0 && (
            <div className="student-empty"><strong>Votre espace est prêt.</strong><p>Vous n'avez pas encore de cours attribué. Consultez le catalogue public ou contactez l'administration pour obtenir l'accès à une formation.</p><Link className="student-button" to="/">Découvrir les cours</Link></div>
          )}
          {!busy && activeCourses.length > 0 && (
            <div className="student-course-grid">
              {activeCourses.map((course) => (
                <article className="student-course-card" key={course.id}>
                  <span className="student-course-category">{course.category}</span>
                  <h3>{course.name}</h3>
                  <p>{course.description || "Retrouvez les leçons et les ressources de cette formation."}</p>
                  <Link to={`/cours/${course.id}`}>Accéder au cours <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="student-section student-next">
          <div><p className="student-kicker">À SUIVRE</p><h2>Prochaine session</h2></div>
          {nextSession ? <div className="student-session"><strong>{nextSession.courseName}</strong><span>{dateLabel(nextSession.start_date)} – {dateLabel(nextSession.end_date)}</span><Link to={`/cours/${nextSession.courseId}`}>Consulter le cours →</Link></div> : <p className="student-muted">Les dates des prochaines sessions publiées apparaîtront ici.</p>}
        </section>
      </main>
    </div>
  );
}
