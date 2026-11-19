const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function sendJson(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  for (const [name, value] of Object.entries({ ...JSON_HEADERS, ...extraHeaders })) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
}

// Log only the failing stage, HTTP status, and error class. Never log credentials or response bodies.
function logSupabaseFailure(stage, status, error) {
  console.warn("[moise-proxy] Supabase request failed", {
    stage,
    status: Number.isInteger(status) ? status : null,
    error: error && typeof error.name === "string" ? error.name : undefined,
  });
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

/** Vérifie auprès de Supabase que le jeton correspond à un compte réel. */
async function verifySession(config, authorization) {
  try {
    const response = await fetch(config.url + "/auth/v1/user", {
      headers: { Authorization: authorization, apikey: config.key },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) {
      logSupabaseFailure("auth_verify", response.status);
      return "invalid";
    }
    if (!response.ok) {
      logSupabaseFailure("auth_verify", response.status);
      return "unavailable";
    }
    const user = await response.json().catch(() => null);
    return user && typeof user.id === "string" ? "valid" : "invalid";
  } catch (error) {
    logSupabaseFailure("auth_verify", null, error);
    return "unavailable";
  }
}

/** Décompte un message dans le quota du jour via consume_moise_quota. */
async function consumeQuota(config, authorization) {
  const limit = Number.parseInt(process.env.MOISE_DAILY_LIMIT || "", 10);
  try {
    const response = await fetch(config.url + "/rest/v1/rpc/consume_moise_quota", {
      method: "POST",
      headers: { Authorization: authorization, apikey: config.key, "Content-Type": "application/json" },
      body: JSON.stringify(Number.isFinite(limit) ? { p_limit: limit } : {}),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) {
      logSupabaseFailure("quota_rpc", response.status);
      return "auth_rejected";
    }
    if (!response.ok) {
      logSupabaseFailure("quota_rpc", response.status);
      return "unavailable";
    }
    const result = await response.json().catch(() => null);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row || typeof row.is_allowed !== "boolean") {
      logSupabaseFailure("quota_rpc_invalid_response", response.status);
      return "unavailable";
    }
    return row.is_allowed ? "allowed" : "exceeded";
  } catch (error) {
    logSupabaseFailure("quota_rpc", null, error);
    return "unavailable";
  }
}

function secondsUntilUtcMidnight() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

export async function proxyMoise(req, res, upstreamPath, allowedMethod) {
  if (req.method !== allowedMethod) {
    sendJson(res, 405, { error: "Method not allowed.", code: "method_not_allowed" }, { Allow: allowedMethod });
    return;
  }

  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
    sendJson(res, 401, { error: "A valid NEXUS session is required.", code: "invalid_session" });
    return;
  }

  const upstreamOrigin = process.env.MOISE_PREVIEW_URL;
  const bypassSecret = process.env.MOISE_VERCEL_PROTECTION_BYPASS_SECRET;
  if (!upstreamOrigin || !bypassSecret) {
    sendJson(res, 503, { error: "The MOÏSE proxy is not configured.", code: "not_configured" });
    return;
  }

  const supabase = supabaseConfig();
  if (!supabase) {
    sendJson(res, 503, { error: "The MOÏSE proxy cannot verify sessions (Supabase settings missing).", code: "not_configured" });
    return;
  }
  const requestStartedAt = Date.now();
  const authStartedAt = Date.now();
  const session = await verifySession(supabase, authorization);
  console.info("[moise-proxy] stage timing", { stage: "nexus_auth", durationMs: Date.now() - authStartedAt });
  if (session === "invalid") {
    sendJson(res, 401, { error: "A valid NEXUS session is required.", code: "invalid_session" });
    return;
  }
  if (session === "unavailable") {
    sendJson(res, 503, { error: "Session verification is temporarily unavailable.", code: "auth_unavailable" });
    return;
  }

  const headers = {
    Authorization: authorization,
    "x-vercel-protection-bypass": bypassSecret,
    "x-nexus-apikey": supabase.key,
    Accept: allowedMethod === "POST" ? "text/event-stream" : "application/json",
  };
  let body;
  if (allowedMethod === "POST") {
    const contentType = req.headers["content-type"] || "";
    if (!String(contentType).toLowerCase().includes("application/json")) {
      sendJson(res, 415, { error: "Content-Type must be application/json.", code: "unsupported_media_type" });
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        sendJson(res, 413, { error: "Request body too large.", code: "body_too_large" });
        return;
      }
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
    headers["Content-Type"] = "application/json";

    const quotaStartedAt = Date.now();
    const quota = await consumeQuota(supabase, authorization);
    console.info("[moise-proxy] stage timing", { stage: "daily_quota", durationMs: Date.now() - quotaStartedAt });
    if (quota === "auth_rejected") {
      sendJson(res, 502, { error: "Supabase rejected authorization for the quota check.", code: "quota_auth_rejected" });
      return;
    }
    if (quota === "exceeded") {
      sendJson(res, 429, { error: "Daily MOÏSE message limit reached.", code: "quota_exceeded" }, { "Retry-After": String(secondsUntilUtcMidnight()) });
      return;
    }
    if (quota === "unavailable") {
      sendJson(res, 503, { error: "The usage quota is temporarily unavailable.", code: "quota_unavailable" });
      return;
    }
  }

  try {
    const upstreamStartedAt = Date.now();
    const upstream = await fetch(upstreamOrigin.replace(/\/$/, "") + "/api" + upstreamPath, {
      method: allowedMethod,
      headers,
      body,
      redirect: "manual",
    });

    console.info("[moise-proxy] stage timing", { stage: "upstream_headers", durationMs: Date.now() - upstreamStartedAt, status: upstream.status, elapsedMs: Date.now() - requestStartedAt });
    res.statusCode = upstream.status;
    const responseType = upstream.headers.get("content-type");
    if (responseType) res.setHeader("Content-Type", responseType);
    res.setHeader("Cache-Control", "no-store");
    if (allowedMethod === "POST") {
      res.setHeader("X-Accel-Buffering", "no");
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    let firstChunkLogged = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!firstChunkLogged) {
          firstChunkLogged = true;
          console.info("[moise-proxy] stage timing", { stage: "first_upstream_chunk", elapsedMs: Date.now() - requestStartedAt });
        }
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once("drain", resolve));
        }
      }
      res.end();
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (!res.headersSent) {
        sendJson(res, 502, { error: "The MOÏSE service connection was interrupted.", code: "upstream_interrupted" });
      } else {
        try {
          if (String(responseType || "").includes("text/event-stream")) {
            res.write(`data: ${JSON.stringify({ type: "error", error: "La connexion avec MOÏSE a été interrompue." })}\n\n`);
          }
        } finally {
          res.end();
        }
      }
    }
  } catch {
    if (!res.headersSent) {
      sendJson(res, 502, { error: "Unable to reach the MOÏSE service.", code: "upstream_unreachable" });
    } else {
      try {
        if (String(res.getHeader("Content-Type") || "").includes("text/event-stream")) {
          res.write(`data: ${JSON.stringify({ type: "error", error: "La connexion avec MOÏSE a été interrompue." })}\n\n`);
        }
      } finally {
        res.end();
      }
    }
  }
}
