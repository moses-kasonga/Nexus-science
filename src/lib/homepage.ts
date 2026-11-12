import { supabase } from "./supabase";

export type HomepageContent = {
  heroBackgroundImage: string;
  showcaseImages: { students: string; practice: string; science: string };
};

export const defaultHomepageContent: HomepageContent = {
  heroBackgroundImage: "https://images.pexels.com/photos/4033019/pexels-photo-4033019.jpeg?auto=compress&cs=tinysrgb&w=1800&q=82",
  showcaseImages: {
    students: "https://images.pexels.com/photos/6146960/pexels-photo-6146960.jpeg?auto=compress&cs=tinysrgb&w=1400&q=82",
    practice: "https://images.pexels.com/photos/6208709/pexels-photo-6208709.jpeg?auto=compress&cs=tinysrgb&w=1400&q=82",
    science: "https://images.pexels.com/photos/5427819/pexels-photo-5427819.jpeg?auto=compress&cs=tinysrgb&w=1400&q=82",
  },
};

function safeImage(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 2048) return fallback;
  if (value.startsWith("/")) return value;
  try { const url = new URL(value); return url.protocol === "https:" ? value : fallback; }
  catch { return fallback; }
}

export function normalizeHomepageContent(value: unknown): HomepageContent {
  if (!value || typeof value !== "object") return defaultHomepageContent;
  const input = value as Partial<HomepageContent>;
  const images = input.showcaseImages ?? defaultHomepageContent.showcaseImages;
  return {
    heroBackgroundImage: safeImage(input.heroBackgroundImage, defaultHomepageContent.heroBackgroundImage),
    showcaseImages: {
      students: safeImage(images.students, defaultHomepageContent.showcaseImages.students),
      practice: safeImage(images.practice, defaultHomepageContent.showcaseImages.practice),
      science: safeImage(images.science, defaultHomepageContent.showcaseImages.science),
    },
  };
}

function missingSchema(code: string) { return code === "42P01" || code === "PGRST205" || code === "PGRST204"; }

export async function fetchPublishedHomepageContent(): Promise<HomepageContent> {
  const { data, error } = await supabase.from("homepage_content_published").select("content").eq("id", "singleton").maybeSingle();
  if (error) {
    if (!missingSchema(error.code)) console.warn("NEXUS SCIENCE: configuration publique de l’accueil indisponible", error.message);
    return defaultHomepageContent;
  }
  return normalizeHomepageContent(data?.content);
}

export async function fetchHomepageDraft(): Promise<HomepageContent | null> {
  const { data, error } = await supabase.from("homepage_content_drafts").select("content").eq("id", "singleton").maybeSingle();
  if (error) {
    if (missingSchema(error.code)) throw new Error("La migration de gestion de la page d’accueil doit d’abord être appliquée dans Supabase.");
    throw new Error("Le brouillon de la page d’accueil n’a pas pu être chargé.");
  }
  return data ? normalizeHomepageContent(data.content) : null;
}

export async function saveHomepageDraft(content: HomepageContent, adminId: string): Promise<void> {
  const { error } = await supabase.from("homepage_content_drafts").upsert({
    id: "singleton", content: normalizeHomepageContent(content), updated_by: adminId, updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error(error.message || "Le brouillon n’a pas pu être enregistré.");
}

export async function publishHomepageDraft(): Promise<void> {
  const { error } = await supabase.rpc("publish_homepage_content");
  if (error) throw new Error(error.message || "La publication de la page d’accueil a échoué.");
}

export async function uploadHomepageImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) throw new Error("Format non pris en charge. Utilisez JPG, PNG, WebP ou AVIF.");
  if (file.size > 5 * 1024 * 1024) throw new Error("L’image dépasse 5 Mo. Choisissez un fichier plus léger.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("homepage-assets").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message || "L’image n’a pas pu être téléversée.");
  return supabase.storage.from("homepage-assets").getPublicUrl(path).data.publicUrl;
}
