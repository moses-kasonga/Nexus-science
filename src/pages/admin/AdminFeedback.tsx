import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useT } from "../../lib/i18n";
import { Feedback } from "./shared";

type Message = { id:string; student_id:string; sender_id:string; sender_role:"student"|"admin"; subject:string; body:string; reply_to_id:string|null; email_sent_at:string|null; created_at:string };
type Person = { id:string; first_name:string|null; last_name:string|null; email:string|null };

export default function AdminFeedback() {
  const t=useT({
    fr:{title:"Feedback des élèves",intro:"Consulte les messages reçus, prépare une réponse et vérifie l'e-mail avant de l'envoyer.",loading:"Chargement…",empty:"Aucun feedback reçu.",student:"Élève",received:"Reçu le",reply:"Préparer une réponse",subject:"Objet de l'e-mail",body:"Réponse",subjectPh:"Objet de votre réponse",bodyPh:"Rédigez votre réponse à l'élève…",preview:"Prévisualiser l'e-mail",previewTitle:"Prévisualisation avant envoi",to:"Destinataire",send:"Confirmer et envoyer l'e-mail",sending:"Envoi…",edit:"Modifier",cancel:"Annuler",sent:"E-mail envoyé et réponse enregistrée.",noEmail:"Adresse e-mail indisponible.",history:"Historique de l'échange",studentMessage:"Message de l'élève",admin:"Administration",emailSent:"E-mail envoyé",notSent:"Pas encore répondu",errorConfig:"L'envoi d'e-mails doit être configuré côté serveur avant utilisation."},
    en:{title:"Student feedback",intro:"Read incoming messages, prepare a reply and review the exact email before sending.",loading:"Loading…",empty:"No feedback received.",student:"Student",received:"Received",reply:"Prepare a reply",subject:"Email subject",body:"Reply",subjectPh:"Subject of your reply",bodyPh:"Write your reply to the student…",preview:"Preview email",previewTitle:"Preview before sending",to:"Recipient",send:"Confirm and send email",sending:"Sending…",edit:"Edit",cancel:"Cancel",sent:"Email sent and reply saved.",noEmail:"Email address unavailable.",history:"Conversation history",studentMessage:"Student message",admin:"Administration",emailSent:"Email sent",notSent:"Not yet answered",errorConfig:"Email sending must be configured server-side before use."},
    pt:{title:"Feedback dos alunos",intro:"Consulte as mensagens, prepare uma resposta e reveja o e-mail antes de enviar.",loading:"A carregar…",empty:"Nenhum feedback recebido.",student:"Aluno",received:"Recebido em",reply:"Preparar resposta",subject:"Assunto do e-mail",body:"Resposta",subjectPh:"Assunto da resposta",bodyPh:"Escreva a resposta ao aluno…",preview:"Pré-visualizar e-mail",previewTitle:"Pré-visualização antes do envio",to:"Destinatário",send:"Confirmar e enviar e-mail",sending:"A enviar…",edit:"Editar",cancel:"Cancelar",sent:"E-mail enviado e resposta guardada.",noEmail:"Endereço de e-mail indisponível.",history:"Histórico da conversa",studentMessage:"Mensagem do aluno",admin:"Administração",emailSent:"E-mail enviado",notSent:"Ainda sem resposta",errorConfig:"O envio de e-mails deve ser configurado no servidor antes da utilização."},
    es:{title:"Comentarios de los alumnos",intro:"Consulta los mensajes, prepara una respuesta y revisa el correo antes de enviarlo.",loading:"Cargando…",empty:"No hay comentarios.",student:"Alumno",received:"Recibido",reply:"Preparar respuesta",subject:"Asunto del correo",body:"Respuesta",subjectPh:"Asunto de la respuesta",bodyPh:"Escribe tu respuesta al alumno…",preview:"Previsualizar correo",previewTitle:"Vista previa antes del envío",to:"Destinatario",send:"Confirmar y enviar correo",sending:"Enviando…",edit:"Editar",cancel:"Cancelar",sent:"Correo enviado y respuesta guardada.",noEmail:"Dirección de correo no disponible.",history:"Historial de la conversación",studentMessage:"Mensaje del alumno",admin:"Administración",emailSent:"Correo enviado",notSent:"Aún sin respuesta",errorConfig:"El envío de correos debe configurarse en el servidor antes de usarlo."}
  });
  const [messages,setMessages]=useState<Message[]>([]);
  const [people,setPeople]=useState<Record<string,Person>>({});
  const [selected,setSelected]=useState<Message|null>(null);
  const [replies,setReplies]=useState<Message[]>([]);
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("");
  const [preview,setPreview]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);

  async function load() {
    setLoading(true);setError("");
    const {data,error:failure}=await supabase.from("feedback_messages").select("id,student_id,sender_id,sender_role,subject,body,reply_to_id,email_sent_at,created_at").is("reply_to_id",null).order("created_at",{ascending:false});
    if(failure){setError(failure.message);setLoading(false);return;}
    const rows=(data??[]) as Message[];setMessages(rows);
    const ids=[...new Set(rows.map(x=>x.student_id))];
    if(ids.length){const {data:profiles}=await supabase.from("profiles").select("id,first_name,last_name,email").in("id",ids);setPeople(Object.fromEntries(((profiles??[]) as Person[]).map(p=>[p.id,p])));}
    setLoading(false);
  }
  useEffect(()=>{void load();},[]);

  async function selectMessage(message:Message) {
    setSelected(message);setPreview(false);setError("");setNotice("");
    setSubject("Re: "+message.subject);setBody("");
    const {data,error:failure}=await supabase.from("feedback_messages").select("id,student_id,sender_id,sender_role,subject,body,reply_to_id,email_sent_at,created_at").eq("reply_to_id",message.id).order("created_at",{ascending:true});
    if(failure){setError(failure.message);setReplies([]);}else setReplies((data??[]) as Message[]);
  }
  const person=selected?people[selected.student_id]:undefined;
  const studentName=person?[person.first_name,person.last_name].filter(Boolean).join(" ")||person.email||t.student:t.student;
  const alreadyReplied=replies.length>0;
  const lastReply=replies[replies.length-1];
  const selectedReply=useMemo(()=>replies.map(x=>x.id).join(","),[replies]);

  async function send() {
    if(!selected||!person?.email||!subject.trim()||!body.trim())return;
    setBusy(true);setError("");setNotice("");
    const {data,error:failure}=await supabase.functions.invoke("send-feedback-reply",{body:{message_id:selected.id,subject:subject.trim(),body:body.trim()}});
    setBusy(false);
    if(failure){setError(failure.message||t.errorConfig);return;}
    if(data?.error){setError(data.error);return;}
    setPreview(false);setNotice(t.sent);setReplies(old=>[...old,{id:data.reply.id,student_id:selected.student_id,sender_id:"",sender_role:"admin",subject,body,reply_to_id:selected.id,email_sent_at:data.reply.email_sent_at,created_at:data.reply.created_at}]);await load();
  }

  return <section className="admin-feedback-page">
    <h2>{t.title}</h2><p className="muted">{t.intro}</p>
    <Feedback error={error} notice={notice}/>
    {loading&&<p className="muted">{t.loading}</p>}
    {!loading&&messages.length===0&&<p className="notice">{t.empty}</p>}
    <div className="admin-feedback-grid">
      <div className="admin-feedback-inbox">{messages.map(message=>{
        const p=people[message.student_id];const name=p?[p.first_name,p.last_name].filter(Boolean).join(" ")||p.email:t.student;
        return <button type="button" key={message.id} className={"admin-feedback-item"+(selected?.id===message.id?" is-active":"")} onClick={()=>void selectMessage(message)}>
          <strong>{message.subject}</strong><span>{name}</span><small>{new Date(message.created_at).toLocaleString()}</small>
        </button>;
      })}</div>
      {selected&&<div className="admin-feedback-detail">
        <div className="admin-feedback-meta"><span><strong>{studentName}</strong><small>{person?.email||t.noEmail}</small></span><small>{t.received} {new Date(selected.created_at).toLocaleString()}</small></div>
        <h3>{selected.subject}</h3><p className="feedback-message feedback-message-student">{selected.body}</p>
        <h3>{t.history}</h3>
        {replies.map(reply=><p className="feedback-message feedback-message-admin" key={reply.id}>{reply.body}<small>{reply.email_sent_at?t.emailSent:""}</small></p>)}
        {!preview&&<div className="feedback-reply-form">
          <h3>{t.reply}</h3>
          <label>{t.subject}<input value={subject} maxLength={160} onChange={e=>setSubject(e.target.value)}/></label>
          <label>{t.body}<textarea value={body} rows={6} maxLength={10000} onChange={e=>setBody(e.target.value)} placeholder={t.bodyPh}/></label>
          <button className="btn primary" type="button" disabled={!person?.email||!body.trim()||!subject.trim()} onClick={()=>setPreview(true)}>{t.preview}</button>
        </div>}
        {preview&&<section className="feedback-email-preview" aria-label={t.previewTitle}>
          <p className="eyebrow">{t.previewTitle}</p>
          <dl><dt>{t.to}</dt><dd>{person?.email}</dd><dt>{t.subject}</dt><dd>{subject}</dd></dl>
          <div className="feedback-email-body">{body}</div>
          <div className="row">
            <button className="btn" type="button" disabled={busy} onClick={()=>setPreview(false)}>{t.edit}</button>
            <button className="btn" type="button" disabled={busy} onClick={()=>{setPreview(false);setBody("");}}>{t.cancel}</button>
            <button className="btn primary" type="button" disabled={busy} onClick={()=>void send()}>{busy?t.sending:t.send}</button>
          </div>
        </section>}
      </div>}
    </div>
  </section>;
}
