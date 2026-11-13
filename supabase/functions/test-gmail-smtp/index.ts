import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@^9";

const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://nexus-science-rho.vercel.app";
const allowedOrigins = new Set(
  (Deno.env.get("APP_ALLOWED_ORIGINS") ?? appOrigin)
    .split(",").map((value) => value.trim()).filter(Boolean),
);

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : appOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const respond = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return respond({ error: "Méthode non autorisée." }, 405, origin);

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const smtpHost = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
  const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPass = Deno.env.get("SMTP_PASS");
  const fromEmail = Deno.env.get("FEEDBACK_FROM_EMAIL") ?? smtpUser;

  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey || !serviceKey) {
    return respond({ error: "Session ou configuration Supabase manquante." }, 401, origin);
  }
  if (!smtpUser || !smtpPass || !fromEmail || fromEmail.toLowerCase() !== smtpUser.toLowerCase() ||
      !smtpHost || ![465, 587].includes(smtpPort)) {
    return respond({ error: "Configuration SMTP incomplète." }, 503, origin);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.slice(7);
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return respond({ error: "Session invalide." }, 401, origin);

  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") {
    return respond({ error: "Réservé aux administrateurs." }, 403, origin);
  }

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
    await transporter.verify();
    const checkedAt = new Date().toISOString();
    const info = await transporter.sendMail({
      from: { name: "NEXUS SCIENCE | NO REPLY", address: fromEmail },
      to: smtpUser,
      subject: "Test de connexion Gmail SMTP — NEXUS SCIENCE",
      text: [
        "Le test SMTP de NEXUS SCIENCE a réussi.",
        "",
        "Cette fonction de test est isolée et envoie uniquement à l'adresse SMTP configurée.",
        "Aucune réponse d'élève n'a été envoyée et aucune donnée de feedback n'a été modifiée.",
        "",
        `Vérification effectuée : ${checkedAt}`,
      ].join("\n"),
    });

    return respond({
      ok: true,
      message: "Connexion SMTP vérifiée et e-mail de test accepté par Gmail.",
      recipient: smtpUser,
      messageId: info.messageId,
      checkedAt,
    }, 200, origin);
  } catch (error) {
    console.error("Isolated SMTP test failed:", error instanceof Error ? error.message : "Unknown SMTP error");
    return respond({
      error: "Le test SMTP a échoué. Consultez les journaux de cette fonction pour le détail technique.",
    }, 502, origin);
  } finally {
    transporter.close();
  }
});
