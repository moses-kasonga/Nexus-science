import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <section className="wrap page"><p className="muted" role="status">Vérification des accès…</p></section>;
  }

  if (!session) return <Navigate to="/connexion" replace />;
  if (profile?.role !== "admin") return <Navigate to="/" replace />;

  return <>{children}</>;
}
