import { useEffect, useState, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabase";

type Asset = { id: string; asset_type: "image" | "video" | "pdf"; object_path: string; file_name: string; mime_type: string; file_size: number; caption: string | null };
type Props = { courseId: string; lessonId: string; content: string; onContentChange: (value: string) => void };

const limits = { image: 5 * 1024 * 1024, pdf: 20 * 1024 * 1024, video: 50 * 1024 * 1024 };

export default function LessonResourcesEditor({ courseId, lessonId, content, onContentChange }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadAssets() {
    const { data, error: failure } = await supabase.from("lesson_assets")
      .select("id,asset_type,object_path,file_name,mime_type,file_size,caption")
      .eq("lesson_id", lessonId).order("created_at");
    if (failure) throw failure;
    setAssets((data ?? []) as Asset[]);
  }

  useEffect(() => { void loadAssets().catch((cause) => setError(cause.message)); }, [lessonId]);

  async function upload(event: ChangeEvent<HTMLInputElement>, type: Asset["asset_type"]) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const allowed = type === "image"
      ? ["image/jpeg", "image/png", "image/webp", "image/avif"]
      : type === "pdf" ? ["application/pdf"] : ["video/mp4", "video/webm"];
    if (!allowed.includes(file.type)) { setError(type === "image" ? "Format image accepté : JPG, PNG, WebP ou AVIF." : type === "pdf" ? "Choisissez un document PDF." : "Format vidéo accepté : MP4 ou WebM."); return; }
    if (file.size > limits[type]) { setError(`Fichier trop volumineux. Limite : ${Math.round(limits[type] / 1024 / 1024)} Mo.`); return; }
    setBusy(true); setError(""); setNotice("");
    const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "ressource";
    const path = `${courseId}/${lessonId}/${crypto.randomUUID()}-${safeName}`;
    try {
      const { error: uploadError } = await supabase.storage.from("lesson-assets").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await supabase.from("lesson_assets").insert({
        course_id: courseId, lesson_id: lessonId, asset_type: type, object_path: path,
        file_name: file.name, mime_type: file.type, file_size: file.size,
        caption: type === "image" ? file.name.replace(/\.[^.]+$/, "") : null, created_by: (await supabase.auth.getUser()).data.user?.id,
      }).select("id").single();
      if (insertError) { await supabase.storage.from("lesson-assets").remove([path]); throw insertError; }
      if (type === "image") onContentChange(`${content.trim()}\n\n![${file.name.replace(/\.[^.]+$/, "")}](lesson-asset:${data.id})\n`);
      await loadAssets();
      setNotice(type === "image" ? "Image ajoutée. Son emplacement est inséré dans le contenu." : "Ressource ajoutée à la leçon.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Le fichier n'a pas pu être envoyé."); }
    finally { setBusy(false); }
  }

  async function remove(asset: Asset) {
    if (!window.confirm(`Supprimer « ${asset.file_name} » ?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: storageError } = await supabase.storage.from("lesson-assets").remove([asset.object_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from("lesson_assets").delete().eq("id", asset.id);
      if (rowError) throw rowError;
      if (asset.asset_type === "image") onContentChange(content.replace(new RegExp("!\\\\[[^\\\\]]*\\\\]\\\\(lesson-asset:" + asset.id + "\\\\)", "g"), "").replace(/\\n{3,}/g, "\\n\\n"));
      await loadAssets();
      setNotice("Ressource supprimée.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "La suppression a échoué."); }
    finally { setBusy(false); }
  }

  return <section className="panel form" aria-label="Ressources pédagogiques">
    <h4>Ressources pédagogiques</h4>
    <p className="muted small-text">Ajoutez des illustrations, une vidéo ou un document PDF. Les fichiers sont privés et accessibles aux élèves inscrits lorsque la leçon est publiée.</p>
    <div className="grid">
      <label>Ajouter une image (JPG, PNG, WebP, AVIF · 5 Mo max)
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={(event) => void upload(event, "image")} />
      </label>
      <label>Ajouter une vidéo (MP4, WebM · 50 Mo max)
        <input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={(event) => void upload(event, "video")} />
      </label>
      <label>Ajouter un document PDF (20 Mo max)
        <input type="file" accept="application/pdf" disabled={busy} onChange={(event) => void upload(event, "pdf")} />
      </label>
    </div>
    {busy && <p className="muted" role="status">Téléversement en cours…</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {assets.length > 0 && <ul className="stack tight">{assets.map((asset) => <li key={asset.id} className="row between panel">
      <span><strong>{asset.asset_type === "image" ? "Image" : asset.asset_type === "video" ? "Vidéo" : "PDF"} :</strong> {asset.file_name}</span>
      <button className="btn small" type="button" disabled={busy} onClick={() => void remove(asset)}>Supprimer</button>
    </li>)}</ul>}
  </section>;
}
