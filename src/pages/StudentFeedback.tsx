import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../lib/i18n";

type FeedbackRow = { id:string; category:string; subject:string; message:string; status:"pending"|"replied"; response:string|null; created_at:string; responded_at:string|null };
const dictionaries = {
  fr:{title:"Mon feedback",intro:"Partage une remarque, une difficulté ou une suggestion avec l’administration. Tes échanges restent dans NEXUS SCIENCE.",category:"Catégorie",general:"Question générale",course:"Formation / cours",technical:"Problème technique",suggestion:"Suggestion",other:"Autre",subject:"Objet",message:"Ton message",send:"Envoyer le feedback",sending:"Envoi…",history:"Mes échanges",empty:"Tu n’as pas encore envoyé de feedback.",pending:"En attente de réponse",replied:"Réponse reçue",reply:"Réponse de l’administration",success:"Ton feedback a été transmis à l’administration.",error:"Impossible d’envoyer le feedback.",required:"Renseigne un objet et un message d’au moins 10 caractères.",date:"Envoyé le"},
  en:{title:"My feedback",intro:"Share a comment, difficulty or suggestion with the administration. Your exchanges stay inside NEXUS SCIENCE.",category:"Category",general:"General question",course:"Course",technical:"Technical issue",suggestion:"Suggestion",other:"Other",subject:"Subject",message:"Your message",send:"Send feedback",sending:"Sending…",history:"My conversations",empty:"You have not sent any feedback yet.",pending:"Awaiting a reply",replied:"Reply received",reply:"Administration reply",success:"Your feedback has been sent to the administration.",error:"Could not send feedback.",required:"Enter a subject and a message of at least 10 characters.",date:"Sent on"},
  pt:{title:"O meu feedback",intro:"Partilhe uma observação, dificuldade ou sugestão com a administração. As conversas ficam no NEXUS SCIENCE.",category:"Categoria",general:"Questão geral",course:"Curso",technical:"Problema técnico",suggestion:"Sugestão",other:"Outro",subject:"Assunto",message:"A sua mensagem",send:"Enviar feedback",sending:"A enviar…",history:"As minhas conversas",empty:"Ainda não enviou feedback.",pending:"A aguardar resposta",replied:"Resposta recebida",reply:"Resposta da administração",success:"O seu feedback foi enviado à administração.",error:"Não foi possível enviar o feedback.",required:"Indique um assunto e uma mensagem com pelo menos 10 caracteres.",date:"Enviado em"},
  es:{title:"Mi feedback",intro:"Comparte un comentario, dificultad o sugerencia con la administración. Tus conversaciones permanecen en NEXUS SCIENCE.",category:"Categoría",general:"Pregunta general",course:"Curso",technical:"Problema técnico",suggestion:"Sugerencia",other:"Otro",subject:"Asunto",message:"Tu mensaje",send:"Enviar feedback",sending:"Enviando…",history:"Mis conversaciones",empty:"Todavía no has enviado feedback.",pending:"Esperando respuesta",replied:"Respuesta recibida",reply:"Respuesta de la administración",success:"Tu feedback se ha enviado a la administración.",error:"No se pudo enviar el feedback.",required:"Escribe un asunto y un mensaje de al menos 10 caracteres.",date:"Enviado el"}
};
export default function StudentFeedback(){
 const {session}=useAuth(); const language=useLanguage(); const t=dictionaries[language];
 const [category,setCategory]=useState("general"),[subject,setSubject]=useState(""),[message,setMessage]=useState("");
 const [rows,setRows]=useState<FeedbackRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function load(){
  if(!session?.user.id)return;
  const {data,error}=await supabase.from("student_feedback").select("id,category,subject,message,status,response,created_at,responded_at").eq("student_id",session.user.id).order("created_at",{ascending:false});
  if(error){setError(error.message);return;} setRows((data??[]) as FeedbackRow[]);
 }
 useEffect(()=>{void load();},[session?.user.id]);
 async function submit(event:React.FormEvent){
  event.preventDefault();setError("");setNotice("");
  if(subject.trim().length<3||message.trim().length<10){setError(t.required);return;}
  if(!session?.user.id)return;
  setBusy(true);
  const {error}=await supabase.from("student_feedback").insert({student_id:session.user.id,category,subject:subject.trim(),message:message.trim()});
  setBusy(false);
  if(error){setError(error.message||t.error);return;}
  setSubject("");setMessage("");setCategory("general");setNotice(t.success);await load();
 }
 const date=(value:string)=>new Intl.DateTimeFormat(language==="fr"?"fr-FR":language==="pt"?"pt-PT":language==="es"?"es-ES":"en-GB",{dateStyle:"medium"}).format(new Date(value));
 return <section className="student-section feedback-student" id="mon-feedback">
  <div className="student-section-heading"><div><p className="student-kicker">NEXUS SCIENCE</p><h2>{t.title}</h2></div></div>
  <p className="student-muted">{t.intro}</p>
  <form className="feedback-form" onSubmit={submit}>
   <label>{t.category}<select value={category} onChange={e=>setCategory(e.target.value)}><option value="general">{t.general}</option><option value="course">{t.course}</option><option value="technical">{t.technical}</option><option value="suggestion">{t.suggestion}</option><option value="other">{t.other}</option></select></label>
   <label>{t.subject}<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={140} required /></label>
   <label>{t.message}<textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} maxLength={5000} required /></label>
   {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
   <button className="student-button" type="submit" disabled={busy}>{busy?t.sending:t.send}</button>
  </form>
  <div className="feedback-history"><h3>{t.history}</h3>
   {rows.length===0?<p className="student-muted">{t.empty}</p>:rows.map(row=><article className="feedback-student-card" key={row.id}>
    <div className="row between"><strong>{row.subject}</strong><span className={row.status==="replied"?"feedback-status replied":"feedback-status"}>{row.status==="replied"?t.replied:t.pending}</span></div>
    <small>{t.date} {date(row.created_at)}</small><p>{row.message}</p>
    {row.response&&<div className="feedback-student-reply"><strong>{t.reply}</strong><p>{row.response}</p>{row.responded_at&&<small>{date(row.responded_at)}</small>}</div>}
   </article>)}
  </div>
 </section>;
}
