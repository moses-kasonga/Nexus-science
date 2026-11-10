import { NavLink, Link, Outlet } from "react-router-dom";
import { displayName, useAuth } from "../../lib/auth";

export default function AdminLayout() {
  const { profile, session, signOut } = useAuth();

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar" aria-label="Navigation administrateur">
        <Link className="admin-brand" to="/admin">Nexus <em>science</em><span>Administration</span></Link>
        <nav className="admin-nav">
          <NavLink to="/admin" end>Vue d’ensemble</NavLink>
          <span className="admin-nav-label">Admissions</span>
          <NavLink to="/admin/candidatures">Dossiers candidats</NavLink>
          <span className="admin-nav-label">Gestion</span>
          <span className="admin-nav-item is-planned">Utilisateurs <small>À venir</small></span>
          <NavLink to="/admin/enseignants">Enseignants</NavLink>
          <NavLink to="/admin/formations">Formations</NavLink>
          <NavLink to="/admin/eleves">Accès des élèves</NavLink>
          <span className="admin-nav-item is-planned">Calendrier <small>À venir</small></span>
          <span className="admin-nav-item is-planned">Feedback <small>À venir</small></span>
        </nav>
        <div className="admin-sidebar-footer">
          <span className="admin-user">{displayName(profile, session?.user.email)}</span>
          <Link to="/">Retour au site public</Link>
          <button className="btn" type="button" onClick={() => void signOut()}>Se déconnecter</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div><p className="eyebrow">Espace sécurisé</p><h1>Administration</h1></div>
          <span className="pill">Administrateur</span>
        </header>
        <div className="admin-content"><Outlet /></div>
      </div>
    </section>
  );
}
