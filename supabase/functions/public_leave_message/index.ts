import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { Resend } from "npm:resend";

export const config = { verify_jwt: false };

function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowList = new Set([
    "https://slanjkilts.com",
    "https://www.slanjkilts.com",
  ]);

  const allowOrigin = allowList.has(origin) ? origin : "https://slanjkilts.com";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-credentials": "true",
    "vary": "Origin",
  };
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function text(body: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(body, { status, headers: { ...corsHeaders } });
}

function escapeHtml(value: unknown) {
  const s = String(value ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return text("Method not allowed", 405, corsHeaders);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const TO_EMAIL = Deno.env.get("OFFLINE_EMAIL_TO");
    const FROM_EMAIL = Deno.env.get("OFFLINE_EMAIL_FROM");

    if (!TO_EMAIL || !FROM_EMAIL) {
      return new Response("Missing offline email env vars", { status: 500 });
    }

    if (!RESEND_API_KEY || !TO_EMAIL || !FROM_EMAIL) {
      return text("Missing env vars", 500, corsHeaders);
    }

    const resend = new Resend(RESEND_API_KEY);

    const body = await req.json().catch(() => ({} as any));

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const message = String(body.message || "").trim();

    if (!name) return text("name required", 400, corsHeaders);
    if (!email) return text("email required", 400, corsHeaders);
    if (!message) return text("message required", 400, corsHeaders);

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

    const subject = `Website message from ${name}`;

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
        <h2 style="margin:0 0 12px 0;">Website message</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Message:</strong><br>${safeMessage}</p>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: email,
      subject,
      html,
    });

    if (error) {
      return text(`Email send failed: ${error.message}`, 500, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  } catch (e) {
    return text(String(e), 500, corsHeaders);
  }
});