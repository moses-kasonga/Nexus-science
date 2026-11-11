import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Language } from "../lib/courses";

type Item = { id: string; title: string; description: string | null; kind: string; max_score: number; due_date: string | null; results_published: boolean; allow_multiple_choice: boolean; allow_written: boolean };
type Question = { id: string; prompt: string; question_type: "multiple_choice" | "written"; points: number; position: number };
type Option = { id: string; question_id: string; label: string; position: number };
type Review = { question_id: string; prompt: string; question_type: "multiple_choice" | "written"; points: number; options: {id:string;label:string}[]; selected_option_ids: string[]; written_answer: string | null; points_awarded: number | null; teacher_feedback: string | null; correct_option_ids: string[]; expected_text: string | null; explanation: string | null };
type Result = { assessment_id: string; score: number | null; comment: string | null };

const text: Record<Language, Record<string,string>> = {
  fr: { title:"Évaluations", none:"Aucune évaluation publiée pour l'instant.", due:"À rendre pour le", pending:"Résultat à venir", grade:"Note", comment:"Commentaire de l'enseignant", of:"sur", start:"Commencer", submit:"Soumettre mes réponses", submitted:"Réponses envoyées", already:"Vous avez déjà remis votre copie.", review:"Consulter le corrigé détaillé", hide:"Masquer le corrigé", written:"Votre réponse", choose:"Sélectionnez la ou les bonnes réponses", expected:"Réponse attendue", explanation:"Explication", points:"Points obtenus", kinds:"Choix multiples", writtenKind:"Réponse écrite", confirm:"Après soumission, vous ne pourrez plus modifier vos réponses." },
  en: { title:"Assessments", none:"No assessments have been published yet.", due:"Due on", pending:"Result pending", grade:"Grade", comment:"Teacher's comment", of:"out of", start:"Start", submit:"Submit my answers", submitted:"Answers submitted", already:"You have already submitted your work.", review:"View detailed answer key", hide:"Hide answer key", written:"Your answer", choose:"Select the correct answer(s)", expected:"Expected answer", explanation:"Explanation", points:"Points earned", kinds:"Multiple choice", writtenKind:"Written answer", confirm:"You cannot change your answers after submission." },
  pt: { title:"Avaliações", none:"Ainda não há avaliações publicadas.", due:"Entrega até", pending:"Resultado pendente", grade:"Nota", comment:"Comentário do professor", of:"em", start:"Começar", submit:"Enviar as minhas respostas", submitted:"Respostas enviadas", already:"Já enviou a sua prova.", review:"Consultar correção detalhada", hide:"Ocultar correção", written:"A sua resposta", choose:"Selecione a(s) resposta(s) correta(s)", expected:"Resposta esperada", explanation:"Explicação", points:"Pontos obtidos", kinds:"Escolha múltipla", writtenKind:"Resposta escrita", confirm:"Não poderá alterar as respostas depois de enviar." },
  es: { title:"Evaluaciones", none:"Todavía no hay evaluaciones publicadas.", due:"Fecha límite", pending:"Resultado pendiente", grade:"Nota", comment:"Comentario del profesor", of:"sobre", start:"Comenzar", submit:"Enviar mis respuestas", submitted:"Respuestas enviadas", already:"Ya has enviado tu prueba.", review:"Consultar corrección detallada", hide:"Ocultar corrección", written:"Tu respuesta", choose:"Selecciona la(s) respuesta(s) correcta(s)", expected:"Respuesta esperada", explanation:"Explicación", points:"Puntos obtenidos", kinds:"Opción múltiple", writtenKind:"Respuesta escrita", confirm:"No podrás modificar tus respuestas después de enviarlas." },
};
const locale: Record<Language,string> = { fr:"fr-FR", en:"en-GB", pt:"pt-PT", es:"es-ES" };

