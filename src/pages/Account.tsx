import { Link, Navigate } from "react-router-dom";
import { displayName, useAuth } from "../lib/auth";
import { pendingInvitation } from "../lib/invitation";
import { useT } from "../lib/i18n";
import { pagesText } from "../lib/translations";

export default function Account() {
  const { session, profile, loading } = useAuth();
  const t = useT(pagesText);
  if (loading) return <section className="wrap page"><p className="muted" role="status">{t.loading}</p></section>;
  if (!session) return <Navigate to="/connexion" replace />;
  const invitation = profile?.role === "student" ? pendingInvitation() : null;
  if (profile?.role === "student" && !invitation) return <Navigate to="/espace-etudiant" replace />;
  return (
    <section className="wrap page narrow">
      <h1>{t.account}</h1>
      {invitation && <p className="notice">{t.pendingInvite} <Link to={invitation}>{t.continueApplication}</Link>. {t.roleStaysStudent}</p>}
      <dl className="facts">
        <div><dt>{t.name}</dt><dd>{displayName(profile, session.user.email)}</dd></div>
        <div><dt>{t.email}</dt><dd>{session.user.email}</dd></div>
        <div><dt>{t.role}</dt><dd>{profile?.role === "admin" ? t.roleAdmin : profile?.role === "teacher" ? t.roleTeacher : t.roleStudent}</dd></div>
      </dl>
      {profile?.role === "admin" && <p><Link className="btn" to="/admin">{t.goAdmin}</Link></p>}
      {profile?.role === "teacher" && <p><Link className="btn primary" to="/enseignant">{t.goTeacher}</Link></p>}
      <p><Link className="btn" to="/">{t.seeCourses}</Link></p>
    </section>
  );
}
