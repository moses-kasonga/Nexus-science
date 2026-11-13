import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FEEDBACK_FROM_EMAIL");

  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Configuration ou session manquante." }, 401);
  }
  if (!resendKey || !fromEmail) {
    return json({ error: "L'envoi d'e-mails n'est pas encore configuré. Les messages restent enregistrés dans NEXUS SCIENCE." }, 503);
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
  if (!messageId || !subject || subject.length > 160 || !body || body.length < 3 || body.length > 10000) {
    return json({ error: "Destinataire, objet ou message invalide." }, 400);
  }

  const { data: original, error: originalError } = await service
    .from("feedback_messages")
    .select("id, student_id, sender_role, reply_to_id, subject")
    .eq("id", messageId).maybeSingle();
  if (originalError || !original || original.sender_role !== "student" || original.reply_to_id) {
    return json({ error: "Message initial introuvable." }, 404);
  }

  const { data: student, error: studentError } = await service.auth.admin.getUserById(original.student_id);
  const recipient = student.user?.email;
  if (studentError || !recipient) return json({ error: "Adresse e-mail de l'élève introuvable." }, 422);

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172b3a;white-space:pre-wrap">${escapeHtml(body).replace(/\n/g, "<br>")}<hr><p style="color:#64748b;font-size:12px">Réponse de l'administration NEXUS SCIENCE au sujet de : ${escapeHtml(original.subject)}</p></div>`;
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to: [recipient], subject, text: body, html }),
  });
  if (!emailResponse.ok) {
    const detail = await emailResponse.text();
    console.error("Resend error", emailResponse.status, detail);
    return json({ error: "Le fournisseur d'e-mail n'a pas accepté l'envoi. Aucun envoi n'a été confirmé." }, 502);
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