export default function CourseAssessments({ courseId, language }: { courseId: string; language: Language }) {
  const [items,setItems] = useState<Item[] | null>(null);
  const [results,setResults] = useState<Map<string,Result>>(new Map());
  const [attempts,setAttempts] = useState<Set<string>>(new Set());
  const [opened,setOpened] = useState<string | null>(null);
  const [questions,setQuestions] = useState<Question[]>([]);
  const [options,setOptions] = useState<Option[]>([]);
  const [answers,setAnswers] = useState<Record<string,{selected_option_ids:string[];written_answer:string}>>({});
  const [reviews,setReviews] = useState<Record<string,Review[]>>({});
  const [reviewOpen,setReviewOpen] = useState<Set<string>>(new Set());
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const t = text[language];

  useEffect(() => {
    let active=true;
    (async()=>{
      const list=await supabase.from("assessments").select("id,title,description,kind,max_score,due_date,results_published,allow_multiple_choice,allow_written").eq("course_id",courseId).eq("published",true).order("created_at");
      if(list.error) throw list.error;
      const ids=(list.data??[]).map((x)=>x.id);
      const [own,tries]=ids.length ? await Promise.all([
        supabase.from("assessment_results").select("assessment_id,score,comment").in("assessment_id",ids),
        supabase.from("assessment_attempts").select("assessment_id").in("assessment_id",ids),
      ]) : [{data:[],error:null},{data:[],error:null}];
      if(own.error) throw own.error;
      if(tries.error) throw tries.error;
      if(active){setItems((list.data??[]) as Item[]);setResults(new Map(((own.data??[]) as Result[]).map((x)=>[x.assessment_id,x])));setAttempts(new Set((tries.data??[]).map((x)=>x.assessment_id)));}
    })().catch((cause)=>{if(active){setItems([]);setError(cause.message??"Impossible de charger les évaluations.");}});
    return ()=>{active=false;};
  },[courseId]);

  async function openAssessment(item:Item) {
    setError("");setNotice("");setOpened(item.id);
    const [q,o]=await Promise.all([
      supabase.from("assessment_questions").select("id,prompt,question_type,points,position").eq("assessment_id",item.id).order("position"),
      supabase.from("assessment_options").select("id,question_id,label,position").order("position"),
    ]);
    if(q.error||o.error){setError(q.error?.message??o.error?.message??"Erreur");return;}
    const qrows=(q.data??[]) as Question[];
    setQuestions(qrows);
    setOptions(((o.data??[]) as Option[]).filter((x)=>qrows.some((qrow)=>qrow.id===x.question_id)));
    setAnswers(Object.fromEntries(qrows.map((qrow)=>[qrow.id,{selected_option_ids:[],written_answer:""}])));
  }

  async function submit(item:Item) {
    if(!window.confirm(t.confirm)) return;
    setBusy(true);setError("");setNotice("");
    const payload=questions.map((q)=>({question_id:q.id,selected_option_ids:answers[q.id]?.selected_option_ids??[],written_answer:answers[q.id]?.written_answer??""}));
    const {error:failure}=await supabase.rpc("submit_assessment_answers",{p_assessment_id:item.id,p_answers:payload});
    setBusy(false);
    if(failure){setError(failure.message);return;}
    setAttempts((old)=>new Set(old).add(item.id));setOpened(null);setNotice(t.submitted);
  }

  async function toggleReview(item:Item) {
    if(reviewOpen.has(item.id)){setReviewOpen((old)=>{const next=new Set(old);next.delete(item.id);return next;});return;}
    setBusy(true);setError("");
    const {data,error:failure}=await supabase.rpc("get_my_assessment_review",{p_assessment_id:item.id});
    setBusy(false);
    if(failure){setError(failure.message);return;}
    setReviews((old)=>({...old,[item.id]:(data??[]) as Review[]}));
    setReviewOpen((old)=>new Set(old).add(item.id));
  }

  if(items===null) return null;
  return (
    <>
      <h2>{t.title}</h2>
      {error&&<p className="notice error" role="alert">{error}</p>}
      {notice&&<p className="notice" role="status">{notice}</p>}
      {items.length===0&&<p className="notice">{t.none}</p>}
      <ul className="stack tight">
        {items.map((item)=>{
          const result=results.get(item.id);
          const submitted=attempts.has(item.id);
          return <li key={item.id} className="panel">
            <strong>{item.title}</strong> <span className="tag">{item.kind}</span>
            {item.due_date&&<p className="muted small-text">{t.due} {new Intl.DateTimeFormat(locale[language],{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(item.due_date+"T00:00:00Z"))}</p>}
            {item.description&&<p>{item.description}</p>}
            {item.results_published&&result?.score!==null&&result?.score!==undefined
              ? <p><strong>{t.grade}: {result.score} {t.of} {item.max_score}</strong>{result.comment&&<span className="muted small-text"> · {t.comment}: {result.comment}</span>}</p>
              : <p className="muted small-text">{submitted?t.submitted:t.pending}</p>}
            {!submitted&&<button className="btn primary small" type="button" disabled={busy} onClick={()=>void openAssessment(item)}>{t.start}</button>}
            {submitted&&item.results_published&&<button className="btn small" type="button" disabled={busy} onClick={()=>void toggleReview(item)}>{reviewOpen.has(item.id)?t.hide:t.review}</button>}
            {opened===item.id&&!submitted&&<div className="panel form">
              <p className="muted small-text">{item.allow_multiple_choice?t.kinds:""}{item.allow_multiple_choice&&item.allow_written?" · ":""}{item.allow_written?t.writtenKind:""}</p>
              {questions.map((q,index)=>{
                const response=answers[q.id]??{selected_option_ids:[],written_answer:""};
                const qOptions=options.filter((o)=>o.question_id===q.id);
                return <fieldset key={q.id}>
                  <legend>{index+1}. {q.prompt} ({q.points} pt)</legend>
                  {q.question_type==="multiple_choice"?<>
                    <p className="muted small-text">{t.choose}</p>
                    {qOptions.map((option)=><label className="check" key={option.id}>
                      <input type="checkbox" checked={response.selected_option_ids.includes(option.id)} onChange={(event)=>setAnswers((old)=>({...old,[q.id]:{...response,selected_option_ids:event.target.checked?[...response.selected_option_ids,option.id]:response.selected_option_ids.filter((id)=>id!==option.id)}}))}/>
                      {option.label}
                    </label>)}
                  </>:<label>{t.written}<textarea rows={4} value={response.written_answer} onChange={(event)=>setAnswers((old)=>({...old,[q.id]:{...response,written_answer:event.target.value}}))}/></label>}
                </fieldset>;
              })}
              <div className="row"><button className="btn primary" type="button" disabled={busy||questions.length===0} onClick={()=>void submit(item)}>{busy?"…":t.submit}</button><button className="btn" type="button" onClick={()=>setOpened(null)}>Annuler</button></div>
            </div>}
            {reviewOpen.has(item.id)&&<div className="panel">
              {(reviews[item.id]??[]).map((review,index)=><article key={review.question_id} className="panel">
                <strong>{index+1}. {review.prompt}</strong>
                <p className="muted small-text">{t.points}: {review.points_awarded??"—"} / {review.points}</p>
                {review.question_type==="multiple_choice"?review.options.map((option)=><p key={option.id}>
                  {review.correct_option_ids.includes(option.id)?"✓ ":""}{review.selected_option_ids?.includes(option.id)?"Votre choix : ":""}{option.label}
                </p>):<>
                  <p><strong>{t.written} :</strong> {review.written_answer||"—"}</p>
                  {review.expected_text&&<p><strong>{t.expected} :</strong> {review.expected_text}</p>}
                </>}
                {review.teacher_feedback&&<p><strong>{t.comment} :</strong> {review.teacher_feedback}</p>}
                {review.explanation&&<p><strong>{t.explanation} :</strong> {review.explanation}</p>}
              </article>)}
            </div>}
          </li>;
        })}
      </ul>
    </>
  );
}
