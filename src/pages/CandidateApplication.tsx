import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, supabaseConfigured } from "../lib/supabase";

type CandidateApplication = {
  id: string;
  phone: string;
  birth_date: string | null;
  nationality: string;
  country_of_residence: string;
  city: string;
  education_level: string;
  desired_program: string;
  motivation: string;
  status: "submitted" | "under_review" | "accepted" | "rejected";
  review_note: string | null;
  created_at: string;
};

const statusLabels: Record<CandidateApplication["status"], string> = {
  submitted: "Dossier transmis",
  under_review: "En cours d’examen",
  accepted: "Candidature acceptée",
  rejected: "À compléter / refusée",
};

export default function CandidateApplicationPage() {
  const { session, profile, loading } = useAuth();
  const [application, setApplication] = useState<CandidateApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session) return;
    let active = true;
    supabase.from("candidate_applications").select("*").eq("user_id", session.user.id).maybeSingle()
      .then(({ data, error: cause }) => {
        if (!active) return;
        if (cause) setError("Le dossier de candidature n’est pas encore activé sur la base de données. L’équipe doit d’abord appliquer la migration dédiée.");
        else setApplication((data as CandidateApplication | null) ?? null);
        setLoaded(true);
      });
    return () => { active = false; };
  }, [session]);

  if (loading || (session && !loaded)) return <section className="wrap page"><p className="muted" role="status">Chargement de votre dossier…</p></section>;
  if (!session) return <Navigate to="/connexion?retour=%2Fcandidature" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    const { data, error: cause } = await supabase.rpc("submit_candidate_application", {
      p_phone: String(form.get("phone") ?? "").trim(),
      p_birth_date: String(form.get("birth_date") ?? "") || null,
      p_nationality: String(form.get("nationality") ?? "").trim(),
      p_country_of_residence: String(form.get("country_of_residence") ?? "").trim(),
      p_city: String(form.get("city") ?? "").trim(),
      p_education_level: String(form.get("education_level") ?? "").trim(),
      p_desired_program: String(form.get("desired_program") ?? "").trim(),
      p_motivation: String(form.get("motivation") ?? "").trim(),
    });
    if (cause) setError(cause.message.includes("schema cache") || cause.message.includes("does not exist")
      ? "Le module de candidature attend encore l’activation de sa migration dans Supabase."
      : cause.message);
    else {
      const { data: saved } = await supabase.from("candidate_applications").select("*").eq("id", data).single();
      if (saved) setApplication(saved as CandidateApplication);
      setNotice("Votre dossier a été transmis à l’administration de NEXUS SCIENCE.");
    }
    setBusy(false);
  }

  const locked = Boolean(application && application.status !== "rejected");
  return (
    <section className="wrap page narrow">
      <div className="auth-heading">
        <p className="eyebrow">ESPACE CANDIDAT</p>
        <h1>Mon dossier de candidature</h1>
        <p className="muted">Complétez les informations nécessaires à l’étude de votre admission. Vos données restent liées à votre compte.</p>
      </div>
      {application && (
        <div className="panel">
          <strong>{statusLabels[application.status]}</strong>
          <p className="muted small-text">Dossier transmis le {new Date(application.created_at).toLocaleDateString("fr-FR")}.</p>
          {application.review_note && <p>{application.review_note}</p>}
          {locked && <p className="muted small-text">Votre dossier est verrouillé pendant son traitement. Vous pouvez contacter l’administration si une correction est nécessaire.</p>}
        </div>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {!supabaseConfigured && <p className="notice error">La base de données n’est pas configurée.</p>}
      {!locked && (
        <form className="form panel" onSubmit={submit}>
          <h2>Informations personnelles</h2>
          <div className="two">
            <label>Prénom<input value={profile?.first_name ?? ""} readOnly /></label>
            <label>Nom<input value={profile?.last_name ?? ""} readOnly /></label>
          </div>
          <label>Adresse e-mail<input value={session.user.email ?? ""} readOnly /></label>
          <div className="two">
            <label>Téléphone / WhatsApp<input name="phone" required maxLength={40} defaultValue={application?.phone ?? ""} placeholder="+244…" /></label>
            <label>Date de naissance<input name="birth_date" type="date" defaultValue={application?.birth_date ?? ""} /></label>
          </div>
          <div className="two">
            <label>Nationalité<input name="nationality" required maxLength={100} defaultValue={application?.nationality ?? ""} /></label>
            <label>Pays de résidence<input name="country_of_residence" required maxLength={100} defaultValue={application?.country_of_residence ?? ""} /></label>
          </div>
          <label>Ville de résidence<input name="city" required maxLength={120} defaultValue={application?.city ?? ""} /></label>
          <h2>Projet de formation</h2>
          <div className="two">
            <label>Dernier niveau d’études<input name="education_level" required maxLength={120} defaultValue={application?.education_level ?? ""} placeholder="Ex. : secondaire, terminale…" /></label>
            <label>Formation souhaitée<input name="desired_program" required maxLength={160} defaultValue={application?.desired_program ?? ""} placeholder="Nom de la formation" /></label>
          </div>
          <label>Motivation<textarea name="motivation" required minLength={40} maxLength={5000} rows={6} defaultValue={application?.motivation ?? ""} placeholder="Présentez votre parcours, votre projet et vos objectifs (40 caractères minimum)." /></label>
          <button className="btn" type="submit" disabled={busy || !supabaseConfigured}>{busy ? "Transmission…" : application ? "Renvoyer le dossier corrigé" : "Transmettre ma candidature"}</button>
        </form>
      )}
      <p className="muted small-text">Besoin d’aide ? <Link to="/">Retour à l’accueil NEXUS SCIENCE</Link>.</p>
    </section>
  );
}
