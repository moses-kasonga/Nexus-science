import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { dateLocale, useLanguage, useT } from "../../lib/i18n";

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
  const t = useT({
    fr:{submitted:"À examiner",review:"En examen",accepted:"Acceptée",rejected:"Refusée",loadError:t.loadError,identityError:t.identityError,reason:"Motif ou éléments à compléter (facultatif) :",internal:"Note interne (facultatif) :",heading:"Dossiers de candidature",count:"dossier(s) enregistré(s)",filter:"Filtrer les dossiers",all:"Tous les statuts",none:"{t.none}",candidate:"Candidat",birth:"Date de naissance",notProvided:"Non renseignée",phone:"Téléphone",nationality:"Nationalité / résidence",studies:"Études",desired:"Formation souhaitée",motivation:"Motivation",reviewAction:"Mettre en examen",accept:"Accepter",refuse:"Refuser / demander correction"},
    en:{submitted:"To review",review:"Under review",accepted:"Accepted",rejected:"Rejected",loadError:"Unable to load applications. Check that the application migration is enabled and that this account has the administrator role.",identityError:"Applications loaded, but candidate identities are unavailable.",reason:"Reason or details to complete (optional):",internal:"Internal note (optional):",heading:"Applications",count:"application(s) recorded",filter:"Filter applications",all:"All statuses",none:"No applications for this filter.",candidate:"Candidate",birth:"Date of birth",notProvided:"Not provided",phone:"Phone",nationality:"Nationality / residence",studies:"Education",desired:"Desired course",motivation:"Motivation",reviewAction:"Mark as under review",accept:"Accept",refuse:"Reject / request changes"},
    pt:{submitted:"Por analisar",review:"Em análise",accepted:"Aceite",rejected:"Recusada",loadError:"Não foi possível carregar as candidaturas. Verifique se a migração está ativa e se a conta tem o perfil de administrador.",identityError:"As candidaturas foram carregadas, mas as identidades dos candidatos não estão disponíveis.",reason:"Motivo ou elementos a completar (opcional):",internal:"Nota interna (opcional):",heading:"Candidaturas",count:"candidatura(s) registada(s)",filter:"Filtrar candidaturas",all:"Todos os estados",none:"Não existem candidaturas para este filtro.",candidate:"Candidato",birth:"Data de nascimento",notProvided:"Não indicada",phone:"Telefone",nationality:"Nacionalidade / residência",studies:"Estudos",desired:"Curso pretendido",motivation:"Motivação",reviewAction:"Colocar em análise",accept:"Aceitar",refuse:"Recusar / pedir correção"},
    es:{submitted:"Pendiente de revisión",review:"En revisión",accepted:"Aceptada",rejected:"Rechazada",loadError:"No se pudieron cargar las solicitudes. Comprueba que la migración esté activa y que la cuenta tenga el rol de administrador.",identityError:"Las solicitudes se han cargado, pero las identidades de los candidatos no están disponibles.",reason:"Motivo o información que debe completarse (opcional):",internal:"Nota interna (opcional):",heading:"Solicitudes",count:"solicitud(es) registrada(s)",filter:"Filtrar solicitudes",all:"Todos los estados",none:"No hay solicitudes para este filtro.",candidate:"Candidato",birth:"Fecha de nacimiento",notProvided:"No indicada",phone:"Teléfono",nationality:"Nacionalidad / residencia",studies:"Estudios",desired:"Curso solicitado",motivation:"Motivación",reviewAction:"Marcar en revisión",accept:"Aceptar",refuse:"Rechazar / solicitar corrección"}
  });
  const locale = dateLocale[useLanguage()];
  const labels = { submitted:t.submitted, under_review:t.review, accepted:t.accepted, rejected:t.rejected };
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
    const note = window.prompt(status === "rejected" ? t.reason : t.internal, row.review_note ?? "");
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
        <div><p className="eyebrow">ADMISSIONS</p><h2>{t.heading}</h2></div>
        <p className="muted">{rows.length} {t.count}</p>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <label>{t.filter}
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">{t.all}</option><option value="submitted">{t.submitted}</option>
          <option value="under_review">{t.review}</option><option value="accepted">{t.accepted}</option><option value="rejected">{t.rejected}</option>
        </select>
      </label>
      {visible.length === 0 ? <p className="notice">Aucun dossier pour ce filtre.</p> : (
        <div className="stack">
          {visible.map(row => (
            <article className="panel" key={row.id}>
              <div className="row between">
                <div><strong>{[row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || t.candidate} · {row.city}</strong><p className="muted small-text">{row.email ?? row.user_id} · {label[row.status]} · {new Date(row.created_at).toLocaleDateString(locale)}</p></div>
                <span className="pill">{label[row.status]}</span>
              </div>
              <dl className="facts">
                <div><dt>{t.birth}</dt><dd>{row.birth_date ? new Date(row.birth_date).toLocaleDateString("fr-FR")  : t.notProvided}</dd></div>
                <div><dt>{t.phone}</dt><dd>{row.phone}</dd></div>
                <div><dt>{t.nationality}</dt><dd>{row.nationality} / {row.country_of_residence}</dd></div>
                <div><dt>{t.studies}</dt><dd>{row.education_level}</dd></div>
                <div><dt>{t.desired}</dt><dd>{row.desired_program}</dd></div>
              </dl>
              <h3>{t.motivation}</h3><p>{row.motivation}</p>
              {row.review_note && <p className="notice">{row.review_note}</p>}
              <div className="row wrap">
                <button className="btn small" disabled={!!busyId || row.status === "under_review"} onClick={() => void review(row, "under_review")}>{t.reviewAction}</button>
                <button className="btn small" disabled={!!busyId || row.status === "accepted"} onClick={() => void review(row, "accepted")}>{t.accept}</button>
                <button className="btn small" disabled={!!busyId || row.status === "rejected"} onClick={() => void review(row, "rejected")}>{t.refuse}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
