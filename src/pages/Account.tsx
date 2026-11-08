import { Link, Navigate } from "react-router-dom";
import { displayName, roleLabel, useAuth } from "../lib/auth";

export default function Account() {
  const { session, profile, loading, signOut } = useAuth();
  if (loading) return <section className="wrap page"><p className="muted" role="status">Chargement…</p></section>;
  if (!session) return <Navigate to="/connexion" replace />;
  return (
    <section className="wrap page narrow">
      <h1>Mon compte</h1>
      <dl className="facts">
        <div><dt>Nom</dt><dd>{displayName(profile, session.user.email)}</dd></div>
        <div><dt>Adresse e-mail</dt><dd>{session.user.email}</dd></div>
        <div><dt>Rôle</dt><dd>{profile ? roleLabel[profile.role] : "Élève"}</dd></div>
      </dl>
      <p><Link className="btn" to="/">Voir les cours</Link> <button className="btn" onClick={() => void signOut()}>Se déconnecter</button></p>
    </section>
  );
}
