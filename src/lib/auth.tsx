import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "student" | "teacher" | "admin";
export type Profile = { id: string; first_name: string | null; last_name: string | null; email: string | null; role: Role; preferred_language?: "fr" | "en" | "pt" | "es" };

type ProfileLoadIssue = { kind: "query_failed" | "not_found"; code?: string; status?: number };
type AuthState = { session: Session | null; profile: Profile | null; profileIssue: ProfileLoadIssue | null; loading: boolean; signOut: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

export const roleLabel: Record<Role, string> = { student: "Élève", teacher: "Enseignant", admin: "Administrateur" };

export function displayName(profile: Profile | null, fallbackEmail?: string | null): string {
  const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return full || profile?.email || fallbackEmail || "Mon compte";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileIssue, setProfileIssue] = useState<ProfileLoadIssue | null>(null);
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
    let active = true;
    setProfile(null);
    setProfileIssue(null);
    if (!userId) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    const loadProfile = async () => {
      try {
        let result = await supabase.from("profiles").select("id, first_name, last_name, email, role, preferred_language").eq("id", userId).maybeSingle();
        // Compatibilité temporaire tant que la migration de préférence linguistique n'est pas appliquée.
        if (result.error && (result.error.code === "42703" || result.error.code === "PGRST204")) {
          result = await supabase.from("profiles").select("id, first_name, last_name, email, role").eq("id", userId).maybeSingle();
        }
        if (!active) return;
        if (result.error) {
          setProfile(null);
          setProfileIssue({ kind: "query_failed", code: result.error.code || "unknown", status: result.error.status });
        } else if (!result.data) {
          setProfile(null);
          setProfileIssue({ kind: "not_found" });
        } else if (result.data.id !== userId) {
          setProfile(null);
          setProfileIssue({ kind: "query_failed", code: "profile_user_mismatch" });
        } else {
          setProfile(result.data as Profile);
          setProfileIssue(null);
        }
      } catch {
        if (active) {
          setProfile(null);
          setProfileIssue({ kind: "query_failed", code: "unexpected_error" });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProfile();
    return () => { active = false; };
  }, [userId]);

  const value = useMemo<AuthState>(() => ({ session, profile, profileIssue, loading, signOut: async () => { await supabase.auth.signOut(); } }), [session, profile, profileIssue, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return value;
}
