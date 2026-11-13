import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { supabase, supabaseConfigured } from "./lib/supabase";
import Home from "./pages/Home";
import CoursePage from "./pages/CoursePage";
import AuthPage from "./pages/AuthPage";
import Account from "./pages/Account";
import CandidateApplicationPage from "./pages/CandidateApplication";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherInvitation from "./pages/TeacherInvitation";
import { LanguageContext, LanguageSetterContext, setActiveLanguage } from "./lib/i18n";
import { pagesText } from "./lib/translations";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import TeacherCourse from "./pages/teacher/TeacherCourse";
import AdminGuard from "./components/admin/AdminGuard";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminApplications from "./pages/admin/AdminApplications";
import AdminTeachers from "./pages/admin/AdminTeachers";
import AdminAssessments from "./pages/admin/AdminAssessments";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCalendar from "./pages/admin/AdminCalendar";
import AdminHomepage from "./pages/admin/AdminHomepage";
import { CoursesRoute, StudentsRoute } from "./pages/admin/routes";

type Language = "fr" | "en" | "pt" | "es";

function Header({ language, setLanguage, dark, toggleTheme, search, setSearch }: {
  language: Language; setLanguage: (value: Language) => void;
  dark: boolean; toggleTheme: () => void; search: string; setSearch: (value: string) => void;
}) {
  const { session, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);
  const labels = {
    fr: { home: "Accueil", search: "Rechercher", menu: "Menu", close: "Fermer", calendar: "Candidature", catalog: "Catalogue des formations", faq: "Créer un compte candidat", login: "Se connecter", logout: "Mon compte", discover: "Découvrez", journey: "Construire son parcours scientifique", find: "Trouver une formation", learn: "Apprendre et s’évaluer", success: "Préparer sa réussite scientifique", mission: "Notre mission", platform: "La plateforme", disciplines: "Disciplines scientifiques", path: "Votre parcours", courses: "Les formations", practice: "Apprendre par la pratique", theme: "Mode sombre / clair", language:"Choisir la langue", mainNav:"Menu principal", lightMode:"Activer le thème clair", darkMode:"Activer le thème sombre" },
    en: { home: "Home", search: "Search", menu: "Menu", close: "Close", calendar: "Application", catalog: "Course catalogue", faq: "Create candidate account", login: "Sign in", logout: "My account", discover: "Discover", journey: "Build your scientific journey", find: "Find a course", learn: "Learn and assess", success: "Prepare for scientific success", mission: "Our mission", platform: "The platform", disciplines: "Scientific disciplines", path: "Your journey", courses: "Courses", practice: "Learn through practice", theme: "Dark / light mode", language:"Choose language", mainNav:"Main menu", lightMode:"Enable light theme", darkMode:"Enable dark theme" },
    pt: { home: "Início", search: "Pesquisar", menu: "Menu", close: "Fechar", calendar: "Candidatura", catalog: "Catálogo de cursos", faq: "Criar conta de candidato", login: "Entrar", logout: "A minha conta", discover: "Descubra", journey: "Construa o seu percurso científico", find: "Encontrar um curso", learn: "Aprender e avaliar", success: "Preparar o sucesso científico", mission: "A nossa missão", platform: "A plataforma", disciplines: "Disciplinas científicas", path: "O seu percurso", courses: "Cursos", practice: "Aprender na prática", theme: "Modo escuro / claro", language:"Escolher idioma", mainNav:"Menu principal", lightMode:"Ativar tema claro", darkMode:"Ativar tema escuro" },
    es: { home: "Inicio", search: "Buscar", menu: "Menú", close: "Cerrar", calendar: "Solicitud", catalog: "Catálogo de cursos", faq: "Crear cuenta de candidato", login: "Iniciar sesión", logout: "Mi cuenta", discover: "Descubre", journey: "Construye tu recorrido científico", find: "Encontrar un curso", learn: "Aprender y evaluar", success: "Preparar el éxito científico", mission: "Nuestra misión", platform: "La plataforma", disciplines: "Disciplinas científicas", path: "Tu recorrido", courses: "Cursos", practice: "Aprender con la práctica", theme: "Modo oscuro / claro", language:"Elegir idioma", mainNav:"Menú principal", lightMode:"Activar tema claro", darkMode:"Activar tema oscuro" }
  }[language];
  const closeMenu = () => setMenuOpen(false);
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link to="/" className="brand" aria-label={`Nexus Science — ${labels.home}`} onClick={closeMenu}>
          <span className="brand-mark" aria-hidden="true">🧬</span>
          <span>NEXUS <em>SCIENCE</em></span>
        </Link>
        <div className="header-tools">
          <button className="header-icon-button" type="button" onClick={() => setSearchOpen(v => !v)} aria-label={labels.search}>⌕</button>
          <label className="language-picker" aria-label={labels.language}>
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
      {searchOpen && <form className="header-search-panel wrap" role="search" onSubmit={event => {
        event.preventDefault();
        setSearchOpen(false);
        if (window.location.pathname !== "/") window.location.assign("/#formations");
        else document.getElementById("formations")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}>
        <label htmlFor="public-course-search">{labels.search}</label>
        <div className="header-search-control">
          <input id="public-course-search" autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={labels.search + "…"} />
          <button type="submit" aria-label={labels.search}>⌕</button>
        </div>
        <small>{language === "fr" ? "Rechercher dans le catalogue des formations" : language === "pt" ? "Pesquisar no catálogo de cursos" : language === "es" ? "Buscar en el catálogo de cursos" : "Search the course catalogue"}</small>
      </form>}
      {menuOpen && <>
        <button className="public-menu-backdrop" type="button" aria-label={labels.close} onClick={closeMenu} />
        <aside className="public-menu" id="public-menu" role="dialog" aria-modal="true" aria-label={labels.menu}>
        <div className="public-menu-top">
          <strong>{labels.menu}</strong>
          <div className="public-menu-actions">
            <button className="menu-theme" type="button" onClick={toggleTheme} aria-label={dark ? labels.lightMode : labels.darkMode} title={labels.theme}>{dark ? "☀️" : "🌙"}<span>{dark ? (language === "fr" ? "Clair" : language === "pt" ? "Claro" : language === "es" ? "Claro" : "Light") : (language === "fr" ? "Sombre" : language === "pt" ? "Escuro" : language === "es" ? "Oscuro" : "Dark")}</span></button>
            <button className="menu-close" type="button" onClick={closeMenu}>{labels.close} ×</button>
          </div>
        </div>
        <nav aria-label={labels.mainNav}>
          <Link to="/" onClick={closeMenu}>{labels.home}</Link>
          <Link to="/#formations" onClick={closeMenu}>{labels.catalog}</Link>
          {session && <Link to="/candidature" onClick={closeMenu}>{labels.calendar}</Link>}
          {session ? <Link to="/compte" onClick={closeMenu}>{labels.logout}</Link> : <Link to="/connexion" onClick={closeMenu}>{labels.login} ↗</Link>}
          {profile?.role === "admin" && <Link to="/admin" onClick={closeMenu}>{pagesText[language].menuAdmin}</Link>}
          {profile?.role === "teacher" && <Link to="/enseignant" onClick={closeMenu}>{pagesText[language].menuTeacher}</Link>}
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
        <div className="public-menu-footer">
          <span>🧬 NEXUS SCIENCE</span>
          <small>{language === "fr" ? "Apprendre · Comprendre · Progresser" : language === "pt" ? "Aprender · Compreender · Progredir" : language === "es" ? "Aprender · Comprender · Progresar" : "Learn · Understand · Progress"}</small>
        </div>
        </aside>
      </>}
    </header>
  );
}
export default function App() {
  const location = useLocation();
  const { session, profile } = useAuth();
  const studentArea = location.pathname.startsWith("/espace-etudiant");
  const [language, setLanguage] = useState<Language>(() => { const saved = window.localStorage.getItem("nexus-language"); return saved === "en" || saved === "pt" || saved === "es" ? saved : "fr"; });
  setActiveLanguage(language); // lu par les messages d'erreur hors composants
  const changeLanguage = (value: Language) => { window.localStorage.setItem("nexus-language", value); setLanguage(value); if (session) void supabase.from("profiles").update({ preferred_language: value }).eq("id", session.user.id); };
  useEffect(() => { const preferred = profile?.preferred_language; if (preferred === "fr" || preferred === "en" || preferred === "pt" || preferred === "es") { setLanguage(preferred); window.localStorage.setItem("nexus-language", preferred); } }, [profile?.preferred_language]);
  const [dark, setDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [search, setSearch] = useState("");
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  return (
    <LanguageContext.Provider value={language}>
      <LanguageSetterContext.Provider value={changeLanguage}>
      {!studentArea && <><a href="#contenu" className="skip">{pagesText[language].skip}</a><Header language={language} setLanguage={changeLanguage} dark={dark} toggleTheme={() => setDark(value => !value)} search={search} setSearch={setSearch} /></>}
      <main id="contenu">
        {!supabaseConfigured && <div className="wrap"><p className="notice error" role="alert">{pagesText[language].notConfigured}</p></div>}
        <Routes>
          <Route path="/" element={<Home language={language} search={search} />} />
          <Route path="/cours/:id" element={<CoursePage language={language} />} />
          <Route path="/connexion" element={<AuthPage mode="login" />} />
          <Route path="/inscription" element={<AuthPage mode="register" />} />
          <Route path="/mot-de-passe-oublie" element={<AuthPage mode="reset" />} />
          <Route path="/compte" element={<Account />} />
          <Route path="/candidature" element={<CandidateApplicationPage />} />
          <Route path="/espace-etudiant" element={<StudentDashboard />} />
          <Route path="/enseignant/invitation" element={<TeacherInvitation />} />
          <Route path="/enseignant" element={<TeacherDashboard />} />
          <Route path="/enseignant/cours/:id" element={<TeacherCourse />} />
          <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
            <Route index element={<AdminDashboard />} />
            <Route path="candidatures" element={<AdminApplications />} />
            <Route path="formations" element={<CoursesRoute />} />
            <Route path="eleves" element={<StudentsRoute />} />
            <Route path="enseignants" element={<AdminTeachers />} />
            <Route path="evaluations" element={<AdminAssessments />} />
            <Route path="utilisateurs" element={<AdminUsers />} />
            <Route path="calendrier" element={<AdminCalendar />} />
            <Route path="accueil" element={<AdminHomepage />} />
          </Route>
          <Route path="*" element={<section className="wrap page"><h1>{pagesText[language].notFound}</h1><p><Link to="/">{pagesText[language].backToHome}</Link></p></section>} />
        </Routes>
      </main>
      {!studentArea && <footer className="site-footer"><div className="wrap footer-brand"><strong>🧬 NEXUS SCIENCE</strong><span>{pagesText[language].footer1}</span><span>{pagesText[language].footer2}</span></div></footer>}
      </LanguageSetterContext.Provider>
    </LanguageContext.Provider>
  );
}
