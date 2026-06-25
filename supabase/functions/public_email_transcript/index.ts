// supabase/functions/public_email_transcript/index.ts
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

function text(body: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(body, { status, headers: { ...corsHeaders } });
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const TRANSCRIPT_FROM_EMAIL =
      Deno.env.get("TRANSCRIPT_FROM_EMAIL") || "Slanj Kilts <chat@slanjkilts.com>";
    const TRANSCRIPT_REPLY_TO = Deno.env.get("TRANSCRIPT_REPLY_TO") || "info@slanjkilts.com";

    if (!RESEND_API_KEY) {
      return text("Missing RESEND_API_KEY", 500, corsHeaders);
    }

    const resend = new Resend(RESEND_API_KEY);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const email = String(body.email || "").trim();
    const transcript = String(body.transcript || "").trim();

    if (!email || !isValidEmail(email)) {
      return text("Valid email required", 400, corsHeaders);
    }

    if (!transcript) {
      return text("Transcript required", 400, corsHeaders);
    }

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.5;">
        <h2 style="margin:0 0 12px 0;">Your Slanj Kilts chat transcript</h2>
        <p style="margin:0 0 16px 0;">
          Thanks for chatting with us. Your transcript is below.
        </p>
        <div style="padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;white-space:pre-wrap;">${
          escapeHtml(transcript)
        }</div>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: TRANSCRIPT_FROM_EMAIL,
      to: [email],
      replyTo: TRANSCRIPT_REPLY_TO,
      subject: "Your Slanj Kilts chat transcript",
      text: `Thanks for chatting with us.\n\nYour transcript is below:\n\n${transcript}`,
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