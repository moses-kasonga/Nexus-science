import { useCallback, useEffect, useState, type FormEvent } from "react";
import { approveApplication, createInvitation, listApplications, listInvitations, listPeople, personName, rejectApplication, revokeInvitation, type ApplicationRow, type InvitationRow, type PersonRow } from "../../lib/adminData";
import { Feedback, dateTimeLabel, errorText } from "./shared";

function invitationState(item: InvitationRow, now = Date.now()): { label: string; active: boolean } {
  if (item.used_at) return { label: "Utilisée", active: false };
  if (item.revoked_at) return { label: "Annulée", active: false };
  if (new Date(item.expires_at).getTime() < now) return { label: "Expirée", active: false };
  return { label: "Active", active: true };
}

export default function AdminTeachers() {
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null);
  const [applications, setApplications] = useState<ApplicationRow[] | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState<{ url: string; email: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [inv, apps, accounts] = await Promise.all([listInvitations(), listApplications(), listPeople()]);
      setInvitations(inv); setApplications(apps); setPeople(accounts);
    } catch (cause) { setError(errorText(cause)); setInvitations((c) => c ?? []); setApplications((c) => c ?? []); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function run(action: () => Promise<void>, done?: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); if (done) setNotice(done); await reload(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    void run(async () => {
      const created = await createInvitation(email);
      setLink({ url: `${window.location.origin}/enseignant/invitation?token=${encodeURIComponent(created.token)}`, email: created.email, expiresAt: created.expiresAt });
      form.reset();
    });
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice("Lien copié."); } catch { setNotice("Copie impossible : sélectionnez le lien et copiez-le à la main."); }
  }

  const byId = new Map(people.map((person) => [person.id, person]));
  const pending = (applications ?? []).filter((item) => item.status === "pending");
  const handled = (applications ?? []).filter((item) => item.status !== "pending");

  return (
    <div>
      <h2>Enseignants</h2>
      <Feedback error={error} notice={notice} />

      <h3>Inviter un enseignant</h3>
      <p className="muted">Le lien est personnel : il ne fonctionne qu'avec l'adresse invitée, une seule fois, pendant 12 heures. Il n'est affiché qu'une fois, juste après sa création.</p>
      <form className="inline-form" onSubmit={invite}>
        <label>Adresse e-mail de l'enseignant<input type="email" name="email" required autoComplete="off" /></label>
        <button className="btn small" type="submit" disabled={busy}>Créer le lien</button>
      </form>
      {link && (
        <div className="panel">
          <p><strong>Lien pour {link.email}</strong> (valable jusqu'au {dateTimeLabel(link.expiresAt)})</p>
          <input readOnly value={link.url} aria-label="Lien d'invitation" onFocus={(event) => event.currentTarget.select()} />
          <div className="row"><button className="btn small" onClick={() => void copy(link.url)}>Copier le lien</button><button className="btn small" onClick={() => setLink(null)}>Masquer</button></div>
          <p className="muted small-text">Envoyez-le vous-même (WhatsApp, e-mail). Une fois masqué, il ne pourra plus être affiché : créez-en un nouveau si besoin.</p>
        </div>
      )}

      <h3>Invitations récentes</h3>
      {invitations === null && <p className="muted" role="status">Chargement…</p>}
      {invitations?.length === 0 && <p className="notice">Aucune invitation pour le moment.</p>}
      <ul className="stack tight">
        {invitations?.map((item) => {
          const state = invitationState(item);
          return (
            <li key={item.id} className="panel row between">
              <span>{item.email} <span className={`pill ${state.active ? "ongoing" : "past"}`}>{state.label}</span><br /><span className="muted small-text">Créée le {dateTimeLabel(item.created_at)}</span></span>
              {state.active && <button className="btn small danger" disabled={busy} onClick={() => void run(() => revokeInvitation(item.id), "Invitation annulée.")}>Annuler</button>}
            </li>
          );
        })}
      </ul>

      <h3>Candidatures à examiner</h3>
      {applications === null && <p className="muted" role="status">Chargement…</p>}
      {applications && pending.length === 0 && <p className="notice">Aucune candidature en attente.</p>}
      <ul className="stack">
        {pending.map((item) => (
          <li key={item.id} className="panel">
            <h4>{personName(byId.get(item.user_id))}</h4>
            <p className="muted small-text">{byId.get(item.user_id)?.email} · reçue le {dateTimeLabel(item.created_at)}</p>
            <dl className="facts compact">
              {item.specialty && <div><dt>Spécialité</dt><dd>{item.specialty}</dd></div>}
              {item.qualifications && <div><dt>Qualifications</dt><dd>{item.qualifications}</dd></div>}
              {item.experience && <div><dt>Expérience</dt><dd>{item.experience}</dd></div>}
              {item.motivation && <div><dt>Motivation</dt><dd>{item.motivation}</dd></div>}
            </dl>
            <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") ?? ""); if (window.confirm("Refuser cette candidature ?")) void run(() => rejectApplication(item.id, reason), "Candidature refusée."); }}>
              <label>Motif du refus (facultatif)<input name="reason" maxLength={300} /></label>
              <button className="btn small danger" type="submit" disabled={busy}>Refuser</button>
            </form>
            <div className="row"><button className="btn primary small" disabled={busy} onClick={() => { if (window.confirm(`Approuver ${personName(byId.get(item.user_id))} comme enseignant ?`)) void run(() => approveApplication(item.id), "Candidature approuvée : le compte est maintenant enseignant."); }}>Approuver</button></div>
          </li>
        ))}
      </ul>

      {handled.length > 0 && (
        <>
          <h3>Candidatures traitées</h3>
          <ul className="stack tight">
            {handled.map((item) => <li key={item.id} className="panel row between"><span>{personName(byId.get(item.user_id))}</span><span className={`pill ${item.status === "approved" ? "ongoing" : "past"}`}>{item.status === "approved" ? "Approuvée" : "Refusée"}</span></li>)}
          </ul>
        </>
      )}
    </div>
  );
}
