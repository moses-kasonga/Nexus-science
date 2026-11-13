import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@^9";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] ?? char));

const emailCopy = {
  fr: {
    greeting: (name: string) => `Bonjour ${name},`,
    intro: "Notre équipe vient de répondre au message que vous nous avez envoyé sur NEXUS SCIENCE.",
    response: "Réponse de l'équipe NEXUS SCIENCE",
    continue: "Pour répondre à notre équipe et poursuivre cet échange, connectez-vous à votre espace étudiant :",
    button: "Accéder à mon espace étudiant",
    note: "Ceci est un message automatique. Merci de ne pas répondre directement à cet e-mail. Pour toute réponse, utilisez exclusivement votre espace étudiant NEXUS SCIENCE.",
    signature: "L'équipe NEXUS SCIENCE",
  },
  en: {
    greeting: (name: string) => `Hello ${name},`,
    intro: "Our team has replied to the message you sent through NEXUS SCIENCE.",
    response: "Reply from the NEXUS SCIENCE team",
    continue: "To reply to our team and continue this conversation, sign in to your student area:",
    button: "Open my student area",
    note: "This is an automated message. Please do not reply directly to this email. All replies must be sent exclusively from your NEXUS SCIENCE student area.",
    signature: "The NEXUS SCIENCE team",
  },
  pt: {
    greeting: (name: string) => `Olá ${name},`,
    intro: "A nossa equipa respondeu à mensagem que enviou através da NEXUS SCIENCE.",
    response: "Resposta da equipa NEXUS SCIENCE",
    continue: "Para responder à nossa equipa e continuar esta conversa, entre na sua área de estudante:",
    button: "Aceder à minha área de estudante",
    note: "Esta é uma mensagem automática. Por favor, não responda diretamente a este e-mail. Todas as respostas devem ser enviadas exclusivamente através da sua área de estudante NEXUS SCIENCE.",
    signature: "A equipa NEXUS SCIENCE",
  },
  es: {
    greeting: (name: string) => `Hola ${name},`,
    intro: "Nuestro equipo ha respondido al mensaje que enviaste a través de NEXUS SCIENCE.",
    response: "Respuesta del equipo NEXUS SCIENCE",
    continue: "Para responder a nuestro equipo y continuar esta conversación, inicia sesión en tu espacio de estudiante:",
    button: "Acceder a mi espacio de estudiante",
    note: "Este es un mensaje automático. No respondas directamente a este correo electrónico. Todas las respuestas deben enviarse exclusivamente desde tu espacio de estudiante NEXUS SCIENCE.",
    signature: "El equipo NEXUS SCIENCE",
  },
} as const;

type SupportedLanguage = keyof typeof emailCopy;

function getEmailLanguage(value: string | null | undefined): SupportedLanguage {
  return value === "en" || value === "pt" || value === "es" ? value : "fr";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const smtpHost = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
  const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = Deno.env.get("SMTP_PASS");
  const fromEmail = Deno.env.get("FEEDBACK_FROM_EMAIL") ?? smtpUser;
  const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://nexus-science-rho.vercel.app";

  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Configuration ou session manquante." }, 401);
  }
  if (!smtpHost || !smtpUser || !smtpPass || !fromEmail || ![465, 587].includes(smtpPort)) {
    return json({ error: "La configuration SMTP de NEXUS SCIENCE est incomplète." }, 503);
  }

  const token = authorization.slice(7);
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await callerClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Session invalide." }, 401);

  const { data: profile, error: profileError } = await service
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") return json({ error: "Réservé aux administrateurs." }, 403);

  let payload: { message_id?: string; subject?: string; body?: string };
  try { payload = await request.json(); } catch { return json({ error: "Corps de requête invalide." }, 400); }
  const messageId = payload.message_id?.trim();
  const subject = payload.subject?.trim();
  const body = payload.body?.trim();
  if (!messageId || !subject || /[\\r\\n]/.test(subject) || subject.length > 160 || !body || body.length < 3 || body.length > 10000) {
    return json({ error: "Destinataire, objet ou message invalide." }, 400);
  }

  const { data: original, error: originalError } = await service
    .from("feedback_messages")
    .select("id, student_id, sender_role, reply_to_id, subject")
    .eq("id", messageId).maybeSingle();
  if (originalError || !original || original.sender_role !== "student" || original.reply_to_id) {
    return json({ error: "Message initial introuvable." }, 404);
  }

  const [{ data: student, error: studentError }, { data: studentProfile }] = await Promise.all([
    service.auth.admin.getUserById(original.student_id),
    service.from("profiles").select("first_name,last_name,preferred_language").eq("id", original.student_id).maybeSingle(),
  ]);
  const recipient = student.user?.email;
  if (studentError || !recipient) return json({ error: "Adresse e-mail de l'élève introuvable." }, 422);

  const studentName = [studentProfile?.first_name, studentProfile?.last_name].filter(Boolean).join(" ").trim() || "étudiant";
  const language = getEmailLanguage(studentProfile?.preferred_language);
  const copy = emailCopy[language];
  const studentUrl = new URL("/espace-etudiant", appOrigin).toString();
  const safeBody = escapeHtml(body).replace(/\\n/g, "<br>");
  const safeSubject = escapeHtml(original.subject);
  const safeName = escapeHtml(studentName);
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.65;color:#172b3a;max-width:640px;margin:0 auto">
      <p>${escapeHtml(copy.greeting(studentName))}</p>
      <p>${escapeHtml(copy.intro)}</p>
      <div style="margin:24px 0;padding:18px;border:1px solid #dbe4ea;border-radius:12px">
        <p style="margin:0 0 10px;color:#526575;font-size:13px;font-weight:700">${escapeHtml(copy.response)}</p>
        <div style="white-space:normal">${safeBody}</div>
      </div>
      <p>${escapeHtml(copy.continue)}</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(studentUrl)}" style="display:inline-block;padding:12px 20px;background:#173b58;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${escapeHtml(copy.button)}</a>
      </p>
      <p style="color:#64748b;font-size:12px">${escapeHtml(copy.note)}</p>
      <p>${escapeHtml(copy.signature)}</p>
      <hr style="border:0;border-top:1px solid #e2e8f0;margin-top:24px">
      <p style="color:#94a3b8;font-size:11px">${safeSubject}</p>
    </div>`;
  const textBody = [
    copy.greeting(studentName),
    "",
    copy.intro,
    "",
    copy.response + ":",
    body,
    "",
    copy.continue,
    studentUrl,
    "",
    copy.note,
    "",
    copy.signature,
  ].join("\\n");

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  try {
    await transporter.sendMail({
      from: { name: "NEXUS SCIENCE | NO REPLY", address: fromEmail },
      to: recipient,
      subject,
      text: textBody,
      html,
    });
  } catch (error) {
    console.error("SMTP delivery error", error instanceof Error ? error.message : "Unknown SMTP error");
    return json({ error: "L'envoi par Gmail SMTP a échoué. Vérifiez les secrets SMTP et la disponibilité de la connexion." }, 502);
  } finally {
    transporter.close();
  }

  const { data: reply, error: insertError } = await service.from("feedback_messages").insert({
    student_id: original.student_id,
    sender_id: authData.user.id,
    sender_role: "admin",
    subject,
    body,
    reply_to_id: original.id,
    email_sent_at: new Date().toISOString(),
  }).select("id, created_at, email_sent_at").single();

  if (insertError) {
    console.error("Reply persistence error", insertError);
    return json({ error: "L'e-mail a été accepté, mais l'historique n'a pas pu être enregistré. Contactez le support technique." }, 500);
  }
  return json({ ok: true, reply });
});
