import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminSmtpTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; message?: string; recipient?: string; checkedAt?: string; error?: string } | null>(null);

  async function runTest() {
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-gmail-smtp", { body: {} });
      if (error) {
        setResult({ error: error.message || "La requête a échoué. Consultez les journaux Supabase." });
      } else if (data?.error) {
        setResult({ error: data.error });
      } else {
        setResult(data);
      }
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Erreur inattendue." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-feedback-page">
    <h2>Test Gmail SMTP</h2>
    <p className="muted">Outil temporaire réservé à l’administration. Il envoie un seul e-mail de vérification à l’adresse Gmail configurée dans les secrets SMTP. Aucun message d’élève n’est envoyé et aucune donnée de feedback n’est modifiée.</p>
    <button className="btn primary" type="button" disabled={busy} onClick={() => void runTest()}>
      {busy ? "Vérification en cours…" : "Lancer le test SMTP"}
    </button>
    {result?.ok && <div className="notice success" role="status">
      <strong>Test accepté par Gmail.</strong>
      <p>{result.message}</p>
      <p>Destinataire : {result.recipient}</p>
      <p>Date : {result.checkedAt ? new Date(result.checkedAt).toLocaleString() : "—"}</p>
      <p>Vérifie maintenant la boîte de réception et le dossier Spam.</p>
    </div>}
    {result?.error && <div className="notice error" role="alert">
      <strong>Échec du test SMTP</strong>
      <p>{result.error}</p>
      <p>Consulte les journaux de la fonction test-gmail-smtp dans Supabase pour le détail serveur.</p>
    </div>}
  </section>;
}
