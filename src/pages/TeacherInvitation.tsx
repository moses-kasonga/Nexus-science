import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { forgetInvitation, rememberInvitation } from "../lib/invitation";
import { useT } from "../lib/i18n";
import { pagesText } from "../lib/translations";

type Preview = { email: string } | "invalid" | null;

export default function TeacherInvitation() {
  const t = useT(pagesText);
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { session, loading, signOut } = useAuth();
  const [preview, setPreview] = useState<Preview>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const returnQuery = `?retour=${encodeURIComponent(`/enseignant/invitation?token=${token}`)}`;
  useEffect(() => { if (token) rememberInvitation(`/enseignant/invitation?token=${encodeURIComponent(token)}`); }, [token]);

  // On dépend de l'identifiant, pas de l'objet session : celui-ci change à chaque renouvellement du jeton, ce qui relançait la vérification en boucle.
  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    setPreview(null);
    if (!token || !userId) return;
    supabase.rpc("redeem_teacher_invitation", { p_token: token }).then(({ data, error: failure }) => {
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : null;
      setPreview(failure || !row ? "invalid" : { email: String(row.email) });
    });
    return () => { active = false; };
  }, [token, userId]);

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
    if (failure) setError(failure.message); else { forgetInvitation(); setDone(true); }
  }

  const wrongAccount = preview && preview !== "invalid" && session?.user.email?.toLowerCase() !== preview.email.toLowerCase();

  return (
    <section className="wrap page narrow">
      <h1>{t.inviteTitle}</h1>
      {session && <p className="muted small-text">{t.connectedAs} {session.user.email}. <button className="linklike" type="button" onClick={() => void signOut()}>{t.changeAccount}</button></p>}
      {!token && <p className="notice error" role="alert">{t.inviteIncomplete}</p>}
      {token && loading && <p className="muted" role="status">{t.loading}</p>}
      {token && !loading && !session && (
        <p className="notice">{t.toContinue} <Link to={`/connexion${returnQuery}`}>{t.signInOr}</Link> {t.or} <Link to={`/inscription${returnQuery}`}>{t.createAccount}</Link> {t.withInvited}</p>
      )}
      {token && session && preview === null && <p className="muted" role="status">{t.checking}</p>}
      {preview === "invalid" && <p className="notice error" role="alert">{t.inviteInvalid}</p>}
      {wrongAccount && preview !== "invalid" && preview && <p className="notice error" role="alert">{t.inviteFor} {preview.email}. {t.otherAddress}</p>}
      {done && <p className="notice" role="status">{t.sentApplication}</p>}
      {preview && preview !== "invalid" && !wrongAccount && !done && (
        <form className="form" onSubmit={submit}>
          <p className="muted">{t.inviteForLine} {preview.email}. {t.introduce}</p>
          <label>{t.specialty}<input name="specialty" required maxLength={300} /></label>
          <label>{t.qualifications}<textarea name="qualifications" rows={3} required maxLength={2000} /></label>
          <label>{t.experience}<textarea name="experience" rows={3} maxLength={2000} /></label>
          <label>{t.teacherMotivation}<textarea name="motivation" rows={3} maxLength={2000} /></label>
          {error && <p className="notice error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? t.sendingShort : t.sendApplication}</button>
        </form>
      )}
    </section>
  );
}
