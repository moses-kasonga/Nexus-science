import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

type Preview = { email: string } | "invalid" | null;

export default function TeacherInvitation() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { session, loading } = useAuth();
  const [preview, setPreview] = useState<Preview>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    setPreview(null);
    if (!token || !session) return;
    supabase.rpc("redeem_teacher_invitation", { p_token: token }).then(({ data, error: failure }) => {
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : null;
      setPreview(failure || !row ? "invalid" : { email: String(row.email) });
    });
    return () => { active = false; };
  }, [token, session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    const { error: failure } = await supabase.rpc("submit_teacher_application", {
      p_token: token,
      p_specialty: String(form.get("specialty") ?? ""),
      p_qualifications: String(form.get("qualifications") ?? ""),
      p_experience: String(form.get("experience") ?? ""),
      p_motivation: String(form.get("motivation") ?? ""),
    });
    setBusy(false);
    if (failure) setError(failure.message); else setDone(true);
  }

  const wrongAccount = preview && preview !== "invalid" && session?.user.email?.toLowerCase() !== preview.email.toLowerCase();

  return (
    <section className="wrap page narrow">
      <h1>Invitation enseignant</h1>
      {!token && <p className="notice error" role="alert">Ce lien est incomplet. Demandez un nouveau lien à l'administration de Nexus science.</p>}
      {token && loading && <p className="muted" role="status">Chargement…</p>}
      {token && !loading && !session && (
        <p className="notice">Pour continuer, <Link to="/connexion">connectez-vous</Link> ou <Link to="/inscription">créez un compte</Link> avec l'adresse e-mail qui a reçu l'invitation, puis rouvrez ce même lien.</p>
      )}
      {token && session && preview === null && <p className="muted" role="status">Vérification de l'invitation…</p>}
      {preview === "invalid" && <p className="notice error" role="alert">Cette invitation est invalide, expirée ou déjà utilisée. Demandez un nouveau lien à l'administration.</p>}
      {wrongAccount && preview !== "invalid" && preview && <p className="notice error" role="alert">Cette invitation est destinée à {preview.email}. Vous êtes connecté avec une autre adresse : déconnectez-vous puis utilisez le bon compte.</p>}
      {done && <p className="notice" role="status">Candidature envoyée. L'administration l'examinera ; vous deviendrez enseignant une fois qu'elle sera approuvée.</p>}
      {preview && preview !== "invalid" && !wrongAccount && !done && (
        <form className="form" onSubmit={submit}>
          <p className="muted">Invitation pour {preview.email}. Présentez-vous en quelques lignes.</p>
          <label>Spécialité<input name="specialty" required maxLength={300} /></label>
          <label>Qualifications<textarea name="qualifications" rows={3} required maxLength={2000} /></label>
          <label>Expérience<textarea name="experience" rows={3} maxLength={2000} /></label>
          <label>Motivation<textarea name="motivation" rows={3} maxLength={2000} /></label>
          {error && <p className="notice error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Envoi…" : "Envoyer ma candidature"}</button>
        </form>
      )}
    </section>
  );
}
