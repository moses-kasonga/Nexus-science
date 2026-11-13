import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { adminMessages } from "../../lib/adminMessages";

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const t = useT(adminMessages);

  if (loading) {
    return <section className="wrap page"><p className="muted" role="status">{t.checkingAccess}</p></section>;
  }

  if (!session) return <Navigate to="/connexion" replace />;
  if (profile?.role !== "admin") return <Navigate to="/" replace />;

  return <>{children}</>;
}
