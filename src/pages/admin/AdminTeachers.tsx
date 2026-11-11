import { useCallback, useEffect, useState, type FormEvent } from "react";
import { approveApplication, createInvitation, listApplications, listInvitations, listPeople, personName, rejectApplication, revokeInvitation, type ApplicationRow, type InvitationRow, type PersonRow } from "../../lib/adminData";
import { Feedback, dateTimeLabel, errorText } from "./shared";
import { useT } from "../../lib/i18n";

function invitationState(item: InvitationRow, now = Date.now()): "used" | "cancelled" | "expired" | "active" {
  if (item.used_at) return "used";
  if (item.revoked_at) return "cancelled";
  if (new Date(item.expires_at).getTime() < now) return "expired";
  return "active";
}

export default function AdminTeachers() {
  const t = useT({
    fr:{title:"Enseignants",invite:"Inviter un enseignant",linkInfo:"{t.linkInfo}",email:"Adresse e-mail de l'enseignant",create:"Créer le lien",linkFor:"Lien pour",validUntil:"valable jusqu'au",invitationLink:"Lien d'invitation",copy:"Copier le lien",copied:"Lien copié.",copyFail:"Copie impossible : sélectionnez le lien et copiez-le à la main.",hide:"Masquer",sendInfo:"{t.sendInfo}",recent:"Invitations récentes",loading:"Chargement…",noInvites:"{t.noInvites}",created:"Créée le",cancel:"Annuler",cancelledNotice:t.cancelledNotice,pending:"Candidatures à examiner",noPending:"{t.noPending}",received:"reçue le",specialty:"Spécialité",qualifications:"Qualifications",experience:"Expérience",motivation:"Motivation",rejectReason:"Motif du refus (facultatif)",reject:"Refuser",confirmReject:"Refuser cette candidature ?",rejected:"Candidature refusée.",approve:"Approuver",confirmApprove:"Approuver {name} comme enseignant ?",approved:"Candidature approuvée : le compte est maintenant enseignant.",handled:"Candidatures traitées",used:"Utilisée",expired:"Expirée",active:"Active",statusCancelled:"Annulée",approvedStatus:"Approuvée",rejectedStatus:"Refusée"},
    en:{title:"Teachers",invite:"Invite a teacher",linkInfo:"This personal link only works for the invited email address, can be used once, and expires after 12 hours. It is displayed only once, immediately after creation.",email:"Teacher email address",create:"Create invitation link",linkFor:"Invitation link for",validUntil:"valid until",invitationLink:"Invitation link",copy:"Copy link",copied:"Link copied.",copyFail:"Unable to copy: select the link and copy it manually.",hide:"Hide",sendInfo:"Send it yourself (WhatsApp, email). Once hidden, it cannot be displayed again; create a new one if needed.",recent:"Recent invitations",loading:"Loading…",noInvites:"No invitations yet.",created:"Created",cancel:"Cancel",cancelledNotice:"Invitation cancelled.",pending:"Applications to review",noPending:"No pending applications.",received:"received",specialty:"Specialty",qualifications:"Qualifications",experience:"Experience",motivation:"Motivation",rejectReason:"Reason for rejection (optional)",reject:"Reject",confirmReject:"Reject this application?",rejected:"Application rejected.",approve:"Approve",confirmApprove:"Approve {name} as a teacher?",approved:"Application approved: this account is now a teacher.",handled:"Processed applications",used:"Used",expired:"Expired",active:"Active",statusCancelled:"Cancelled",approvedStatus:"Approved",rejectedStatus:"Rejected"},
    pt:{title:"Professores",invite:"Convidar um professor",linkInfo:"Este link é pessoal: só funciona com o endereço de e-mail convidado, pode ser usado uma vez e expira após 12 horas. É apresentado apenas uma vez, logo após a criação.",email:"E-mail do professor",create:"Criar link",linkFor:"Link para",validUntil:"válido até",invitationLink:"Link de convite",copy:"Copiar link",copied:"Link copiado.",copyFail:"Não foi possível copiar: selecione o link e copie manualmente.",hide:"Ocultar",sendInfo:"Envie-o diretamente (WhatsApp, e-mail). Depois de ocultado, não poderá voltar a ser apresentado; crie outro se necessário.",recent:"Convites recentes",loading:"A carregar…",noInvites:"Ainda não há convites.",created:"Criado em",cancel:"Cancelar",cancelledNotice:"Convite cancelado.",pending:"Candidaturas para analisar",noPending:"Não há candidaturas pendentes.",received:"recebida em",specialty:"Especialidade",qualifications:"Qualificações",experience:"Experiência",motivation:"Motivação",rejectReason:"Motivo da recusa (opcional)",reject:"Recusar",confirmReject:"Recusar esta candidatura?",rejected:"Candidatura recusada.",approve:"Aprovar",confirmApprove:"Aprovar {name} como professor?",approved:"Candidatura aprovada: a conta é agora de professor.",handled:"Candidaturas tratadas",used:"Utilizado",expired:"Expirado",active:"Ativo",statusCancelled:"Cancelado",approvedStatus:"Aprovada",rejectedStatus:"Recusada"},
    es:{title:"Profesores",invite:"Invitar a un profesor",linkInfo:"Este enlace es personal: solo funciona con el correo invitado, se puede usar una vez y caduca después de 12 horas. Se muestra una sola vez, justo después de crearlo.",email:"Correo electrónico del profesor",create:"Crear enlace",linkFor:"Enlace para",validUntil:"válido hasta",invitationLink:"Enlace de invitación",copy:"Copiar enlace",copied:"Enlace copiado.",copyFail:"No se pudo copiar: selecciona el enlace y cópialo manualmente.",hide:"Ocultar",sendInfo:"Envíalo directamente (WhatsApp, correo). Una vez oculto, no podrá volver a mostrarse; crea uno nuevo si es necesario.",recent:"Invitaciones recientes",loading:"Cargando…",noInvites:"Todavía no hay invitaciones.",created:"Creada el",cancel:"Cancelar",cancelledNotice:"Invitación cancelada.",pending:"Solicitudes por revisar",noPending:"No hay solicitudes pendientes.",received:"recibida el",specialty:"Especialidad",qualifications:"Cualificaciones",experience:"Experiencia",motivation:"Motivación",rejectReason:"Motivo del rechazo (opcional)",reject:"Rechazar",confirmReject:"¿Rechazar esta solicitud?",rejected:"Solicitud rechazada.",approve:"Aprobar",confirmApprove:"¿Aprobar a {name} como profesor?",approved:"Solicitud aprobada: esta cuenta ahora es de profesor.",handled:"Solicitudes procesadas",used:"Utilizada",expired:"Caducada",active:"Activa",statusCancelled:"Cancelada",approvedStatus:"Aprobada",rejectedStatus:"Rechazada"}
  });
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
    try { await navigator.clipboard.writeText(text); setNotice(t.copied); } catch { setNotice(t.copyFail); }
  }

  const byId = new Map(people.map((person) => [person.id, person]));
  const pending = (applications ?? []).filter((item) => item.status === "pending");
  const handled = (applications ?? []).filter((item) => item.status !== "pending");

  return (
    <div>
      <h2>{t.title}</h2>
      <Feedback error={error} notice={notice} />

      <h3>{t.invite}</h3>
      <p className="muted">Le lien est personnel : il ne fonctionne qu'avec l'adresse invitée, une seule fois, pendant 12 heures. Il n'est affiché qu'une fois, juste après sa création.</p>
      <form className="inline-form" onSubmit={invite}>
        <label>{t.email}<input type="email" name="email" required autoComplete="off" /></label>
        <button className="btn small" type="submit" disabled={busy}>{t.create}</button>
      </form>
      {link && (
        <div className="panel">
          <p><strong>{t.linkFor} {link.email}</strong> ({t.validUntil} {dateTimeLabel(link.expiresAt)})</p>
          <input readOnly value={link.url} aria-label={t.invitationLink} onFocus={(event) => event.currentTarget.select()} />
          <div className="row"><button className="btn small" onClick={() => void copy(link.url)}>{t.copy}</button><button className="btn small" onClick={() => setLink(null)}>{t.hide}</button></div>
          <p className="muted small-text">Envoyez-le vous-même (WhatsApp, e-mail). Une fois masqué, il ne pourra plus être affiché : créez-en un nouveau si besoin.</p>
        </div>
      )}

      <h3>{t.recent}</h3>
      {invitations === null && <p className="muted" role="status">{t.loading}</p>}
      {invitations?.length === 0 && <p className="notice">Aucune invitation pour le moment.</p>}
      <ul className="stack tight">
        {invitations?.map((item) => {
          const state = invitationState(item);
          return (
            <li key={item.id} className="panel row between">
              <span>{item.email} <span className={`pill ${state.active ? "ongoing" : "past"}`}>{state === "used" ? t.used : state === "cancelled" ? t.statusCancelled : state === "expired" ? t.expired : t.active}</span><br /><span className="muted small-text">{t.created} {dateTimeLabel(item.created_at)}</span></span>
              {state.active && <button className="btn small danger" disabled={busy} onClick={() => void run(() => revokeInvitation(item.id), "Invitation annulée.")}>{t.cancel}</button>}
            </li>
          );
        })}
      </ul>

      <h3>{t.pending}</h3>
      {applications === null && <p className="muted" role="status">Chargement…</p>}
      {applications && pending.length === 0 && <p className="notice">Aucune candidature en attente.</p>}
      <ul className="stack">
        {pending.map((item) => (
          <li key={item.id} className="panel">
            <h4>{personName(byId.get(item.user_id))}</h4>
            <p className="muted small-text">{byId.get(item.user_id)?.email} · {t.received} {dateTimeLabel(item.created_at)}</p>
            <dl className="facts compact">
              {item.specialty && <div><dt>{t.specialty}</dt><dd>{item.specialty}</dd></div>}
              {item.qualifications && <div><dt>{t.qualifications}</dt><dd>{item.qualifications}</dd></div>}
              {item.experience && <div><dt>{t.experience}</dt><dd>{item.experience}</dd></div>}
              {item.motivation && <div><dt>{t.motivation}</dt><dd>{item.motivation}</dd></div>}
            </dl>
            <form className="inline-form" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") ?? ""); if (window.confirm(t.confirmReject)) void run(() => rejectApplication(item.id, reason), t.rejected); }}>
              <label>{t.rejectReason}<input name="reason" maxLength={300} /></label>
              <button className="btn small danger" type="submit" disabled={busy}>{t.reject}</button>
            </form>
            <div className="row"><button className="btn primary small" disabled={busy} onClick={() => { if (window.confirm(t.confirmApprove.replace("{name}", personName(byId.get(item.user_id))))) void run(() => approveApplication(item.id), t.approved); }}>{t.approve}</button></div>
          </li>
        ))}
      </ul>

      {handled.length > 0 && (
        <>
          <h3>{t.handled}</h3>
          <ul className="stack tight">
            {handled.map((item) => <li key={item.id} className="panel row between"><span>{personName(byId.get(item.user_id))}</span><span className={`pill ${item.status === "approved" ? "ongoing" : "past"}`}>{item.status === "approved" ? t.approvedStatus : t.rejectedStatus}</span></li>)}
          </ul>
        </>
      )}
    </div>
  );
}
