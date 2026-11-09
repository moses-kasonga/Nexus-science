// Garde le lien d'invitation enseignant pendant la connexion ou l'inscription, pour que la candidature ne soit pas perdue.
const KEY = "nexus:invitation-enseignant";

/** N'accepte qu'un chemin interne du site (jamais une adresse externe). */
export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

export function rememberInvitation(path: string): void {
  try { localStorage.setItem(KEY, path); } catch { /* stockage indisponible : le lien reste utilisable à la main */ }
}
export function pendingInvitation(): string | null {
  try { return safeReturnPath(localStorage.getItem(KEY)); } catch { return null; }
}
export function forgetInvitation(): void {
  try { localStorage.removeItem(KEY); } catch { /* sans effet */ }
}
