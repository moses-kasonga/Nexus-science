import { useEffect, useState } from "react";
import { fetchAdminSummary, type AdminSummary } from "../../lib/admin";

export default function AdminDashboard() {
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
        <div><p className="eyebrow">Pilotage de la plateforme</p><h2 id="admin-dashboard-title">Vue d’ensemble</h2></div>
        <p className="muted">Les indicateurs affichés dépendent des données accessibles à votre compte.</p>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      {!summary && !error && <p className="muted" role="status">Chargement des indicateurs…</p>}
      {summary && (
        <div className="admin-stats">
          <article className="admin-stat"><span>Formations</span><strong>{summary.courses}</strong><small>Enregistrées et accessibles</small></article>
          <article className="admin-stat"><span>Sessions</span><strong>{summary.sessions}</strong><small>Tous statuts confondus</small></article>
          <article className="admin-stat"><span>Candidatures en attente</span><strong>{summary.pendingApplications}</strong><small>À examiner</small></article>
        </div>
      )}
      <div className="admin-note">
        <h3>Prochaines étapes</h3>
        <p>Les écrans de gestion des utilisateurs, des enseignants, des formations, du calendrier et des retours seront ajoutés dans les lots suivants.</p>
        <p className="muted">Le nombre total d’utilisateurs n’est pas affiché : les règles RLS actuelles n’autorisent pas encore la lecture des profils des autres membres.</p>
      </div>
    </section>
  );
}
