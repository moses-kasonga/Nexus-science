import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "student" | "teacher" | "admin";
export type Profile = { id: string; first_name: string | null; last_name: string | null; email: string | null; role: Role; preferred_language: "fr" | "en" | "pt" | "es" };

type AuthState = { session: Session | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

export const roleLabel: Record<Role, string> = { student: "Élève", teacher: "Enseignant", admin: "Administrateur" };

export function displayName(profile: Profile | null, fallbackEmail?: string | null): string {
  const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return full || profile?.email || fallbackEmail || "Mon compte";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) { setProfile(null); setLoading(false); }
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    supabase.from("profiles").select("id, first_name, last_name, email, role, preferred_language").eq("id", userId).maybeSingle()
      .then(({ data }) => { if (active) { setProfile((data as Profile | null) ?? null); setLoading(false); } });
    return () => { active = false; };
  }, [userId]);

  const value = useMemo<AuthState>(() => ({ session, profile, loading, signOut: async () => { await supabase.auth.signOut(); } }), [session, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return value;
}
