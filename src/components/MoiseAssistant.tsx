import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "../lib/i18n";
import "./moise-assistant.css";

type Role = "student" | "teacher" | "admin";
type AttachmentMeta = { name: string; mimeType: string };
type Message = { role: "user" | "assistant"; content: string; id: string; attachment?: AttachmentMeta };

const apiBase = "/api/moise";
const allowedFiles = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxFileBytes = 2 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Lecture du fichier impossible."));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

const copy = {
  fr: { title: "MOÏSE", subtitle: "Votre assistant intelligent dans NEXUS SCIENCE", placeholder: "Posez votre question à MOÏSE…", send: "Envoyer", newChat: "Nouvelle conversation", welcome: "Bonjour ! Je suis MOÏSE. Comment puis-je vous aider aujourd’hui ?", student: "Je peux vous aider à comprendre vos cours, réviser et travailler vos exercices.", teacher: "Je peux vous aider à préparer vos leçons, exercices et évaluations.", admin: "Je peux vous aider à analyser et documenter la plateforme.", offline: "Le service MOÏSE est momentanément indisponible.", login: "Connectez-vous pour utiliser MOÏSE.", sending: "MOÏSE réfléchit…", error: "Impossible d’envoyer le message. Réessayez.", limit: "Votre message est trop long.", attach: "Joindre un PDF ou une image", removeFile: "Retirer le fichier", fileType: "Format non pris en charge. Utilisez un PDF ou une image.", fileLimit: "Le fichier ne doit pas dépasser 2 Mo." },
  en: { title: "MOÏSE", subtitle: "Your intelligent assistant in NEXUS SCIENCE", placeholder: "Ask MOÏSE a question…", send: "Send", newChat: "New conversation", welcome: "Hello! I’m MOÏSE. How can I help you today?", student: "I can help you understand lessons, revise and work through exercises.", teacher: "I can help you prepare lessons, exercises and assessments.", admin: "I can help you analyse and document the platform.", offline: "The MOÏSE service is temporarily unavailable.", login: "Sign in to use MOÏSE.", sending: "MOÏSE is thinking…", error: "Unable to send the message. Please try again.", limit: "Your message is too long.", attach: "Attach a PDF or image", removeFile: "Remove file", fileType: "Unsupported format. Use a PDF or image.", fileLimit: "The file must not exceed 2 MB." },
  pt: { title: "MOÏSE", subtitle: "O seu assistente inteligente no NEXUS SCIENCE", placeholder: "Faça uma pergunta ao MOÏSE…", send: "Enviar", newChat: "Nova conversa", welcome: "Olá! Sou o MOÏSE. Como posso ajudar hoje?", student: "Posso ajudar a compreender as aulas, rever e resolver exercícios.", teacher: "Posso ajudar a preparar aulas, exercícios e avaliações.", admin: "Posso ajudar a analisar e documentar a plataforma.", offline: "O serviço MOÏSE está temporariamente indisponível.", login: "Inicie sessão para utilizar o MOÏSE.", sending: "MOÏSE está a pensar…", error: "Não foi possível enviar a mensagem. Tente novamente.", limit: "A sua mensagem é demasiado longa.", attach: "Anexar PDF ou imagem", removeFile: "Remover ficheiro", fileType: "Formato não suportado. Utilize PDF ou imagem.", fileLimit: "O ficheiro não pode exceder 2 MB." },
  es: { title: "MOÏSE", subtitle: "Tu asistente inteligente en NEXUS SCIENCE", placeholder: "Haz una pregunta a MOÏSE…", send: "Enviar", newChat: "Nueva conversación", welcome: "¡Hola! Soy MOÏSE. ¿Cómo puedo ayudarte hoy?", student: "Puedo ayudarte a comprender las lecciones, repasar y resolver ejercicios.", teacher: "Puedo ayudarte a preparar lecciones, ejercicios y evaluaciones.", admin: "Puedo ayudarte a analizar y documentar la plataforma.", offline: "El servicio MOÏSE no está disponible temporalmente.", login: "Inicia sesión para utilizar MOÏSE.", sending: "MOÏSE está pensando…", error: "No se pudo enviar el mensaje. Inténtalo de nuevo.", limit: "Tu mensaje es demasiado largo.", attach: "Adjuntar PDF o imagen", removeFile: "Quitar archivo", fileType: "Formato no compatible. Usa PDF o imagen.", fileLimit: "El archivo no debe superar 2 MB." },
};

