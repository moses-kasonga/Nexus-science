import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/i18n";
import { supabase } from "../lib/supabase";

type Message = { id: string; subject: string; body: string; sender_role: "student" | "admin"; reply_to_id: string | null; email_sent_at: string | null; created_at: string };

export default function StudentFeedback() {
  const { session } = useAuth();
  const language = useLanguage();
  const t = {
    fr: { title:"Contacter l'administration", intro:"Une question, une difficulté ou une suggestion ? Écris à l'équipe NEXUS SCIENCE. Tu retrouveras ici les réponses.", subject:"Objet", subjectPh:"Résume ta demande", body:"Ton message", bodyPh:"Explique-nous clairement ta demande…", send:"Envoyer le feedback", sending:"Envoi…", history:"Mes échanges", empty:"Aucun message pour le moment.", sent:"Ton message a bien été transmis à l'administration.", error:"Impossible d'envoyer le message.", admin:"Administration", you:"Vous", loading:"Chargement des échanges…", date:"Envoyé le" },
    en: { title:"Contact the administration", intro:"Have a question, issue or suggestion? Write to the NEXUS SCIENCE team. Replies will appear here.", subject:"Subject", subjectPh:"Summarise your request", body:"Your message", bodyPh:"Explain your request clearly…", send:"Send feedback", sending:"Sending…", history:"My messages", empty:"No messages yet.", sent:"Your message was sent to the administration.", error:"Unable to send the message.", admin:"Administration", you:"You", loading:"Loading messages…", date:"Sent on" },
    pt: { title:"Contactar a administração", intro:"Tem uma dúvida, dificuldade ou sugestão? Escreva à equipa NEXUS SCIENCE. As respostas aparecerão aqui.", subject:"Assunto", subjectPh:"Resuma o seu pedido", body:"A sua mensagem", bodyPh:"Explique claramente o seu pedido…", send:"Enviar feedback", sending:"A enviar…", history:"As minhas mensagens", empty:"Ainda não há mensagens.", sent:"A mensagem foi enviada à administração.", error:"Não foi possível enviar a mensagem.", admin:"Administração", you:"Você", loading:"A carregar mensagens…", date:"Enviado em" },
    es: { title:"Contactar con la administración", intro:"¿Tienes una pregunta, dificultad o sugerencia? Escribe al equipo de NEXUS SCIENCE. Las respuestas aparecerán aquí.", subject:"Asunto", subjectPh:"Resume tu solicitud", body:"Tu mensaje", bodyPh:"Explica claramente tu solicitud…", send:"Enviar comentarios", sending:"Enviando…", history:"Mis mensajes", empty:"Todavía no hay mensajes.", sent:"Tu mensaje se ha enviado a la administración.", error:"No se pudo enviar el mensaje.", admin:"Administración", you:"Tú", loading:"Cargando mensajes…", date:"Enviado el" },
  }[language];
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("");
  const [messages,setMessages]=useState<Message[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function refresh() {
    if (!session?.user.id) return;
    setLoading(true);
    const {data,error:failure}=await supabase.from("feedback_messages").select("id,subject,body,sender_role,reply_to_id,email_sent_at,created_at").eq("student_id",session.user.id).order("created_at",{ascending:true});
    if(failure) setError(failure.message);
    else setMessages((data??[]) as Message[]);
    setLoading(false);
  }
  useEffect(()=>{void refresh();},[session?.user.id]);

  async function submit(event:FormEvent) {
    event.preventDefault(); if(!session?.user.id) return;
    setBusy(true);setError("");setNotice("");
    const {error:failure}=await supabase.from("feedback_messages").insert({
      student_id:session.user.id,sender_id:session.user.id,sender_role:"student",
      subject:subject.trim(),body:body.trim(),reply_to_id:null,
    });
    setBusy(false);
    if(failure){setError(failure.message);return;}
    setSubject("");setBody("");setNotice(t.sent);await refresh();
  }

  return <section className="student-section feedback-student" aria-labelledby="student-feedback-title">
    <p className="student-kicker">NEXUS SCIENCE</p><h2 id="student-feedback-title">{t.title}</h2><p className="student-muted">{t.intro}</p>
    <form className="feedback-form" onSubmit={submit}>
      <label>{t.subject}<input value={subject} onChange={e=>setSubject(e.target.value)} minLength={3} maxLength={160} required placeholder={t.subjectPh}/></label>
      <label>{t.body}<textarea value={body} onChange={e=>setBody(e.target.value)} minLength={3} maxLength={10000} rows={5} required placeholder={t.bodyPh}/></label>
      {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice ok" role="status">{notice}</p>}
      <button className="student-button" type="submit" disabled={busy}>{busy?t.sending:t.send}</button>
    </form>
    <div className="feedback-history"><h3>{t.history}</h3>
      {loading&&<p className="student-muted">{t.loading}</p>}
      {!loading&&messages.length===0&&<p className="student-muted">{t.empty}</p>}
      {messages.filter(m=>!m.reply_to_id).map(message=><article className="feedback-thread" key={message.id}>
        <div className="feedback-thread-heading"><strong>{message.subject}</strong><small>{t.date} {new Date(message.created_at).toLocaleString()}</small></div>
        <p className="feedback-message feedback-message-student"><strong>{t.you}</strong>{message.body}</p>
        {messages.filter(reply=>reply.reply_to_id===message.id).map(reply=><p className="feedback-message feedback-message-admin" key={reply.id}><strong>{t.admin}</strong>{reply.body}<small>{reply.email_sent_at? "E-mail envoyé · ":""}{new Date(reply.created_at).toLocaleString()}</small></p>)}
      </article>)}
    </div>
  </section>;
}
