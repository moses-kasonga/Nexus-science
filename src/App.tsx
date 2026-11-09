import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { displayName, useAuth } from "./lib/auth";
import { supabaseConfigured } from "./lib/supabase";
import Home from "./pages/Home";
import CoursePage from "./pages/CoursePage";
import AuthPage from "./pages/AuthPage";
import Account from "./pages/Account";
import AdminGuard from "./components/admin/AdminGuard";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTeachers from "./pages/admin/AdminTeachers";
import { CoursesRoute, StudentsRoute } from "./pages/admin/routes";

type Language = "fr" | "en" | "pt" | "es";

function Header({ language, setLanguage, dark, toggleTheme, search, setSearch }: {
  language: Language; setLanguage: (value: Language) => void;
  dark: boolean; toggleTheme: () => void; search: string; setSearch: (value: string) => void;
}) {
  const { session, profile } = useAuth();
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link to="/" className="brand" aria-label="Nexus science, accueil">
          <span className="brand-mark" aria-hidden="true">🧬</span>
          <span>NEXUS <em>SCIENCE</em></span>
        </Link>
        <nav aria-label="Navigation principale" className="nav">
          <a href="#cours">{language === "fr" ? "Cours" : language === "pt" ? "Cursos" : language === "es" ? "Cursos" : "Courses"}</a>
          {session && profile?.role === "admin" && <NavLink to="/admin">Administration</NavLink>}
          {session ? <NavLink to="/compte" className="nav-cta">{displayName(profile, session.user.email)}</NavLink> : <NavLink to="/connexion" className="nav-cta">{language === "fr" ? "Connexion" : language === "pt" ? "Entrar" : language === "es" ? "Acceder" : "Sign in"}</NavLink>}
        </nav>
        <div className="header-tools">
          <label className="language-picker" aria-label="Choisir la langue">
            <span aria-hidden="true">{language === "fr" ? "🇫🇷" : language === "en" ? "🇬🇧" : language === "pt" ? "🇵🇹" : "🇪🇸"}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              <option value="fr">FR</option><option value="en">EN</option><option value="pt">PT</option><option value="es">ES</option>
            </select>
          </label>
          <label className="header-search" aria-label="Rechercher un cours">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "fr" ? "Rechercher" : language === "pt" ? "Pesquisar" : language === "es" ? "Buscar" : "Search"} />
          </label>
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={dark ? "Activer le thème clair" : "Activer le thème sombre"}>{dark ? "☀️" : "🌙"}</button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [language, setLanguage] = useState<Language>("fr");
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [search, setSearch] = useState("");
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  return (
    <>
      <a href="#contenu" className="skip">Aller au contenu</a>
      <Header language={language} setLanguage={setLanguage} dark={dark} toggleTheme={() => setDark(value => !value)} search={search} setSearch={setSearch} />
      <main id="contenu">
        {!supabaseConfigured && <div className="wrap"><p className="notice error" role="alert">La connexion à la base de données n'est pas configurée (variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY).</p></div>}
        <Routes>
          <Route path="/" element={<Home language={language} search={search} />} />
          <Route path="/cours/:id" element={<CoursePage />} />
          <Route path="/connexion" element={<AuthPage mode="login" />} />
          <Route path="/inscription" element={<AuthPage mode="register" />} />
          <Route path="/compte" element={<Account />} />
          <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
            <Route index element={<AdminDashboard />} />
            <Route path="formations" element={<CoursesRoute />} />
            <Route path="eleves" element={<StudentsRoute />} />
            <Route path="enseignants" element={<AdminTeachers />} />
          </Route>
          <Route path="*" element={<section className="wrap page"><h1>Page introuvable</h1><p><Link to="/">Retour à l’accueil</Link></p></section>} />
        </Routes>
      </main>
      <footer className="site-footer"><div className="wrap footer-brand"><strong>🧬 NEXUS SCIENCE</strong><span>Plateforme d’apprentissage scientifique</span><span>Apprendre · Comprendre · Progresser</span></div></footer>
    </>
  );
}
