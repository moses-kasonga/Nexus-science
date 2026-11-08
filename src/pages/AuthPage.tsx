import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { TurnstileWidget } from "../components/TurnstileWidget";

type AuthFailure = { name?: unknown; code?: unknown; status?: unknown; message?: unknown };

function diagnosticDetails(failure: AuthFailure): string {
  const name = typeof failure.name === "string" ? failure.name : "non précisé";
  const code = typeof failure.code === "string" ? failure.code : "non précisé";
  const status = typeof failure.status === "number" ? String(failure.status) : "non précisé";
  const message = typeof failure.message === "string"
    ? failure.message
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[adresse masquée]")
        .replace(/https?:\/\/\S+/gi, "[URL masquée]")
        .replace(/(apikey|authorization|token|password)\s*[:=]\s*\S+/gi, "$1=[masqué]")
        .slice(0, 180)
    : "aucun message";
  return `Type : ${name} · Code : ${code} · HTTP : ${status} · Détail : ${message}`;
}

function friendlyError(message: string, code?: string, status?: number, operation?: "login" | "register"): string {
  const text = message.toLowerCase();
  const errorCode = (code ?? "").toLowerCase();
  if (errorCode === "invalid_credentials" || text.includes("invalid login") || text.includes("invalid credentials")) return "Adresse e-mail ou mot de passe incorrect.";
  if (errorCode === "email_not_confirmed" || text.includes("email not confirmed")) return "Cette adresse e-mail n'est pas encore confirmée. Vérifie ta boîte de réception.";
  if (errorCode === "user_already_exists" || text.includes("already registered") || text.includes("already been registered")) return "Un compte existe déjà avec cette adresse. Essaie de te connecter.";
  if (errorCode === "weak_password" || (text.includes("password") && (text.includes("least") || text.includes("short")))) return "Le mot de passe est trop court ou ne respecte pas les exigences de sécurité.";
  if (errorCode.includes("rate_limit") || text.includes("rate limit") || text.includes("too many")) return "Trop de tentatives. Patiente quelques minutes avant de réessayer.";
  if (errorCode === "signup_disabled") return "Les inscriptions sont actuellement désactivées dans le service d'authentification.";
  if (errorCode === "captcha_failed" || text.includes("captcha")) return "La vérification anti-robot a échoué ou a expiré. Recommence la vérification puis réessaie.";
  if (text.includes("database error") || errorCode === "unexpected_failure" || status === 500) return operation === "register" ? "Supabase a refusé la création du compte côté serveur. Le profil automatique ou un déclencheur de la base doit être vérifié." : "Le service d'authentification a rencontré une erreur serveur. La configuration Supabase doit être vérifiée.";
  if (status === 429) return "Le service limite temporairement les tentatives. Réessaie dans quelques minutes.";
  if (status === 0 || text.includes("failed to fetch") || text.includes("network")) return "Le site n'arrive pas à joindre Supabase. Vérifie ta connexion Internet et la configuration du service.";
  return "Supabase a renvoyé une erreur non identifiée. Réessaie plus tard ; le diagnostic technique doit être consulté.";
}

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const [notice, setNotice] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [widgetVersion, setWidgetVersion] = useState(0);
  const isRegister = mode === "register";

  if (session) return <Navigate to="/compte" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    setBusy(true); setError(""); setDiagnostic(""); setNotice("");
    try {
      if (!supabaseConfigured) {
        setError("La connexion à Supabase n'est pas configurée pour cette version du site. Vérifie les variables Vercel.");
        return;
      }
      if (!turnstileSiteKey) {
        setError("La vérification anti-robot n'est pas encore configurée sur cette version du site. Réessaie après la configuration technique.");
        return;
      }
      if (!captchaToken) {
        setError("Valide d'abord la vérification anti-robot.");
        return;
      }
      if (isRegister) {
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
        const { data, error: failure } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, captchaToken, data: { first_name: String(form.get("first_name") ?? "").trim(), last_name: String(form.get("last_name") ?? "").trim() } },
        });
        if (failure) {
          console.error("[NEXUS auth:register]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure));
          setError(friendlyError(failure.message, failure.code, failure.status, "register"));
          return;
        }
        if (data.session) navigate("/compte", { replace: true });
        else setNotice("Compte créé. Ouvrez le message de confirmation envoyé à votre adresse e-mail, puis connectez-vous.");
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
        if (failure) {
          console.error("[NEXUS auth:login]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure));
          setError(friendlyError(failure.message, failure.code, failure.status, "login"));
        } else navigate("/compte", { replace: true });
      }
    } catch (cause) {
      const failure = cause && typeof cause === "object" ? cause as AuthFailure : { message: String(cause) };
      const detail = typeof failure.message === "string" ? failure.message : "Erreur inconnue";
      console.error("[NEXUS auth:unexpected]", { name: failure.name, code: failure.code, status: failure.status, message: detail });
      setDiagnostic(diagnosticDetails(failure));
      setError(friendlyError(detail, typeof failure.code === "string" ? failure.code : undefined, typeof failure.status === "number" ? failure.status : undefined, isRegister ? "register" : "login"));
    } finally {
      setCaptchaToken(null);
      setWidgetVersion((version) => version + 1);
      setBusy(false);
    }
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
        {turnstileSiteKey ? (
          <div className="captcha-block">
            <TurnstileWidget key={widgetVersion} siteKey={turnstileSiteKey} onSuccess={setCaptchaToken} onExpire={() => setCaptchaToken(null)} onError={() => { setCaptchaToken(null); setError("Impossible de charger la vérification anti-robot. Vérifie ta connexion puis actualise la page."); }} />
            <p className="muted" style={{ fontSize: "0.82rem" }}>Vérification de sécurité Cloudflare</p>
          </div>
        ) : (
          <p className="notice error" role="status">Vérification anti-robot en attente de configuration.</p>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        {diagnostic && <p className="muted" role="status" style={{ fontSize: "0.8rem", overflowWrap: "anywhere" }}>Diagnostic technique : {diagnostic}</p>}
        {notice && <p className="notice ok" role="status">{notice}</p>}
        <button className="btn primary" type="submit" disabled={busy || !captchaToken}>{busy ? "Veuillez patienter…" : isRegister ? "Créer mon compte" : "Me connecter"}</button>
      </form>
      <p className="muted">{isRegister ? <>Déjà inscrit ? <Link to="/connexion">Se connecter</Link></> : <>Pas encore de compte ? <Link to="/inscription">Créer un compte</Link></>}</p>
    </section>
  );
}
