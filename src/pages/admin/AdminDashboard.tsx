import { useEffect, useState } from "react";
import { fetchAdminSummary, type AdminSummary } from "../../lib/admin";
import { useT } from "../../lib/i18n";

export default function AdminDashboard() {
  const t = useT({
    fr: {
      eyebrow: "Pilotage de la plateforme",
      title: "Vue d’ensemble",
      description: "Les indicateurs affichés dépendent des données accessibles à votre compte.",
      loading: "Chargement des indicateurs…",
      courses: "Formations",
      coursesHint: "Enregistrées et accessibles",
      sessions: "Sessions",
      sessionsHint: "Tous statuts confondus",
      pending: "Candidatures en attente",
      pendingHint: "À examiner",
      next: "Prochaines étapes",
      roadmap: "Les écrans de gestion des utilisateurs, des enseignants, des formations, du calendrier et des retours seront ajoutés dans les lots suivants.",
      rls: "Le nombre total d’utilisateurs n’est pas affiché : les règles RLS actuelles n’autorisent pas encore la lecture des profils des autres membres."
    },
    en: {
      eyebrow: "Platform overview",
      title: "Dashboard",
      description: "The indicators shown depend on the data your account is allowed to access.",
      loading: "Loading indicators…",
      courses: "Courses",
      coursesHint: "Recorded and accessible",
      sessions: "Sessions",
      sessionsHint: "All statuses",
      pending: "Pending applications",
      pendingHint: "To review",
      next: "Next steps",
      roadmap: "User, teacher, course, calendar and feedback management screens will be added in upcoming releases.",
      rls: "The total number of users is not displayed: the current RLS policies do not yet allow reading other members’ profiles."
    },
    pt: {
      eyebrow: "Painel de controlo da plataforma",
      title: "Visão geral",
      description: "Os indicadores apresentados dependem dos dados a que a sua conta tem acesso.",
      loading: "A carregar indicadores…",
      courses: "Cursos",
      coursesHint: "Registados e acessíveis",
      sessions: "Sessões",
      sessionsHint: "Todos os estados",
      pending: "Candidaturas pendentes",
      pendingHint: "Por analisar",
      next: "Próximas etapas",
      roadmap: "As páginas de gestão de utilizadores, professores, cursos, calendário e feedback serão adicionadas nas próximas versões.",
      rls: "O número total de utilizadores não é apresentado: as regras RLS atuais ainda não permitem consultar os perfis dos outros membros."
    },
    es: {
      eyebrow: "Panel de control de la plataforma",
      title: "Vista general",
      description: "Los indicadores mostrados dependen de los datos a los que puede acceder tu cuenta.",
      loading: "Cargando indicadores…",
      courses: "Cursos",
      coursesHint: "Registrados y accesibles",
      sessions: "Sesiones",
      sessionsHint: "Todos los estados",
      pending: "Solicitudes pendientes",
      pendingHint: "Por revisar",
      next: "Próximos pasos",
      roadmap: "Las pantallas de gestión de usuarios, profesores, cursos, calendario y comentarios se añadirán en próximas versiones.",
      rls: "No se muestra el número total de usuarios: las reglas RLS actuales todavía no permiten consultar los perfiles de otros miembros."
    }
  });
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchAdminSummary()
      .then((data) => { if (active) setSummary(data); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  return (
    <section aria-labelledby="admin-dashboard-title">
      <div className="admin-page-heading">
        <div><p className="eyebrow">{t.eyebrow}</p><h2 id="admin-dashboard-title">{t.title}</h2></div>
        <p className="muted">{t.description}</p>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {!summary && !error && <p className="muted" role="status">{t.loading}</p>}
      {summary && (
        <div className="admin-stats">
          <article className="admin-stat"><span>{t.courses}</span><strong>{summary.courses}</strong><small>{t.coursesHint}</small></article>
          <article className="admin-stat"><span>{t.sessions}</span><strong>{summary.sessions}</strong><small>{t.sessionsHint}</small></article>
          <article className="admin-stat"><span>{t.pending}</span><strong>{summary.pendingApplications}</strong><small>{t.pendingHint}</small></article>
        </div>
      )}
      <div className="admin-note">
        <h3>{t.next}</h3>
        <p>{t.roadmap}</p>
        <p className="muted">{t.rls}</p>
      </div>
    </section>
  );
}
