import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { dateLocale, useLanguage, useT } from "../lib/i18n";
import { pagesText } from "../lib/translations";

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

export default function CandidateApplicationPage() {
  const { session, profile, loading } = useAuth();
  const t = useT(pagesText);
  const locale = dateLocale[useLanguage()];
  const statusLabels: Record<CandidateApplication["status"], string> = { submitted: t.statusSubmitted, under_review: t.statusReview, accepted: t.statusAccepted, rejected: t.statusRejected };
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
        if (cause) setError(t.migrationPending);
        else setApplication((data as CandidateApplication | null) ?? null);
        setLoaded(true);
      });
    return () => { active = false; };
  }, [session]);

  if (loading || (session && !loaded)) return <section className="wrap page"><p className="muted" role="status">{t.loadingFile}</p></section>;
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
      ? t.moduleWaiting
      : cause.message);
    else {
      const { data: saved } = await supabase.from("candidate_applications").select("*").eq("id", data).single();
      if (saved) setApplication(saved as CandidateApplication);
      setNotice(t.transmitted);
    }
    setBusy(false);
  }

  const locked = Boolean(application && application.status !== "rejected");
  return (
    <section className="wrap page narrow">
      <div className="auth-heading">
        <p className="eyebrow">{t.candidateSpace}</p>
        <h1>{t.myFile}</h1>
        <p className="muted">{t.fileIntro}</p>
      </div>
      {application && (
        <div className="panel">
          <strong>{statusLabels[application.status]}</strong>
          <p className="muted small-text">{t.sentOn} {new Date(application.created_at).toLocaleDateString(locale)}.</p>
          {application.review_note && <p>{application.review_note}</p>}
          {locked && <p className="muted small-text">{t.locked}</p>}
        </div>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {!supabaseConfigured && <p className="notice error">{t.dbMissing}</p>}
      {!locked && (
        <form className="form panel" onSubmit={submit}>
          <h2>{t.personalInfo}</h2>
          <div className="two">
            <label>{t.firstName}<input value={profile?.first_name ?? ""} readOnly /></label>
            <label>{t.lastName}<input value={profile?.last_name ?? ""} readOnly /></label>
          </div>
          <label>{t.email}<input value={session.user.email ?? ""} readOnly /></label>
          <div className="two">
            <label>{t.phone}<input name="phone" required maxLength={40} defaultValue={application?.phone ?? ""} placeholder="+244…" /></label>
            <label>{t.birth}<input name="birth_date" type="date" defaultValue={application?.birth_date ?? ""} /></label>
          </div>
          <div className="two">
            <label>{t.nationality}<input name="nationality" required maxLength={100} defaultValue={application?.nationality ?? ""} /></label>
            <label>{t.residenceCountry}<input name="country_of_residence" required maxLength={100} defaultValue={application?.country_of_residence ?? ""} /></label>
          </div>
          <label>{t.city}<input name="city" required maxLength={120} defaultValue={application?.city ?? ""} /></label>
          <h2>{t.project}</h2>
          <div className="two">
            <label>{t.education}<input name="education_level" required maxLength={120} defaultValue={application?.education_level ?? ""} placeholder={t.educationPh} /></label>
            <label>{t.program}<input name="desired_program" required maxLength={160} defaultValue={application?.desired_program ?? ""} placeholder={t.programPh} /></label>
          </div>
          <label>{t.motivation}<textarea name="motivation" required minLength={40} maxLength={5000} rows={6} defaultValue={application?.motivation ?? ""} placeholder={t.motivationPh} /></label>
          <button className="btn" type="submit" disabled={busy || !supabaseConfigured}>{busy ? t.sending : application ? t.resend : t.submit}</button>
        </form>
      )}
      <p className="muted small-text">{t.needHelp} <Link to="/">{t.backHome}</Link>.</p>
    </section>
  );
}
