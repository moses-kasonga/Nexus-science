import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Asset = {
  id: string;
  asset_type: "image" | "video" | "pdf";
  object_path: string;
  file_name: string;
  caption: string | null;
  signed_url: string;
};

type Props = {
  courseId: string;
  lessonId: string | null;
  title: string;
  content: string;
  onClose: () => void;
};

export default function TeacherLessonPreview({ courseId, lessonId, title, content, onClose }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(Boolean(lessonId));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!lessonId) {
        setAssets([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const { data, error: queryError } = await supabase.from("lesson_assets")
          .select("id,asset_type,object_path,file_name,caption")
          .eq("course_id", courseId).eq("lesson_id", lessonId).order("created_at");
        if (queryError) throw queryError;
        const signedAssets = await Promise.all((data ?? []).map(async (asset) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from("lesson-assets").createSignedUrl(asset.object_path, 3600);
          if (signedError) throw signedError;
          return { ...asset, signed_url: signed.signedUrl } as Asset;
        }));
        if (active) setAssets(signedAssets);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Les ressources n'ont pas pu être chargées.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [courseId, lessonId]);

  const parts = content.split(/(!\[[^\]]*\]\(lesson-asset:[^)]+\))/g);
  return (
    <div className="lesson-preview-backdrop" role="presentation">
      <section className="lesson-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="lesson-preview-title">
        <header className="lesson-preview-header">
          <div>
            <p className="eyebrow">Aperçu enseignant</p>
            <h2 id="lesson-preview-title">Prévisualisation de la leçon</h2>
            <p className="muted small-text">Cette vue ne publie pas la leçon et ne modifie pas son statut.</p>
          </div>
          <button className="btn small" type="button" onClick={onClose} aria-label="Fermer la prévisualisation">Fermer</button>
        </header>
        <article className="lesson-preview-page">
          <h1>{title || "Leçon sans titre"}</h1>
          {loading && <p className="muted" role="status">Chargement des ressources…</p>}
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="lesson-body">
            {parts.map((part, index) => {
              const match = part.match(/^!\[([^\]]*)\]\(lesson-asset:([^)]+)\)$/);
              if (match) {
                const asset = assets.find((item) => item.id === match[2] && item.asset_type === "image");
                return asset
                  ? <figure key={index} className="lesson-illustration"><img src={asset.signed_url} alt={match[1] || asset.caption || "Illustration pédagogique"} /><figcaption>{match[1] || asset.caption}</figcaption></figure>
                  : <p className="muted small-text" key={index}>Illustration non disponible dans l'aperçu.</p>;
              }
              return part.split(/\n{2,}/).filter((paragraph) => paragraph.trim()).map((paragraph, paragraphIndex) => <p key={index + "-" + paragraphIndex}>{paragraph}</p>);
            })}
            {assets.filter((asset) => asset.asset_type === "video").map((asset) => <figure className="lesson-media" key={asset.id}><video controls preload="metadata" playsInline src={asset.signed_url}>Votre navigateur ne prend pas en charge la lecture vidéo.</video><figcaption>{asset.file_name}</figcaption></figure>)}
            {assets.filter((asset) => asset.asset_type === "pdf").map((asset) => <p className="lesson-document" key={asset.id}><a href={asset.signed_url} target="_blank" rel="noreferrer">📄 {asset.file_name} — Consulter / télécharger</a></p>)}
            {!content.trim() && assets.length === 0 && !loading && <p className="muted">Aucun contenu ou média n'a encore été ajouté à cette leçon.</p>}
          </div>
        </article>
      </section>
    </div>
  );
}
