import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/i18n";
import MoiseAssistant from "../components/MoiseAssistant";

const labels = {
  fr: { title: "Assistant MOÏSE", back: "Retour à mon espace", loading: "Chargement de votre compte…" },
  en: { title: "MOÏSE Assistant", back: "Back to my workspace", loading: "Loading your account…" },
  pt: { title: "Assistente MOÏSE", back: "Voltar ao meu espaço", loading: "A carregar a sua conta…" },
  es: { title: "Asistente MOÏSE", back: "Volver a mi espacio", loading: "Cargando tu cuenta…" },
};

export default function MoiseAssistantPage() {
  const { session, profile, loading } = useAuth();
  const language = useLanguage();
  const t = labels[language];
  if (loading) return <section className="wrap page"><p className="muted" role="status">{t.loading}</p></section>;
  if (!session) return <Navigate to="/connexion?retour=%2Fmoise" replace />;
  if (!profile || !["student", "teacher", "admin"].includes(profile.role)) return <Navigate to="/" replace />;
  return (
    <section className="wrap page">
      <p><Link to={profile.role === "student" ? "/espace-etudiant" : profile.role === "teacher" ? "/enseignant" : "/admin"}>{t.back}</Link></p>
      <p className="eyebrow">NEXUS SCIENCE</p>
      <h1>{t.title}</h1>
      <MoiseAssistant role={profile.role} />
    </section>
  );
}
