import { Link, Navigate } from "react-router-dom";
import { displayName, roleLabel, useAuth } from "../lib/auth";
import { pendingInvitation } from "../lib/invitation";

export default function Account() {
  const { session, profile, loading, signOut } = useAuth();
  if (loading) return <section className="wrap page"><p className="muted" role="status">Chargement…</p></section>;
  if (!session) return <Navigate to="/connexion" replace />;
  const invitation = profile?.role === "student" ? pendingInvitation() : null;
  return (
    <section className="wrap page narrow">
      <h1>Mon compte</h1>
      {invitation && <p className="notice">Vous avez une invitation enseignant en attente. <Link to={invitation}>Continuer ma candidature</Link>. Votre rôle reste « Élève » tant que l'administration n'a pas approuvé la candidature.</p>}
      <dl className="facts">
        <div><dt>Nom</dt><dd>{displayName(profile, session.user.email)}</dd></div>
        <div><dt>Adresse e-mail</dt><dd>{session.user.email}</dd></div>
        <div><dt>Rôle</dt><dd>{profile ? roleLabel[profile.role] : "Élève"}</dd></div>
      </dl>
      <p><Link className="btn" to="/">Voir les cours</Link> <button className="btn" onClick={() => void signOut()}>Se déconnecter</button></p>
    </section>
  );
}
