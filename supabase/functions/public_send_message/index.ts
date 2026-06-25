// supabase/functions/public_send_message/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getChatAvailability,
  type SiteId,
} from "../_shared/chatAvailability.ts";

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

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

function text(body: string, status: number, cors: Record<string, string>) {
  return new Response(body, { status, headers: { ...cors } });
}

serve(async (req) => {
  const cors = makeCorsHeaders(req);

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return text("Method not allowed", 405, cors);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return text("Missing env vars", 500, cors);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({} as any));
    const conversation_id = String(body.conversation_id || "").trim();
    const customer_token = String(body.customer_token || "").trim();
    const message = String(body.message || "").trim();

    if (!conversation_id) return text("conversation_id required", 400, cors);
    if (!customer_token) return text("customer_token required", 400, cors);
    if (!message) return text("message required", 400, cors);

    // Validate token + load convo site_id
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, status, customer_token, site_id")
      .eq("id", conversation_id)
      .maybeSingle();

    if (convoErr) return text(`Conversation lookup failed: ${convoErr.message}`, 500, cors);
    if (!convo) return text("Conversation not found", 404, cors);

    if (String(convo.customer_token) !== customer_token) {
      return text("Forbidden", 403, cors);
    }

    console.log("[public_send_message] convo status check", {
      conversation_id,
      status: convo.status,
      site_id: convo.site_id,
    });

    // Optional: block sending into closed convos
    if (convo.status && convo.status !== "open") {
      return json(
        {
          ok: false,
          code: "conversation_closed",
          status: convo.status,
        },
        409,
        cors,
      );
    }

    // Enforce branch/global kill switches, but allow existing open conversations
    // to continue through manual offline and out-of-hours states.
    const siteId = String(convo.site_id || "").trim();
    if (!siteId) return text("Conversation missing site_id", 500, cors);

    const availability = await getChatAvailability(supabase, siteId as SiteId);

    console.log("[public_send_message] availability check", {
      conversation_id,
      site_id: siteId,
      availability,
    });

    if (
      availability.mode !== "live" &&
      (availability.reason === "global_disabled" || availability.reason === "branch_disabled")
    ) {
      return json(availability, 409, cors);
    }

    // Insert message + return created_at for UI
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        sender_type: "customer",
        body: message,
      })
      .select("id, created_at")
      .single();

    if (msgErr) return text(`Message create failed: ${msgErr.message}`, 500, cors);

    // Update last_message_at (don't fail if this update errors)
    const { error: updErr } = await supabase
      .from("conversations")
      .update({ last_message_at: msg.created_at })
      .eq("id", conversation_id);

    if (updErr) console.error("[public_send_message] last_message_at update failed:", updErr);

    return json({ ok: true, message_id: msg.id, created_at: msg.created_at }, 200, cors);
  } catch (e) {
    return text(String(e), 500, cors);
  }
});
