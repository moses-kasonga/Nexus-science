import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { supabaseConfigured } from "./lib/supabase";
import Home from "./pages/Home";
import CoursePage from "./pages/CoursePage";
import AuthPage from "./pages/AuthPage";
import Account from "./pages/Account";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherInvitation from "./pages/TeacherInvitation";
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
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const labels = {
    fr: { home: "Accueil", search: "Rechercher", menu: "Menu", close: "Fermer", calendar: "Candidature", catalog: "Catalogue des formations", faq: "Créer un compte candidat", login: "Se connecter", logout: "Mon compte", discover: "Découvrez", journey: "Construire son parcours scientifique", find: "Trouver une formation", learn: "Apprendre et s’évaluer", success: "Préparer sa réussite scientifique", mission: "Notre mission", platform: "La plateforme", disciplines: "Disciplines scientifiques", path: "Votre parcours", courses: "Les formations", practice: "Apprendre par la pratique", theme: "Mode sombre / clair" },
    en: { home: "Home", search: "Search", menu: "Menu", close: "Close", calendar: "Application", catalog: "Course catalogue", faq: "Create candidate account", login: "Sign in", logout: "My account", discover: "Discover", journey: "Build your scientific journey", find: "Find a course", learn: "Learn and assess", success: "Prepare for scientific success", mission: "Our mission", platform: "The platform", disciplines: "Scientific disciplines", path: "Your journey", courses: "Courses", practice: "Learn through practice", theme: "Dark / light mode" },
    pt: { home: "Início", search: "Pesquisar", menu: "Menu", close: "Fechar", calendar: "Candidatura", catalog: "Catálogo de cursos", faq: "Criar conta de candidato", login: "Entrar", logout: "A minha conta", discover: "Descubra", journey: "Construa o seu percurso científico", find: "Encontrar um curso", learn: "Aprender e avaliar", success: "Preparar o sucesso científico", mission: "A nossa missão", platform: "A plataforma", disciplines: "Disciplinas científicas", path: "O seu percurso", courses: "Cursos", practice: "Aprender na prática", theme: "Modo escuro / claro" },
    es: { home: "Inicio", search: "Buscar", menu: "Menú", close: "Cerrar", calendar: "Solicitud", catalog: "Catálogo de cursos", faq: "Crear cuenta de candidato", login: "Iniciar sesión", logout: "Mi cuenta", discover: "Descubre", journey: "Construye tu recorrido científico", find: "Encontrar un curso", learn: "Aprender y evaluar", success: "Preparar el éxito científico", mission: "Nuestra misión", platform: "La plataforma", disciplines: "Disciplinas científicas", path: "Tu recorrido", courses: "Cursos", practice: "Aprender con la práctica", theme: "Modo oscuro / claro" }
  }[language];
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link to="/" className="brand" aria-label="Nexus science, accueil" onClick={closeMenu}>
          <span className="brand-mark" aria-hidden="true">🧬</span>
          <span>NEXUS <em>SCIENCE</em></span>
        </Link>
        <div className="header-tools">
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={dark ? "Activer le thème clair" : "Activer le thème sombre"}>{dark ? "☀️" : "🌙"}</button>
          <button className="header-icon-button" type="button" onClick={() => setSearchOpen(v => !v)} aria-label={labels.search}>⌕</button>
          <label className="language-picker" aria-label="Choisir la langue">
            <span aria-hidden="true">{language === "fr" ? "🇫🇷" : language === "en" ? "🇬🇧" : language === "pt" ? "🇵🇹" : "🇪🇸"}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              <option value="fr">FR</option><option value="en">EN</option><option value="pt">PT</option><option value="es">ES</option>
            </select>
          </label>
          <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="public-menu" onClick={() => setMenuOpen(v => !v)}>
            <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span><span>{menuOpen ? labels.close : labels.menu}</span>
          </button>
        </div>
      </div>
      {searchOpen && <div className="header-search-panel wrap"><label>{labels.search}<input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={labels.search + "…"} /></label></div>}
      {menuOpen && <div className="public-menu" id="public-menu">
        <div className="public-menu-top"><strong>{labels.menu}</strong><button type="button" onClick={closeMenu}>{labels.close} ×</button></div>
        <nav aria-label="Menu principal">
          <Link to="/" onClick={closeMenu}>{labels.home}</Link>
          <Link to="/#formations" onClick={closeMenu}>{labels.catalog}</Link>
          <Link to="/inscription" onClick={closeMenu}>{labels.calendar}</Link>
          {!session && <Link to="/inscription" onClick={closeMenu}>{labels.faq}</Link>}
          {session ? <Link to="/compte" onClick={closeMenu}>{labels.logout}</Link> : <Link to="/connexion" onClick={closeMenu}>{labels.login} ↗</Link>}
        </nav>
        <div className="public-menu-groups">
          <details open>
            <summary>{labels.discover}</summary>
            <Link to="/#mission" onClick={closeMenu}>{labels.mission}</Link>
            <Link to="/#plateforme" onClick={closeMenu}>{labels.platform}</Link>
            <Link to="/#decouvrir" onClick={closeMenu}>{labels.disciplines}</Link>
          </details>
          <details><summary>{labels.journey}</summary><Link to="/#parcours" onClick={closeMenu}>{labels.path}</Link></details>
          <details><summary>{labels.find}</summary><Link to="/#formations" onClick={closeMenu}>{labels.courses}</Link></details>
          <details><summary>{labels.learn}</summary><Link to="/#apprendre" onClick={closeMenu}>{labels.practice}</Link></details>
          <details><summary>{labels.success}</summary><Link to="/#parcours" onClick={closeMenu}>{labels.path}</Link></details>
        </div>
        <button className="menu-theme" type="button" onClick={toggleTheme}>◐　{labels.theme}</button>
      </div>}
    </header>
  );
}
export default function App() {
  const location = useLocation();
  const studentArea = location.pathname.startsWith("/espace-etudiant");
  const [language, setLanguage] = useState<Language>("fr");
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [search, setSearch] = useState("");
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  return (
    <>
      {!studentArea && <><a href="#contenu" className="skip">Aller au contenu</a><Header language={language} setLanguage={setLanguage} dark={dark} toggleTheme={() => setDark(value => !value)} search={search} setSearch={setSearch} /></>}
      <main id="contenu">
        {!supabaseConfigured && <div className="wrap"><p className="notice error" role="alert">La connexion à la base de données n'est pas configurée (variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY).</p></div>}
        <Routes>
          <Route path="/" element={<Home language={language} search={search} />} />
          <Route path="/cours/:id" element={<CoursePage />} />
          <Route path="/connexion" element={<AuthPage mode="login" />} />
          <Route path="/inscription" element={<AuthPage mode="register" />} />
          <Route path="/mot-de-passe-oublie" element={<AuthPage mode="reset" />} />
          <Route path="/compte" element={<Account />} />
          <Route path="/espace-etudiant" element={<StudentDashboard />} />
          <Route path="/enseignant/invitation" element={<TeacherInvitation />} />
          <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
            <Route index element={<AdminDashboard />} />
            <Route path="formations" element={<CoursesRoute />} />
            <Route path="eleves" element={<StudentsRoute />} />
            <Route path="enseignants" element={<AdminTeachers />} />
          </Route>
          <Route path="*" element={<section className="wrap page"><h1>Page introuvable</h1><p><Link to="/">Retour à l’accueil</Link></p></section>} />
        </Routes>
      </main>
      {!studentArea && <footer className="site-footer"><div className="wrap footer-brand"><strong>🧬 NEXUS SCIENCE</strong><span>Plateforme d’apprentissage scientifique</span><span>Apprendre · Comprendre · Progresser</span></div></footer>}
    </>
  );
}