export default function MoiseAssistant({ role, accessToken }: { role: Role; accessToken: string }) {
  const language = useLanguage();
  const t = copy[language];
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    setConnected(null);
    setError("");
    void (async () => {
      try {
        const response = await fetch(apiBase + "/nexus/chat/status", { headers: { Authorization: "Bearer " + accessToken } });
        const result = await response.json().catch(() => ({})) as { connected?: boolean; error?: string };
        if (!response.ok) {
          if (active) { setConnected(false); setError(result.error || `Erreur de connexion MOÏSE (HTTP ${response.status}).`); }
          return;
        }
        if (active) {
          setConnected(result.connected === true);
          if (result.connected !== true) setError("Le fournisseur IA n'est pas configuré sur ce serveur.");
        }
      } catch {
        if (active) { setConnected(false); setError("Impossible de joindre le serveur MOÏSE (réseau ou CORS)."); }
      }
    })();
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    const selectedFile = pendingAttachment;
    if ((!text && !selectedFile) || sending) return;
    if (text.length > 8000) { setError(t.limit); return; }
    setError("");
    setDraft("");
    const userMessage: Message = { role: "user", content: text, id: String(Date.now()) + "-user", ...(selectedFile ? { attachment: { name: selectedFile.name, mimeType: selectedFile.type } } : {}) };
    const assistantId = String(Date.now()) + "-assistant";
    const next = [...messages, userMessage];
    setMessages([...next, { role: "assistant", content: "", id: assistantId }]);
    setSending(true);
    try {
      if (!accessToken) throw new Error(t.login);
      const payloadMessages: Array<{ role: "user" | "assistant"; content: string; attachment?: { name: string; mimeType: string; dataUrl: string } }> =
        next.map(({ role: messageRole, content }) => ({ role: messageRole, content }));
      if (selectedFile) {
        payloadMessages[payloadMessages.length - 1].attachment = {
          name: selectedFile.name,
          mimeType: selectedFile.type,
          dataUrl: await readFileAsDataUrl(selectedFile),
        };
      }
      const response = await fetch(apiBase + "/nexus/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
        body: JSON.stringify({ messages: payloadMessages }),
      });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || t.error);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let received = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          const packet = JSON.parse(raw) as { type?: string; text?: string; error?: string; content?: string };
          if (packet.type === "delta" && packet.text) {
            received += packet.text;
            setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: received } : item));
          } else if (packet.type === "error") {
            throw new Error(packet.error || t.error);
          } else if (packet.type === "done" && typeof packet.content === "string") {
            received = packet.content;
          }
        }
      }
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: received || t.error } : item));
      setPendingAttachment(null);
    } catch (cause) {
      setMessages((current) => current.filter((item) => item.id !== assistantId));
      setError(cause instanceof Error ? cause.message : t.error);
      setDraft(text);
    } finally { setSending(false); }
  };

  const roleDescription = role === "student" ? t.student : role === "teacher" ? t.teacher : t.admin;
  return (
    <section className="moise-assistant" aria-labelledby="moise-assistant-title">
      <header className="moise-assistant-header">
        <div><span className="moise-assistant-mark" aria-hidden="true">✦</span><div><h2 id="moise-assistant-title">{t.title}</h2><p>{t.subtitle}</p></div></div>
        <button type="button" className="moise-new-chat" onClick={() => { setMessages([]); setPendingAttachment(null); setError(""); }}>{t.newChat}</button>
      </header>
      <div className="moise-assistant-intro"><strong>{roleDescription}</strong></div>
      <div className="moise-message-list" aria-live="polite">
        {messages.length === 0 && <div className="moise-welcome"><strong>{t.welcome}</strong><p>{roleDescription}</p></div>}
        {messages.map((message) => <article className={"moise-message " + message.role} key={message.id}><span>{message.role === "user" ? "Vous" : "MOÏSE"}</span>{message.attachment && <small className="moise-message-attachment">📎 {message.attachment.name}</small>}<p>{message.content || (sending && message.role === "assistant" ? t.sending : "")}</p></article>)}
        <div ref={bottomRef} />
      </div>
      {connected === false && <p className="moise-assistant-error" role="status">{t.offline}</p>}
      {error && <p className="moise-assistant-error" role="alert">{error}</p>}
      <form className="moise-assistant-form" onSubmit={send}>
        <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" hidden disabled={sending || connected === false} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!allowedFiles.has(file.type)) { setError(t.fileType); return; } if (file.size > maxFileBytes) { setError(t.fileLimit); return; } setError(""); setPendingAttachment(file); }} />
        <div className="moise-composer-main">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t.placeholder} rows={2} disabled={sending || connected === false} />
          <div className="moise-composer-actions">
            <button type="button" className="moise-attach" onClick={() => fileInputRef.current?.click()} disabled={sending || connected === false} aria-label={t.attach}>＋ {t.attach}</button>
            {pendingAttachment && <span className="moise-pending-file">📎 {pendingAttachment.name} <button type="button" onClick={() => setPendingAttachment(null)} aria-label={t.removeFile}>×</button></span>}
          </div>
        </div>
        <button type="submit" disabled={sending || connected === false || (!draft.trim() && !pendingAttachment)}>{sending ? "…" : t.send}</button>
      </form>
    </section>
  );
}
