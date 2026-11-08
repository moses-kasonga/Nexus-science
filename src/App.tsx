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

function Header() {
  const { session, profile } = useAuth();
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link to="/" className="brand" aria-label="Nexus science, accueil">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><circle cx="16" cy="16" r="3.2" fill="currentColor" /><ellipse cx="16" cy="16" rx="13" ry="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><ellipse cx="16" cy="16" rx="13" ry="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" transform="rotate(60 16 16)" /><ellipse cx="16" cy="16" rx="13" ry="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" transform="rotate(120 16 16)" /></svg>
          <span>Nexus <em>science</em></span>
        </Link>
        <nav aria-label="Navigation principale" className="nav">
          <NavLink to="/" end>Cours</NavLink>
          {session && profile?.role === "admin" && <NavLink to="/admin">Administration</NavLink>}
          {session ? <NavLink to="/compte" className="nav-cta">{displayName(profile, session.user.email)}</NavLink> : <NavLink to="/connexion" className="nav-cta">Se connecter</NavLink>}
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <a href="#contenu" className="skip">Aller au contenu</a>
      <Header />
      <main id="contenu">
        {!supabaseConfigured && <div className="wrap"><p className="notice error" role="alert">La connexion à la base de données n'est pas configurée (variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY).</p></div>}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cours/:id" element={<CoursePage />} />
          <Route path="/connexion" element={<AuthPage mode="login" />} />
          <Route path="/inscription" element={<AuthPage mode="register" />} />
          <Route path="/compte" element={<Account />} />
          <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
            <Route index element={<AdminDashboard />} />
          </Route>
          <Route path="*" element={<section className="wrap page"><h1>Page introuvable</h1><p><Link to="/">Retour aux cours</Link></p></section>} />
        </Routes>
      </main>
      <footer className="site-footer"><div className="wrap">Nexus science · apprendre les sciences, pas à pas.</div></footer>
    </>
  );
}
