import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Application = {
  id: string; user_id: string; phone: string; birth_date: string | null;
  nationality: string; country_of_residence: string; city: string;
  education_level: string; desired_program: string; motivation: string;
  status: "submitted" | "under_review" | "accepted" | "rejected";
  review_note: string | null; created_at: string;
  first_name?: string | null; last_name?: string | null; email?: string | null;
};

const label: Record<Application["status"], string> = {
  submitted: "À examiner", under_review: "En examen", accepted: "Acceptée", rejected: "Refusée",
};

export default function AdminApplications() {
  const [rows, setRows] = useState<Application[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  async function reload() {
    const { data, error: cause } = await supabase.from("candidate_applications").select("*").order("created_at", { ascending: false });
    if (cause) { setError("Impossible de charger les dossiers. Vérifiez que la migration candidature est activée et que le compte possède le rôle administrateur."); return; }
    const applications = (data ?? []) as Application[];
    const ids = applications.map(row => row.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids)
      : { data: [], error: null };
    if (profileError) setError("Les dossiers sont chargés, mais les identités des candidats ne sont pas accessibles.");
    const byId = new Map((profiles ?? []).map((profile: { id: string; first_name: string | null; last_name: string | null; email: string | null }) => [profile.id, profile]));
    setRows(applications.map(row => ({ ...row, ...byId.get(row.user_id) })));
  }
  useEffect(() => { void reload(); }, []);

  async function review(row: Application, status: "under_review" | "accepted" | "rejected") {
    const note = window.prompt(status === "rejected" ? "Motif ou éléments à compléter (facultatif) :" : "Note interne (facultatif) :", row.review_note ?? "");
    if (note === null) return;
    setBusyId(row.id); setError("");
    const { error: cause } = await supabase.rpc("review_candidate_application", {
      p_application_id: row.id, p_status: status, p_review_note: note,
    });
    if (cause) setError(cause.message);
    else await reload();
    setBusyId("");
  }

  const visible = rows.filter(row => filter === "all" || row.status === filter);
  return (
    <section>
      <div className="admin-page-heading">
        <div><p className="eyebrow">ADMISSIONS</p><h2>Dossiers de candidature</h2></div>
        <p className="muted">{rows.length} dossier(s) enregistré(s)</p>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <label>Filtrer les dossiers
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">Tous les statuts</option><option value="submitted">À examiner</option>
          <option value="under_review">En examen</option><option value="accepted">Acceptées</option><option value="rejected">Refusées</option>
        </select>
      </label>
      {visible.length === 0 ? <p className="notice">Aucun dossier pour ce filtre.</p> : (
        <div className="stack">
          {visible.map(row => (
            <article className="panel" key={row.id}>
              <div className="row between">
                <div><strong>{[row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "Candidat"} · {row.city}</strong><p className="muted small-text">{row.email ?? row.user_id} · {label[row.status]} · {new Date(row.created_at).toLocaleDateString("fr-FR")}</p></div>
                <span className="pill">{label[row.status]}</span>
              </div>
              <dl className="facts">
                <div><dt>Date de naissance</dt><dd>{row.birth_date ? new Date(row.birth_date).toLocaleDateString("fr-FR") : "Non renseignée"}</dd></div>
                <div><dt>Téléphone</dt><dd>{row.phone}</dd></div>
                <div><dt>Nationalité / résidence</dt><dd>{row.nationality} / {row.country_of_residence}</dd></div>
                <div><dt>Études</dt><dd>{row.education_level}</dd></div>
                <div><dt>Formation souhaitée</dt><dd>{row.desired_program}</dd></div>
              </dl>
              <h3>Motivation</h3><p>{row.motivation}</p>
              {row.review_note && <p className="notice">{row.review_note}</p>}
              <div className="row wrap">
                <button className="btn small" disabled={!!busyId || row.status === "under_review"} onClick={() => void review(row, "under_review")}>Mettre en examen</button>
                <button className="btn small" disabled={!!busyId || row.status === "accepted"} onClick={() => void review(row, "accepted")}>Accepter</button>
                <button className="btn small" disabled={!!busyId || row.status === "rejected"} onClick={() => void review(row, "rejected")}>Refuser / demander correction</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
