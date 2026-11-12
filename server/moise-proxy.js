export async function proxyMoise(req, res, upstreamPath, allowedMethod) {
  if (req.method !== allowedMethod) {
    res.setHeader("Allow", allowedMethod);
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "A valid NEXUS session is required." }));
    return;
  }

  const upstreamOrigin = process.env.MOISE_PREVIEW_URL;
  const bypassSecret = process.env.MOISE_VERCEL_PROTECTION_BYPASS_SECRET;
  if (!upstreamOrigin || !bypassSecret) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: "The MOÏSE preview proxy is not configured." }));
    return;
  }

  const headers = {
    Authorization: authorization,
    "x-vercel-protection-bypass": bypassSecret,
    Accept: allowedMethod === "POST" ? "text/event-stream" : "application/json",
  };
  let body;
  if (allowedMethod === "POST") {
    const contentType = req.headers["content-type"] || "";
    if (!String(contentType).toLowerCase().includes("application/json")) {
      res.statusCode = 415;
      res.end(JSON.stringify({ error: "Content-Type must be application/json." }));
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        res.statusCode = 413;
        res.end(JSON.stringify({ error: "Request body too large." }));
        return;
      }
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks);
    headers["Content-Type"] = "application/json";
  }

  try {
    const upstream = await fetch(upstreamOrigin.replace(/\/$/, "") + "/api" + upstreamPath, {
      method: allowedMethod,
      headers,
      body,
      redirect: "manual",
    });

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
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise((resolve) => res.once("drain", resolve));
        }
      }
      res.end();
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: "The MOÏSE service connection was interrupted." }));
      } else {
        res.end();
      }
    }
  } catch {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Unable to reach the MOÏSE preview service." }));
    } else {
      res.end();
    }
  }
}
