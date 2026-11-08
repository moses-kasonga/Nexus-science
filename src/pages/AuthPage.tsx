import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

function friendlyError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login")) return "Adresse e-mail ou mot de passe incorrect.";
  if (text.includes("email not confirmed")) return "Votre adresse n'est pas encore confirmée. Ouvrez le message de confirmation reçu par e-mail.";
  if (text.includes("already registered") || text.includes("already been registered")) return "Un compte existe déjà avec cette adresse. Connectez-vous.";
  if (text.includes("password") && text.includes("least")) return "Le mot de passe est trop court (8 caractères minimum).";
  if (text.includes("rate limit") || text.includes("too many")) return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  return "Une erreur est survenue. Vérifiez vos informations et réessayez.";
}

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isRegister = mode === "register";

  if (session) return <Navigate to="/compte" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    setBusy(true); setError(""); setNotice("");
    try {
      if (isRegister) {
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
        const { data, error: failure } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { first_name: String(form.get("first_name") ?? "").trim(), last_name: String(form.get("last_name") ?? "").trim() } },
        });
        if (failure) { setError(friendlyError(failure.message)); return; }
        if (data.session) navigate("/compte", { replace: true });
        else setNotice("Compte créé. Ouvrez le message de confirmation envoyé à votre adresse e-mail, puis connectez-vous.");
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
        if (failure) setError(friendlyError(failure.message)); else navigate("/compte", { replace: true });
      }
    } catch { setError("Connexion impossible pour le moment. Vérifiez votre réseau et réessayez."); }
    finally { setBusy(false); }
  }

  return (
    <section className="wrap page auth">
      <h1>{isRegister ? "Créer un compte" : "Se connecter"}</h1>
      <p className="muted">{isRegister ? "Un compte vous permet d'accéder aux leçons de vos cours." : "Heureux de vous revoir sur Nexus science."}</p>
      <form onSubmit={submit} className="form" noValidate={false}>
        {isRegister && (
          <div className="two">
            <label>Prénom<input name="first_name" autoComplete="given-name" required maxLength={80} /></label>
            <label>Nom<input name="last_name" autoComplete="family-name" required maxLength={80} /></label>
          </div>
        )}
        <label>Adresse e-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label>Mot de passe<input name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 8 : undefined} /></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        {notice && <p className="notice ok" role="status">{notice}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Veuillez patienter…" : isRegister ? "Créer mon compte" : "Me connecter"}</button>
      </form>
      <p className="muted">{isRegister ? <>Déjà inscrit ? <Link to="/connexion">Se connecter</Link></> : <>Pas encore de compte ? <Link to="/inscription">Créer un compte</Link></>}</p>
    </section>
  );
}
