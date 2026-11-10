import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { safeReturnPath } from "../lib/invitation";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";

type AuthFailure = { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
type AuthMode = "login" | "register" | "reset";

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
  return "Type : " + name + " · Code : " + code + " · HTTP : " + status + " · Détail : " + message;
}

function friendlyError(message: string, code?: string, status?: number, operation?: "login" | "register" | "reset"): string {
  const text = message.toLowerCase();
  const errorCode = (code ?? "").toLowerCase();
  if (errorCode === "invalid_credentials" || text.includes("invalid login") || text.includes("invalid credentials")) return "Adresse e-mail ou mot de passe incorrect.";
  if (errorCode === "email_not_confirmed" || text.includes("email not confirmed")) return "Cette adresse e-mail doit être confirmée dans la configuration actuelle du service.";
  if (errorCode === "user_already_exists" || text.includes("already registered") || text.includes("already been registered")) return "Un compte existe déjà avec cette adresse. Essaie de te connecter.";
  if (errorCode === "weak_password" || (text.includes("password") && (text.includes("least") || text.includes("short")))) return "Le mot de passe doit contenir au moins 8 caractères et respecter les exigences de sécurité.";
  if (errorCode.includes("rate_limit") || text.includes("rate limit") || text.includes("too many")) return "Trop de tentatives. Patiente quelques minutes avant de réessayer.";
  if (errorCode === "signup_disabled") return "Les inscriptions sont actuellement désactivées dans le service d'authentification.";
  if (errorCode === "captcha_failed" || text.includes("captcha")) return "La vérification anti-robot a échoué ou a expiré. Recommence puis réessaie.";
  if (text.includes("database error") || errorCode === "unexpected_failure" || status === 500) return operation === "register" ? "Le service a rencontré une erreur pendant la création du compte. Le profil automatique doit être vérifié." : "Le service d'authentification a rencontré une erreur serveur.";
  if (status === 429) return "Le service limite temporairement les tentatives. Réessaie dans quelques minutes.";
  if (status === 0 || text.includes("failed to fetch") || text.includes("network")) return "Le site n'arrive pas à joindre le service. Vérifie ta connexion Internet.";
  return "Le service d'authentification a renvoyé une erreur. Réessaie plus tard.";
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const back = safeReturnPath(searchParams.get("retour"));
  const destination = back ?? "/compte";
  const retourQuery = back ? "?retour=" + encodeURIComponent(back) : "";
  const isRegister = mode === "register";
  const isReset = mode === "reset";
  const [recoveryMode, setRecoveryMode] = useState(() => window.location.hash.includes("type=recovery"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isReset) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => data.subscription.unsubscribe();
  }, [isReset]);

  if (session && !isReset) return <Navigate to={destination} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("password_confirmation") ?? "");
    setBusy(true); setError(""); setDiagnostic(""); setNotice("");
    try {
      if (!supabaseConfigured) {
        setError("La connexion au service d'authentification n'est pas configurée pour cette version du site.");
        return;
      }
      if (isReset && recoveryMode) {
        if (password.length < 8) { setError("Le nouveau mot de passe doit contenir au moins 8 caractères."); return; }
        if (password !== confirmation) { setError("Les deux mots de passe ne correspondent pas."); return; }
        const { error: failure } = await supabase.auth.updateUser({ password });
        if (failure) {
          console.error("[NEXUS auth:password-update]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure));
          setError(friendlyError(failure.message, failure.code, failure.status, "reset"));
          return;
        }
        setNotice("Mot de passe modifié. Votre compte est prêt à être utilisé.");
        navigate("/compte", { replace: true });
        return;
      }
      if (isReset) {
        const { error: failure } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/mot-de-passe-oublie",
        });
        if (failure) {
          console.error("[NEXUS auth:password-reset]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure));
          setError(friendlyError(failure.message, failure.code, failure.status, "reset"));
          return;
        }
        setNotice("Si un compte correspond à cette adresse, un lien de réinitialisation va lui être envoyé.");
        return;
      }
      if (isRegister) {
        if (password.length < 8) { setError("Le mot de passe doit contenir au moins 8 caractères."); return; }
        if (password !== confirmation) { setError("Les deux mots de passe ne correspondent pas."); return; }
        const firstName = String(form.get("first_name") ?? "").trim();
        const lastName = String(form.get("last_name") ?? "").trim();
        const { data, error: failure } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { first_name: firstName, last_name: lastName } },
        });
        if (failure) {
          console.error("[NEXUS auth:register]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure));
          setError(friendlyError(failure.message, failure.code, failure.status, "register"));
          return;
        }
        if (data.session) navigate(destination, { replace: true });
        else setNotice("Le compte a été créé, mais le service n'a pas ouvert de session. Pour permettre l'accès direct demandé, la confirmation d'adresse doit être désactivée dans les paramètres d'authentification Supabase.");
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
        if (failure) {
          console.error("[NEXUS auth:login]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure));
          setError(friendlyError(failure.message, failure.code, failure.status, "login"));
        } else navigate(destination, { replace: true });
      }
    } catch (cause) {
      const failure = cause && typeof cause === "object" ? cause as AuthFailure : { message: String(cause) };
      const detail = typeof failure.message === "string" ? failure.message : "Erreur inconnue";
      console.error("[NEXUS auth:unexpected]", { name: failure.name, code: failure.code, status: failure.status, message: detail });
      setDiagnostic(diagnosticDetails(failure));
      setError(friendlyError(detail, typeof failure.code === "string" ? failure.code : undefined, typeof failure.status === "number" ? failure.status : undefined, isRegister ? "register" : isReset ? "reset" : "login"));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true); setError(""); setDiagnostic("");
    try {
      const { error: failure } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + destination },
      });
      if (failure) {
        setDiagnostic(diagnosticDetails(failure));
        setError(friendlyError(failure.message, failure.code, failure.status, "login"));
        setBusy(false);
      }
    } catch (cause) {
      const failure = cause && typeof cause === "object" ? cause as AuthFailure : { message: String(cause) };
      setError(friendlyError(typeof failure.message === "string" ? failure.message : "Erreur inconnue"));
      setBusy(false);
    }
  }

  const title = isReset ? (recoveryMode ? "Choisir un nouveau mot de passe" : "Récupérer mon compte") : isRegister ? "Créer mon compte candidat" : "Se connecter";
  const subtitle = isReset
    ? (recoveryMode ? "Définissez un nouveau mot de passe pour retrouver l'accès à votre compte." : "Saisissez l'adresse e-mail associée à votre compte. Nous vous enverrons un lien sécurisé.")
    : isRegister
      ? "Créez votre espace personnel pour commencer votre parcours sur NEXUS SCIENCE."
      : "Retrouvez votre espace personnel et poursuivez votre parcours NEXUS SCIENCE.";

  return (
    <section className="auth-page wrap page">
      <div className="auth-card">
        <div className="auth-brand"><span aria-hidden="true">🧬</span><span>NEXUS <em>SCIENCE</em></span></div>
        <div className="auth-heading">
          <p className="eyebrow">{isReset ? "ACCÈS AU COMPTE" : isRegister ? "ESPACE CANDIDAT" : "ESPACE PERSONNEL"}</p>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        {!isReset && !isRegister && (
          <>
            <button className="auth-google" type="button" onClick={() => void signInWithGoogle()} disabled={busy}>
              <span className="google-mark" aria-hidden="true">G</span> Continuer avec Google
            </button>
            <div className="auth-divider"><span>ou avec votre adresse e-mail</span></div>
          </>
        )}
        <form onSubmit={submit} className="form auth-form">
          {isRegister && (
            <div className="two">
              <label>Prénom<input name="first_name" autoComplete="given-name" required maxLength={80} placeholder="Votre prénom" /></label>
              <label>Nom<input name="last_name" autoComplete="family-name" required maxLength={80} placeholder="Votre nom" /></label>
            </div>
          )}
          {(!isReset || !recoveryMode) && <label>Adresse e-mail<input name="email" type="email" autoComplete="email" required placeholder="nom@exemple.com" /></label>}
          {(!isReset || recoveryMode) && (
            <>
              <label>{isReset ? "Nouveau mot de passe" : "Mot de passe"}
                <span className="auth-password">
                  <input name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister || recoveryMode ? "new-password" : "current-password"} required minLength={isRegister || recoveryMode ? 8 : undefined} placeholder={isReset ? "Au moins 8 caractères" : "Votre mot de passe"} />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>{showPassword ? "Masquer" : "Afficher"}</button>
                </span>
              </label>
              {(isRegister || recoveryMode) && <label>Confirmer le mot de passe<input name="password_confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} placeholder="Saisissez à nouveau le mot de passe" /></label>}
            </>
          )}
          {error && <p className="notice error" role="alert">{error}</p>}
          {diagnostic && <p className="muted auth-diagnostic" role="status">Diagnostic technique : {diagnostic}</p>}
          {notice && <p className="notice ok" role="status">{notice}</p>}
          <button className="btn primary auth-submit" type="submit" disabled={busy}>{busy ? "Veuillez patienter…" : isReset ? recoveryMode ? "Enregistrer le nouveau mot de passe" : "Envoyer le lien de récupération" : isRegister ? "Créer mon compte" : "Me connecter"}</button>
        </form>
        <div className="auth-links">
          {isRegister && <p>Déjà un compte ? <Link to={"/connexion" + retourQuery}>Se connecter</Link></p>}
          {!isRegister && !isReset && <p><Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>}
          {isReset && !recoveryMode && <p>Vous avez retrouvé votre mot de passe ? <Link to={"/connexion" + retourQuery}>Se connecter</Link></p>}
          {isReset && recoveryMode && <p>Vous souhaitez revenir à la connexion ? <Link to="/connexion">Retour à la connexion</Link></p>}
          {!isRegister && !isReset && <p>Pas encore de compte ? <Link to={"/inscription" + retourQuery}>Créer un compte candidat</Link></p>}
        </div>
        <p className="auth-security">Accès sécurisé · Vos identifiants restent personnels</p>
      </div>
    </section>
  );
}
