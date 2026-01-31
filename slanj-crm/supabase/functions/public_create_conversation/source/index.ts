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
    const site_id = String(body.site_id || "").trim(); // 'duke' | 'sten' | 'off'
    const customer_name = String(body.customer_name || "").trim();
    const customer_email = body.customer_email ? String(body.customer_email).trim() : null;
    const first_message = String(body.message || "").trim();

    if (!["duke", "sten", "off"].includes(site_id)) {
      return new Response("Invalid site_id", { status: 400 });
    }
    if (!customer_name || customer_name.length < 2) {
      return new Response("customer_name required", { status: 400 });
    }
    if (!first_message || first_message.length < 1) {
      return new Response("message required", { status: 400 });
    }

    // Fetch site name for Teams title
    const { data: site, error: siteErr } = await supabase
      .from("sites")
      .select("id,name")
      .eq("id", site_id)
      .single();

    if (siteErr) return new Response(`Site lookup failed: ${siteErr.message}`, { status: 500 });

    // Create conversation
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .insert({
        site_id,
        customer_name,
        customer_email,
        status: "open",
      })
      .select("id, customer_token")
      .single();

    if (convoErr) return new Response(`Conversation create failed: ${convoErr.message}`, { status: 500 });

    // Insert first message
    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: convo.id,
      sender_type: "customer",
      body: first_message,
    });

    if (msgErr) return new Response(`Message create failed: ${msgErr.message}`, { status: 500 });

    // Notify Teams
    const conversationUrl = APP_BASE_URL ? `${APP_BASE_URL}/chat/${convo.id}` : "";
    const teamsBody = {
      text:
        `**New Live Chat — ${site.name}**\n\n` +
        `**From:** ${customer_name}\n\n` +
        `**Message:** ${snippet(first_message)}\n\n` +
        (conversationUrl ? `${conversationUrl}` : ""),
    };

    const r = await fetch(TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(teamsBody),
    });

    if (!r.ok) {
      const err = await r.text();
      // Don’t fail the customer if Teams is down; return success but log-worthy message
      console.error("Teams webhook failed:", r.status, err);
    }

    return new Response(
      JSON.stringify({
        conversation_id: convo.id,
        customer_token: convo.customer_token,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
