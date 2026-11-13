import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../lib/i18n";

type Row={id:string;student_id:string;category:string;subject:string;message:string;status:"pending"|"replied";response:string|null;created_at:string;responded_at:string|null};
type Profile={id:string;first_name:string|null;last_name:string|null;email:string|null};
const dictionaries={
 fr:{title:"Boîte de réception des feedbacks",intro:"Consulte les messages des élèves, prépare une réponse et prévisualise-la avant publication dans leur espace personnel.",all:"Tous",pending:"À traiter",replied:"Répondus",loading:"Chargement…",empty:"Aucun feedback dans cette catégorie.",student:"Élève",received:"Reçu le",original:"Message de l’élève",draft:"Rédiger la réponse",preview:"Prévisualiser",hide:"Masquer l’aperçu",previewTitle:"Aperçu visible par l’élève",send:"Envoyer la réponse",sending:"Publication…",sent:"La réponse est maintenant visible dans l’espace de l’élève.",need:"Rédige une réponse avant de prévisualiser ou d’envoyer.",error:"Une erreur est survenue.",statusPending:"En attente",statusReplied:"Répondu",reply:"Réponse publiée",category:"Catégorie"},
 en:{title:"Feedback inbox",intro:"Read student messages, prepare a reply and preview it before publishing it to their personal space.",all:"All",pending:"Pending",replied:"Replied",loading:"Loading…",empty:"No feedback in this category.",student:"Student",received:"Received",original:"Student message",draft:"Write a reply",preview:"Preview",hide:"Hide preview",previewTitle:"Preview visible to the student",send:"Send reply",sending:"Publishing…",sent:"The reply is now visible in the student's space.",need:"Write a reply before previewing or sending.",error:"An error occurred.",statusPending:"Pending",statusReplied:"Replied",reply:"Published reply",category:"Category"},
 pt:{title:"Caixa de feedback",intro:"Leia as mensagens dos alunos, prepare uma resposta e pré-visualize-a antes de a publicar no espaço pessoal do aluno.",all:"Todos",pending:"Pendentes",replied:"Respondidos",loading:"A carregar…",empty:"Não há feedback nesta categoria.",student:"Aluno",received:"Recebido em",original:"Mensagem do aluno",draft:"Escrever resposta",preview:"Pré-visualizar",hide:"Ocultar pré-visualização",previewTitle:"Pré-visualização visível ao aluno",send:"Enviar resposta",sending:"A publicar…",sent:"A resposta está agora disponível no espaço do aluno.",need:"Escreva uma resposta antes de pré-visualizar ou enviar.",error:"Ocorreu um erro.",statusPending:"Pendente",statusReplied:"Respondido",reply:"Resposta publicada",category:"Categoria"},
 es:{title:"Bandeja de feedback",intro:"Lee los mensajes de los alumnos, prepara una respuesta y prévisualízala antes de publicarla en su espacio personal.",all:"Todos",pending:"Pendientes",replied:"Respondidos",loading:"Cargando…",empty:"No hay feedback en esta categoría.",student:"Alumno",received:"Recibido el",original:"Mensaje del alumno",draft:"Redactar respuesta",preview:"Previsualizar",hide:"Ocultar vista previa",previewTitle:"Vista previa para el alumno",send:"Enviar respuesta",sending:"Publicando…",sent:"La respuesta ya está disponible en el espacio del alumno.",need:"Redacta una respuesta antes de previsualizar o enviar.",error:"Se ha producido un error.",statusPending:"Pendiente",statusReplied:"Respondido",reply:"Respuesta publicada",category:"Categoría"}
};
const categoryLabels:Record<string,Record<string,string>>={fr:{general:"Question générale",course:"Formation / cours",technical:"Problème technique",suggestion:"Suggestion",other:"Autre"},en:{general:"General question",course:"Course",technical:"Technical issue",suggestion:"Suggestion",other:"Other"},pt:{general:"Questão geral",course:"Curso",technical:"Problema técnico",suggestion:"Sugestão",other:"Outro"},es:{general:"Pregunta general",course:"Curso",technical:"Problema técnico",suggestion:"Sugerencia",other:"Otro"}};
export default function AdminFeedback(){
 const language=useLanguage(),t=dictionaries[language];
 const [rows,setRows]=useState<Row[]>([]),[profiles,setProfiles]=useState<Record<string,Profile>>({});
 const [filter,setFilter]=useState<"all"|"pending"|"replied">("pending"),[selected,setSelected]=useState<string|null>(null);
 const [draft,setDraft]=useState(""),[preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function load(){
  const {data,error}=await supabase.from("student_feedback").select("id,student_id,category,subject,message,status,response,created_at,responded_at").order("created_at",{ascending:false});
  if(error){setError(error.message);return;}
  const items=(data??[]) as Row[];setRows(items);
  const ids=[...new Set(items.map(x=>x.student_id))];
  if(ids.length){const p=await supabase.from("profiles").select("id,first_name,last_name,email").in("id",ids);if(!p.error)setProfiles(Object.fromEntries(((p.data??[]) as Profile[]).map(x=>[x.id,x])));}
 }
 useEffect(()=>{void load();},[]);
 const counts=useMemo(()=>({all:rows.length,pending:rows.filter(x=>x.status==="pending").length,replied:rows.filter(x=>x.status==="replied").length}),[rows]);
 const visible=rows.filter(x=>filter==="all"||x.status===filter),current=rows.find(x=>x.id===selected)||null;
 function choose(row:Row){setSelected(row.id);setDraft(row.response??"");setPreview(false);setError("");setNotice("");}
 async function send(){
  if(!current||!draft.trim()){setError(t.need);return;}
  if(!window.confirm(language==="fr"?"Confirmer la publication de cette réponse dans l’espace de l’élève ?":"Confirm publishing this reply to the student's space?"))return;
  setBusy(true);setError("");setNotice("");
  const {error}=await supabase.from("student_feedback").update({status:"replied",response:draft.trim(),responded_by:(await supabase.auth.getUser()).data.user?.id,responded_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",current.id);
  setBusy(false);
  if(error){setError(error.message);return;}
  setNotice(t.sent);setPreview(false);await load();
 }
 const date=(value:string)=>new Intl.DateTimeFormat(language==="fr"?"fr-FR":language==="pt"?"pt-PT":language==="es"?"es-ES":"en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
 return <section className="admin-feedback">
  <div className="admin-page-heading"><div><p className="eyebrow">NEXUS SCIENCE</p><h2>{t.title}</h2></div><p className="muted">{t.intro}</p></div>
  <div className="row feedback-filters" role="group" aria-label={t.title}>
   {(["pending","all","replied"] as const).map(key=><button key={key} className={filter===key?"btn small primary":"btn small"} type="button" onClick={()=>setFilter(key)}>{t[key]} ({counts[key]})</button>)}
  </div>
  <div className="feedback-admin-grid">
   <div className="feedback-inbox">
    {rows.length===0?<p className="muted">{t.loading}</p>:visible.length===0?<p className="notice">{t.empty}</p>:visible.map(row=>{const p=profiles[row.student_id];return <button type="button" key={row.id} className={selected===row.id?"feedback-inbox-item active":"feedback-inbox-item"} onClick={()=>choose(row)}>
     <span className="row between"><strong>{row.subject}</strong><small>{row.status==="pending"?t.statusPending:t.statusReplied}</small></span>
     <span>{p?[p.first_name,p.last_name].filter(Boolean).join(" ")||p.email:p?.email||row.student_id.slice(0,8)}</span>
     <small>{date(row.created_at)}</small>
    </button>})}
   </div>
   <div className="feedback-detail">
    {!current?<p className="muted">{t.empty}</p>:<>
     <div className="row between"><h3>{current.subject}</h3><span className="feedback-status">{current.status==="pending"?t.statusPending:t.statusReplied}</span></div>
     <p className="muted small-text">{t.student}: {profiles[current.student_id]?[profiles[current.student_id].first_name,profiles[current.student_id].last_name].filter(Boolean).join(" ")||profiles[current.student_id].email:current.student_id.slice(0,8)} · {t.received} {date(current.created_at)}</p>
     <p className="muted small-text">{t.category}: {categoryLabels[language][current.category]||current.category}</p>
     <article className="feedback-original"><strong>{t.original}</strong><p>{current.message}</p></article>
     <label className="feedback-reply-label">{t.draft}<textarea rows={7} value={draft} onChange={e=>{setDraft(e.target.value);setPreview(false);}} maxLength={5000}/></label>
     <div className="row wrap"><button type="button" className="btn" disabled={!draft.trim()} onClick={()=>setPreview(v=>!v)}>{preview?t.hide:t.preview}</button><button type="button" className="btn primary" disabled={busy||!draft.trim()} onClick={()=>void send()}>{busy?t.sending:t.send}</button></div>
     {preview&&<div className="feedback-preview"><strong>{t.previewTitle}</strong><p>{draft}</p></div>}
     {current.response&&<div className="feedback-original"><strong>{t.reply}</strong><p>{current.response}</p></div>}
     {error&&<p className="notice error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
    </>}
   </div>
  </div>
 </section>;
}
