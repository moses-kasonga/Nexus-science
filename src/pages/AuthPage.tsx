import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { safeReturnPath } from "../lib/invitation";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { authText, type AuthText } from "../lib/translations";

type AuthFailure = { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
type AuthMode = "login" | "register" | "reset";

function diagnosticDetails(failure: AuthFailure, t: AuthText): string {
  const name = typeof failure.name === "string" ? failure.name : t.unspecified;
  const code = typeof failure.code === "string" ? failure.code : t.unspecified;
  const status = typeof failure.status === "number" ? String(failure.status) : t.unspecified;
  const message = typeof failure.message === "string"
    ? failure.message
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[adresse masquée]")
        .replace(/https?:\/\/\S+/gi, "[URL masquée]")
        .replace(/(apikey|authorization|token|password)\s*[:=]\s*\S+/gi, "$1=[masqué]")
        .slice(0, 180)
    : t.noMessage;
  return t.type + " : " + name + " · " + t.code + " : " + code + " · " + t.http + " : " + status + " · " + t.detail + " : " + message;
}

function friendlyError(message: string, code: string | undefined, status: number | undefined, operation: "login" | "register" | "reset" | undefined, t: AuthText): string {
  const text = message.toLowerCase();
  const errorCode = (code ?? "").toLowerCase();
  if (errorCode === "invalid_credentials" || text.includes("invalid login") || text.includes("invalid credentials")) return t.invalidCredentials;
  if (errorCode === "email_not_confirmed" || text.includes("email not confirmed")) return t.emailNotConfirmed;
  if (errorCode === "user_already_exists" || text.includes("already registered") || text.includes("already been registered")) return t.alreadyExists;
  if (errorCode === "weak_password" || (text.includes("password") && (text.includes("least") || text.includes("short")))) return t.weakPassword;
  if (errorCode.includes("rate_limit") || text.includes("rate limit") || text.includes("too many")) return t.rateLimit;
  if (errorCode === "signup_disabled") return t.signupDisabled;
  if (errorCode === "captcha_failed" || text.includes("captcha")) return t.captcha;
  if (text.includes("database error") || errorCode === "unexpected_failure" || status === 500) return operation === "register" ? t.serverRegister : t.server;
  if (status === 429) return t.rate429;
  if (status === 0 || text.includes("failed to fetch") || text.includes("network")) return t.network;
  return t.generic;
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { session } = useAuth();
  const t = useT(authText);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const back = safeReturnPath(searchParams.get("retour"));
  const destination = back ?? (mode === "register" ? "/candidature" : "/compte");
  const retourQuery = back ? "?retour=" + encodeURIComponent(back) : "";
  const isRegister = mode === "register";
  const isReset = mode === "reset";
  const [recoveryMode, setRecoveryMode] = useState(() => window.location.hash.includes("type=recovery"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState("");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const passwordHasLength = passwordValue.length >= 8;
  const passwordHasNumber = /[0-9]/.test(passwordValue);
  const passwordHasSpecial = /[^A-Za-z0-9\s]/.test(passwordValue);
  const passwordIsValid = passwordHasLength && passwordHasNumber && passwordHasSpecial;

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
        setError(t.notConfigured);
        return;
      }
      if (isReset && recoveryMode) {
        if (!passwordIsValid) { setError(t.passwordPolicy); return; }
        if (password !== confirmation) { setError(t.mismatch); return; }
        const { error: failure } = await supabase.auth.updateUser({ password });
        if (failure) {
          console.error("[NEXUS auth:password-update]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure, t));
          setError(friendlyError(failure.message, failure.code, failure.status, "reset", t));
          return;
        }
        setNotice(t.passwordChanged);
        navigate("/compte", { replace: true });
        return;
      }
      if (isReset) {
        const { error: failure } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/mot-de-passe-oublie",
        });
        if (failure) {
          console.error("[NEXUS auth:password-reset]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure, t));
          setError(friendlyError(failure.message, failure.code, failure.status, "reset", t));
          return;
        }
        setNotice(t.resetSent);
        return;
      }
      if (isRegister) {
        if (!passwordIsValid) { setError(t.passwordPolicy); return; }
        if (password !== confirmation) { setError(t.mismatch); return; }
        const firstName = String(form.get("first_name") ?? "").trim();
        const lastName = String(form.get("last_name") ?? "").trim();
        const { data, error: failure } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { first_name: firstName, last_name: lastName } },
        });
        if (failure) {
          console.error("[NEXUS auth:register]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure, t));
          setError(friendlyError(failure.message, failure.code, failure.status, "register", t));
          return;
        }
        if (data.session) navigate(destination, { replace: true });
        else setNotice(t.noSession);
      } else {
        const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
        if (failure) {
          console.error("[NEXUS auth:login]", { name: failure.name, code: failure.code, status: failure.status, message: failure.message });
          setDiagnostic(diagnosticDetails(failure, t));
          setError(friendlyError(failure.message, failure.code, failure.status, "login", t));
        } else navigate(destination, { replace: true });
      }
    } catch (cause) {
      const failure = cause && typeof cause === "object" ? cause as AuthFailure : { message: String(cause) };
      const detail = typeof failure.message === "string" ? failure.message : t.unknownError;
      console.error("[NEXUS auth:unexpected]", { name: failure.name, code: failure.code, status: failure.status, message: detail });
      setDiagnostic(diagnosticDetails(failure, t));
      setError(friendlyError(detail, typeof failure.code === "string" ? failure.code : undefined, typeof failure.status === "number" ? failure.status : undefined, isRegister ? "register" : isReset ? "reset" : "login", t));
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
        setDiagnostic(diagnosticDetails(failure, t));
        setError(friendlyError(failure.message, failure.code, failure.status, "login", t));
        setBusy(false);
      }
    } catch (cause) {
      const failure = cause && typeof cause === "object" ? cause as AuthFailure : { message: String(cause) };
      setError(friendlyError(typeof failure.message === "string" ? failure.message : t.unknownError, typeof failure.code === "string" ? failure.code : undefined, typeof failure.status === "number" ? failure.status : undefined, "login", t));
      setBusy(false);
    }
  }

  const title = isReset ? (recoveryMode ? t.titleRecovery : t.titleReset) : isRegister ? t.titleRegister : t.titleLogin;
  const subtitle = isReset
    ? (recoveryMode ? t.subRecovery : t.subReset)
    : isRegister
      ? t.subRegister
      : t.subLogin;

  return (
    <section className="auth-page wrap page">
      <div className="auth-card">
        <div className="auth-brand"><span aria-hidden="true">🧬</span><span>NEXUS <em>SCIENCE</em></span></div>
        <div className="auth-heading">
          <p className="eyebrow">{isReset ? t.eyebrowReset : isRegister ? t.eyebrowRegister : t.eyebrowLogin}</p>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        {!isReset && !isRegister && (
          <>
            <button className="auth-google" type="button" onClick={() => void signInWithGoogle()} disabled={busy}>
              <span className="google-mark" aria-hidden="true">G</span> {t.google}
            </button>
            <div className="auth-divider"><span>{t.divider}</span></div>
          </>
        )}
        <form onSubmit={submit} className="form auth-form">
          {isRegister && (
            <div className="two">
              <label>{t.firstName}<input name="first_name" autoComplete="given-name" required maxLength={80} placeholder={t.firstNamePh} /></label>
              <label>{t.lastName}<input name="last_name" autoComplete="family-name" required maxLength={80} placeholder={t.lastNamePh} /></label>
            </div>
          )}
          {(!isReset || !recoveryMode) && <label>{t.email}<input name="email" type="email" autoComplete="email" required placeholder={t.emailPh} /></label>}
          {(!isReset || recoveryMode) && (
            <>
              <label>{isReset ? t.newPassword : t.password}
                <span className="auth-password">
                  <input name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister || recoveryMode ? "new-password" : "current-password"} required minLength={isRegister || recoveryMode ? 8 : undefined} pattern={isRegister || recoveryMode ? "(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{8,}" : undefined} title={isRegister || recoveryMode ? t.passwordPolicy : undefined} value={passwordValue} onChange={(event) => setPasswordValue(event.target.value)} placeholder={isReset ? t.passwordPhReset : t.passwordPh} />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? t.hideLabel : t.showLabel}>{showPassword ? t.hide : t.show}</button>
                </span>
              </label>
              {(isRegister || recoveryMode) && <ul className="auth-password-rules" aria-live="polite">
                <li className={passwordHasLength ? "is-valid" : ""}><span aria-hidden="true">{passwordHasLength ? "✓" : "○"}</span>{t.passwordRuleLength}</li>
                <li className={passwordHasNumber ? "is-valid" : ""}><span aria-hidden="true">{passwordHasNumber ? "✓" : "○"}</span>{t.passwordRuleNumber}</li>
                <li className={passwordHasSpecial ? "is-valid" : ""}><span aria-hidden="true">{passwordHasSpecial ? "✓" : "○"}</span>{t.passwordRuleSpecial}</li>
              </ul>}
              {(isRegister || recoveryMode) && <label>{t.confirm}<input name="password_confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} placeholder={t.confirmPh} /></label>}
            </>
          )}
          {error && <p className="notice error" role="alert">{error}</p>}
          {diagnostic && <p className="muted auth-diagnostic" role="status">{t.diagnostic} : {diagnostic}</p>}
          {notice && <p className="notice ok" role="status">{notice}</p>}
          <button className="btn primary auth-submit" type="submit" disabled={busy}>{busy ? t.wait : isReset ? recoveryMode ? t.saveNew : t.sendLink : isRegister ? t.create : t.login}</button>
        </form>
        <div className="auth-links">
          {isRegister && <p>{t.haveAccount} <Link to={"/connexion" + retourQuery}>{t.signIn}</Link></p>}
          {!isRegister && !isReset && <p><Link to="/mot-de-passe-oublie">{t.forgot}</Link></p>}
          {isReset && !recoveryMode && <p>{t.found} <Link to={"/connexion" + retourQuery}>{t.signIn}</Link></p>}
          {isReset && recoveryMode && <p>{t.backQuestion} <Link to="/connexion">{t.back}</Link></p>}
          {!isRegister && !isReset && <p>{t.noAccount} <Link to={"/inscription" + retourQuery}>{t.createCandidate}</Link></p>}
        </div>
        <p className="auth-security">{t.security}</p>
      </div>
    </section>
  );
}
