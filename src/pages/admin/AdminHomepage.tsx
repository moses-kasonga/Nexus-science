import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/i18n";
import { fetchPublishedCourses, formatRange, selectFeaturedSessions, type Course } from "../../lib/courses";
import { defaultHomepageContent, fetchHomepageDraft, fetchPublishedHomepageContent, publishHomepageDraft, saveHomepageDraft, uploadHomepageImage, type HomepageContent } from "../../lib/homepage";

type ImageKey = "heroBackgroundImage" | "students" | "practice" | "science";
const copy = {
  fr: { title:"Gestion de la page d’accueil", intro:"Modifiez les visuels, enregistrez un brouillon, prévisualisez-le puis publiez-le.", background:"Arrière-plan scientifique", backgroundHelp:"L’image reste visible derrière les informations sur les cours.", students:"Un environnement étudiant", practice:"Apprendre par la pratique", science:"Les sciences au cœur du parcours", change:"Changer l’image", upload:"Téléversement…", save:"Enregistrer comme brouillon", preview:"Prévisualiser", publish:"Publier la version prévisualisée", desktop:"Ordinateur", mobile:"Téléphone", current:"Cours en cours", next:"Prochaine formation", noCurrent:"Aucun cours en cours", noNext:"Aucun cours à venir", noCourses:"Les cours et les dates proviennent uniquement des sessions réellement publiées.", schema:"La migration de gestion de la page d’accueil doit être appliquée dans Supabase avant de pouvoir enregistrer ou publier.", saved:"Brouillon enregistré.", previewed:"Prévisualisation prête. Vérifiez le rendu avant de publier.", published:"La nouvelle page d’accueil est maintenant publiée.", saveFirst:"Enregistrez le brouillon et prévisualisez-le avant de publier.", leave:"Des modifications ne sont pas enregistrées. Voulez-vous vraiment quitter cette page ?", dirty:"Modifications non enregistrées", clean:"Brouillon enregistré", back:"Retour à l’administration", imageHelp:"JPG, PNG, WebP ou AVIF · 5 Mo maximum" },
  en: { title:"Homepage management", intro:"Edit the visuals, save a draft, preview it, then publish it.", background:"Scientific background", backgroundHelp:"The image remains visible behind the course information.", students:"A student environment", practice:"Learn through practice", science:"Science at the heart of learning", change:"Change image", upload:"Uploading…", save:"Save as draft", preview:"Preview", publish:"Publish previewed version", desktop:"Desktop", mobile:"Phone", current:"Current course", next:"Next course", noCurrent:"No course in progress", noNext:"No upcoming course", noCourses:"Courses and dates come only from sessions that are actually published.", schema:"The homepage management migration must be applied in Supabase before saving or publishing.", saved:"Draft saved.", previewed:"Preview ready. Check the result before publishing.", published:"The new homepage is now published.", saveFirst:"Save the draft and preview it before publishing.", leave:"You have unsaved changes. Do you really want to leave this page?", dirty:"Unsaved changes", clean:"Draft saved", back:"Back to administration", imageHelp:"JPG, PNG, WebP or AVIF · 5 MB maximum" },
  pt: { title:"Gestão da página inicial", intro:"Edite as imagens, guarde um rascunho, pré-visualize e depois publique.", background:"Fundo científico", backgroundHelp:"A imagem permanece visível atrás das informações dos cursos.", students:"Um ambiente estudantil", practice:"Aprender na prática", science:"As ciências no centro do percurso", change:"Alterar imagem", upload:"A carregar…", save:"Guardar como rascunho", preview:"Pré-visualizar", publish:"Publicar a versão pré-visualizada", desktop:"Computador", mobile:"Telemóvel", current:"Curso em curso", next:"Próximo curso", noCurrent:"Nenhum curso em curso", noNext:"Nenhum curso próximo", noCourses:"Os cursos e as datas vêm apenas de sessões realmente publicadas.", schema:"A migração de gestão da página inicial deve ser aplicada no Supabase antes de guardar ou publicar.", saved:"Rascunho guardado.", previewed:"Pré-visualização pronta. Verifique antes de publicar.", published:"A nova página inicial foi publicada.", saveFirst:"Guarde o rascunho e pré-visualize antes de publicar.", leave:"Existem alterações não guardadas. Quer mesmo sair desta página?", dirty:"Alterações não guardadas", clean:"Rascunho guardado", back:"Voltar à administração", imageHelp:"JPG, PNG, WebP ou AVIF · máximo 5 MB" },
  es: { title:"Gestión de la página de inicio", intro:"Modifica las imágenes, guarda un borrador, previsualízalo y publícalo.", background:"Fondo científico", backgroundHelp:"La imagen permanece visible detrás de la información de los cursos.", students:"Un entorno estudiantil", practice:"Aprender con la práctica", science:"Las ciencias en el centro del recorrido", change:"Cambiar imagen", upload:"Subiendo…", save:"Guardar como borrador", preview:"Previsualizar", publish:"Publicar la versión previsualizada", desktop:"Ordenador", mobile:"Teléfono", current:"Curso actual", next:"Próximo curso", noCurrent:"No hay cursos en curso", noNext:"No hay cursos próximos", noCourses:"Los cursos y las fechas proceden solo de sesiones realmente publicadas.", schema:"La migración de gestión de la página de inicio debe aplicarse en Supabase antes de guardar o publicar.", saved:"Borrador guardado.", previewed:"Vista previa lista. Comprueba antes de publicar.", published:"La nueva página de inicio ya está publicada.", saveFirst:"Guarda el borrador y previsualízalo antes de publicar.", leave:"Hay cambios sin guardar. ¿Seguro que quieres salir de esta página?", dirty:"Cambios sin guardar", clean:"Borrador guardado", back:"Volver a la administración", imageHelp:"JPG, PNG, WebP o AVIF · máximo 5 MB" },
} as const;

