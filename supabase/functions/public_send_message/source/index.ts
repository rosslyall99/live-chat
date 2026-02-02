import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function snippet(text: string, max = 160) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const TEAMS_WEBHOOK_URL = Deno.env.get("TEAMS_WEBHOOK_URL")!;
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !TEAMS_WEBHOOK_URL) {
      return new Response("Missing env vars", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json();
    const conversation_id = String(body.conversation_id || "").trim();
    const customer_token = String(body.customer_token || "").trim();
    const message = String(body.message || "").trim();

    if (!conversation_id || !customer_token) {
      return new Response("conversation_id and customer_token required", { status: 400 });
    }
    if (!message) return new Response("message required", { status: 400 });

    // Validate token + get convo + site name
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, site_id, status, customer_name, customer_token, assigned_to")
      .eq("id", conversation_id)
      .single();

    if (convoErr || !convo) return new Response("Conversation not found", { status: 404 });
    if (String(convo.customer_token) !== customer_token) {
      return new Response("Invalid token", { status: 403 });
    }
    if (convo.status !== "open") {
      return new Response("Conversation is closed", { status: 409 });
    }

    const { data: site } = await supabase
      .from("sites")
      .select("name")
      .eq("id", convo.site_id)
      .single();

    // Insert message
    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id,
      sender_type: "customer",
      body: message,
    });

    if (msgErr) return new Response(`Message create failed: ${msgErr.message}`, { status: 500 });

    // Notify Teams
    const conversationUrl = APP_BASE_URL ? `${APP_BASE_URL}/chat/${conversation_id}` : "";
    const teamsBody = {
      text:
        `**New message — ${site?.name ?? convo.site_id}**\n\n` +
        `**From:** ${convo.customer_name}\n\n` +
        `**Message:** ${snippet(message)}\n\n` +
        (conversationUrl ? `${conversationUrl}` : ""),
    };

    const r = await fetch(TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(teamsBody),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error("Teams webhook failed:", r.status, err);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
