// supabase/functions/public_offline_message/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function snippet(text: string, max = 160) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function escapeHtml(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2br(s: string) {
  return escapeHtml(s).replaceAll("\n", "<br/>");
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const OFFLINE_EMAIL_TO = Deno.env.get("OFFLINE_EMAIL_TO")!;
    const OFFLINE_EMAIL_FROM =
      Deno.env.get("OFFLINE_EMAIL_FROM") || "Slanj Live Chat <noreply@slanjkilts.com>";
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !RESEND_API_KEY || !OFFLINE_EMAIL_TO) {
      return new Response("Missing env vars", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json();
    const site_id = String(body.site_id || "").trim(); // 'duke' | 'sten' | 'off'
    const customer_name = String(body.customer_name || "").trim();
    const customer_email = body.customer_email ? String(body.customer_email).trim() : null;
    const message = String(body.message || "").trim();

    if (!["duke", "sten", "off"].includes(site_id)) {
      return new Response("Invalid site_id", { status: 400 });
    }
    if (!customer_name || customer_name.length < 2) {
      return new Response("customer_name required", { status: 400 });
    }
    if (!message) {
      return new Response("message required", { status: 400 });
    }

    // Fetch site name (for email subject)
    const { data: site, error: siteErr } = await supabase
      .from("sites")
      .select("id,name")
      .eq("id", site_id)
      .single();

    if (siteErr) return new Response(`Site lookup failed: ${siteErr.message}`, { status: 500 });

    // Create conversation (Option A: represent offline by leaving assigned_to NULL)
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .insert({
        site_id,
        customer_name,
        customer_email,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select("id, customer_token")
      .single();

    if (convoErr) return new Response(`Conversation create failed: ${convoErr.message}`, { status: 500 });

    // Insert message
    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: convo.id,
      sender_type: "customer",
      body: message,
    });

    if (msgErr) return new Response(`Message create failed: ${msgErr.message}`, { status: 500 });

    // Email via Resend
    const subject = `Offline message — ${site.name} — ${customer_name}`;
    const conversationUrl = ""; //APP_BASE_URL ? `${APP_BASE_URL}/chat/${convo.id}` : "";

    const html =
      `<p><strong>Site:</strong> ${escapeHtml(site.name)}</p>` +
      `<p><strong>From:</strong> ${escapeHtml(customer_name)}${
        customer_email ? ` (${escapeHtml(customer_email)})` : ""
      }</p>` +
      `<p><strong>Message:</strong><br/>${nl2br(message)}</p>` +
      (conversationUrl
        ? `<p><strong>Open in CRM:</strong> <a href="${escapeHtml(conversationUrl)}">${escapeHtml(
            conversationUrl,
          )}</a></p>`
        : `<p><strong>Conversation ID:</strong> ${escapeHtml(convo.id)}</p>`);

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: OFFLINE_EMAIL_FROM,
        to: OFFLINE_EMAIL_TO,
        subject,
        html,
      }),
    });

    if (!resendResp.ok) {
      const err = await resendResp.text();
      console.error("Resend failed:", resendResp.status, err);
      // Don't fail the customer if email fails — conversation/message is stored.
    }

    return new Response(JSON.stringify({ ok: true, conversation_id: convo.id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