export default function AdminHomepage() {
  const language = useLanguage(); const t = copy[language]; const { session } = useAuth();
  const [draft,setDraft] = useState<HomepageContent>(defaultHomepageContent);
  const [saved,setSaved] = useState(""); const [published,setPublished] = useState<HomepageContent>(defaultHomepageContent);
  const [courses,setCourses] = useState<Course[]>([]); const [ready,setReady] = useState(false); const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false); const [uploading,setUploading] = useState<ImageKey | "">("");
  const [error,setError] = useState(""); const [message,setMessage] = useState("");
  const [preview,setPreview] = useState(false); const [device,setDevice] = useState<"desktop"|"mobile">("desktop"); const [previewed,setPreviewed] = useState(false);
  const dirty = JSON.stringify(draft) !== saved; const featured = useMemo(() => selectFeaturedSessions(courses),[courses]);

  useEffect(() => {
    let active=true;
    (async()=>{
      const [publicContent,list]=await Promise.all([fetchPublishedHomepageContent(),fetchPublishedCourses(language)]).catch(()=>[defaultHomepageContent,[] as Course[]] as const);
      if(!active)return;
      setPublished(publicContent);setCourses(list);
      try {
        const value=await fetchHomepageDraft();
        if(!active)return;
        const initial=value??publicContent;
        setDraft(initial);setSaved(JSON.stringify(initial));setReady(true);
      } catch(cause) {
        if(!active)return;
        setError(cause instanceof Error?cause.message:t.schema);
        setDraft(publicContent);setSaved(JSON.stringify(publicContent));setReady(false);
      } finally { if(active)setLoading(false); }
    })();
    return ()=>{active=false;};
  },[language,t.schema]);

  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    const guardNavigation=(event:Event)=>{
      if(!(event.target instanceof Element))return;
      const link=event.target.closest("a[href]") as HTMLAnchorElement | null;
      if(!link||link.target==="_blank"||event.defaultPrevented)return;
      const destination=new URL(link.href,window.location.href);
      if(destination.origin===window.location.origin&&destination.pathname!==window.location.pathname&&!window.confirm(t.leave)){
        event.preventDefault();event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload",warn);
    document.addEventListener("click",guardNavigation,true);
    return()=>{window.removeEventListener("beforeunload",warn);document.removeEventListener("click",guardNavigation,true);};
  },[dirty,t.leave]);

  function setImage(key:ImageKey,url:string){setDraft((old)=>key==="heroBackgroundImage"?{...old,heroBackgroundImage:url}:{...old,showcaseImages:{...old.showcaseImages,[key]:url}});setPreviewed(false);}
  async function upload(key:ImageKey,file?:File){if(!file)return;setUploading(key);setError("");try{setImage(key,await uploadHomepageImage(file));setMessage(language==="fr"?"Image ajoutée au brouillon. Enregistrez pour conserver le changement.":"Image added to the draft. Save to keep the change.");}catch(cause){setError(cause instanceof Error?cause.message:"Upload failed");}finally{setUploading("");}}
  async function save(){if(!session?.user.id)return;setBusy(true);setError("");setMessage("");try{await saveHomepageDraft(draft,session.user.id);setSaved(JSON.stringify(draft));setPreviewed(false);setMessage(t.saved);}catch(cause){setError(cause instanceof Error?cause.message:"Save failed");}finally{setBusy(false);}}
  async function publish(){if(dirty||!previewed){setError(t.saveFirst);return;}setBusy(true);setError("");setMessage("");try{await publishHomepageDraft();setPublished(draft);setMessage(t.published);}catch(cause){setError(cause instanceof Error?cause.message:"Publish failed");}finally{setBusy(false);}}
  const fields:{key:ImageKey;title:string;url:string}[]=[{key:"heroBackgroundImage",title:t.background,url:draft.heroBackgroundImage},{key:"students",title:t.students,url:draft.showcaseImages.students},{key:"practice",title:t.practice,url:draft.showcaseImages.practice},{key:"science",title:t.science,url:draft.showcaseImages.science}];

  return <section className="admin-page homepage-admin">
    <div className="admin-page-heading"><div><p className="eyebrow">NEXUS SCIENCE</p><h2>{t.title}</h2><p>{t.intro}</p></div><Link className="btn" to="/admin">← {t.back}</Link></div>
    {error&&<p className="notice error" role="alert">{error}</p>}{message&&<p className="notice ok" role="status">{message}</p>}
    <div className="homepage-admin-grid"><div className="homepage-editor-panel">
      {fields.map(field=><section className="homepage-image-editor" key={field.key}><div className="homepage-image-editor-heading"><h3>{field.title}</h3><small>{field.key==="heroBackgroundImage"?t.backgroundHelp:t.imageHelp}</small></div><img className={`homepage-image-thumb ${field.key==="heroBackgroundImage"?"is-background":""}`} src={field.url} alt=""/><label className="btn homepage-upload-button">{uploading===field.key?t.upload:t.change}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!ready||busy||!!uploading} onChange={e=>{void upload(field.key,e.currentTarget.files?.[0]);e.currentTarget.value="";}}/></label></section>)}
      <div className="homepage-editor-actions"><button className="btn" disabled={!ready||loading||busy||!dirty} onClick={()=>void save()}>{t.save}</button><button className="btn" onClick={()=>{setPreview(true);setPreviewed(true);setError("");setMessage(t.previewed);}}>{t.preview}</button><button className="btn primary" disabled={!ready||busy||dirty||!previewed} onClick={()=>void publish()}>{t.publish}</button></div>
      <p className="homepage-save-state"><span className={`status-dot ${dirty?"is-dirty":""}`}/>{dirty?t.dirty:t.clean}</p>
    </div><div className="homepage-preview-panel"><div className="homepage-preview-toolbar"><strong>{t.preview}</strong><div className="homepage-device-switch"><button className={device==="desktop"?"is-active":""} onClick={()=>{setDevice("desktop");setPreview(true);setPreviewed(true);}}>{t.desktop}</button><button className={device==="mobile"?"is-active":""} onClick={()=>{setDevice("mobile");setPreview(true);setPreviewed(true);}}>{t.mobile}</button></div></div>
      {preview?<div className={`homepage-preview-frame ${device}`}><section className="homepage-preview-hero" style={{backgroundImage:`linear-gradient(90deg,rgba(4,16,34,.92),rgba(4,16,34,.7)),url("${draft.heroBackgroundImage}")`}}><p className="eyebrow">NEXUS SCIENCE</p><h3>{language==="fr"?"Votre parcours scientifique en mouvement":language==="pt"?"O seu percurso científico em movimento":language==="es"?"Tu recorrido científico en movimiento":"Your scientific journey in motion"}</h3><p>{t.noCourses}</p><div className="homepage-preview-courses"><article><span>{t.current}</span><strong>{featured.current?.course.name??t.noCurrent}</strong>{featured.current&&<small>{formatRange(featured.current.schedule,language)}</small>}</article><article><span>{t.next}</span><strong>{featured.next?.course.name??t.noNext}</strong>{featured.next&&<small>{formatRange(featured.next.schedule,language)}</small>}</article></div></section><div className="homepage-preview-showcase">{fields.slice(1).map(field=><img key={field.key} src={field.url} alt=""/>)}</div></div>:<div className="homepage-preview-placeholder">{t.preview}</div>}
      <div className="homepage-preview-footnote"><span className="badge">{t.clean}</span><span>{published.heroBackgroundImage===draft.heroBackgroundImage?t.clean:t.dirty}</span></div>
    </div></div>
  </section>;
}
