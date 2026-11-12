import { NavLink, Link, Outlet } from "react-router-dom";
import { displayName, useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/i18n";

export default function AdminLayout() {
  const language = useLanguage();
  const labels = {
    fr: ["Navigation administrateur","Administration","Vue d’ensemble","Admissions","Dossiers candidats","Gestion","Utilisateurs","À venir","Enseignants","Formations","Accès des élèves","Évaluations","Calendrier","Feedback","Retour au site public","Se déconnecter","Espace sécurisé","Administrateur","Page d’accueil"],
    en: ["Administrator navigation","Administration","Overview","Admissions","Candidate applications","Management","Users","Coming soon","Teachers","Courses","Student access","Assessments","Calendar","Feedback","Back to public site","Sign out","Secure area","Administrator","Homepage"],
    pt: ["Navegação do administrador","Administração","Visão geral","Admissões","Candidaturas","Gestão","Utilizadores","Em breve","Professores","Cursos","Acesso dos alunos","Avaliações","Calendário","Feedback","Voltar ao site público","Terminar sessão","Área segura","Administrador","Página inicial"],
    es: ["Navegación del administrador","Administración","Resumen","Admisiones","Expedientes de candidatura","Gestión","Usuarios","Próximamente","Profesores","Cursos","Acceso de alumnos","Evaluaciones","Calendario","Comentarios","Volver al sitio público","Cerrar sesión","Área segura","Administrador","Página de inicio"]
  }[language];
  const { profile, session, signOut } = useAuth();

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar" aria-label={labels[0]}>
        <Link className="admin-brand" to="/admin">Nexus <em>science</em><span>{labels[1]}</span></Link>
        <nav className="admin-nav">
          <NavLink to="/admin" end>{labels[2]}</NavLink>
          <span className="admin-nav-label">{labels[3]}</span>
          <NavLink to="/admin/candidatures">{labels[4]}</NavLink>
          <span className="admin-nav-label">{labels[5]}</span>
          <span className="admin-nav-item is-planned">{labels[6]} <small>{labels[7]}</small></span>
          <NavLink to="/admin/enseignants">{labels[8]}</NavLink>
          <NavLink to="/admin/formations">{labels[9]}</NavLink>
          <NavLink to="/admin/accueil">{labels[18]}</NavLink>
          <NavLink to="/admin/eleves">{labels[10]}</NavLink>
          <NavLink to="/admin/evaluations">{labels[11]}</NavLink>
          <span className="admin-nav-item is-planned">{labels[12]} <small>{labels[7]}</small></span>
          <span className="admin-nav-item is-planned">{labels[13]} <small>{labels[7]}</small></span>
        </nav>
        <div className="admin-sidebar-footer">
          <span className="admin-user">{displayName(profile, session?.user.email)}</span>
          <Link to="/">{labels[14]}</Link>
          <button className="btn" type="button" onClick={() => void signOut()}>{labels[15]}</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div><p className="eyebrow">{labels[16]}</p><h1>{labels[1]}</h1></div>
          <span className="pill">{labels[17]}</span>
        </header>
        <div className="admin-content"><Outlet /></div>
      </div>
    </section>
  );
}
