import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function safeLimit(n: any, def = 50, max = 200) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return def;
  return Math.min(max, Math.floor(x));
}

serve(async (req) => {
  const cors = makeCorsHeaders(req);

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return text("Method not allowed", 405, cors);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return text("Missing env vars", 500, cors);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({} as any));
    const conversation_id = String(body.conversation_id || "").trim();
    const customer_token = String(body.customer_token || "").trim();
    const after = body.after ? String(body.after).trim() : null; // ISO timestamp (recommended)
    const limit = safeLimit(body.limit, 50, 200);

    if (!conversation_id) return text("conversation_id required", 400, cors);
    if (!customer_token) return text("customer_token required", 400, cors);

    // Validate token
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, customer_token")
      .eq("id", conversation_id)
      .maybeSingle();

    if (convoErr) return text(`Conversation lookup failed: ${convoErr.message}`, 500, cors);
    if (!convo) return text("Conversation not found", 404, cors);

    if (String(convo.customer_token) !== customer_token) {
      return text("Forbidden", 403, cors);
    }

    // Fetch messages (optionally after a timestamp)
    let q = supabase
      .from("messages")
      .select("id, sender_type, sender_user_id, body, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (after) q = q.gt("created_at", after);

    const { data: msgs, error: msgErr } = await q;

    if (msgErr) return text(`Messages fetch failed: ${msgErr.message}`, 500, cors);

    return json(
      {
        ok: true,
        messages: (msgs || []).map((m) => ({
          id: m.id,
          sender_type: m.sender_type,
          body: m.body,
          created_at: m.created_at,
        })),
      },
      200,
      cors,
    );
  } catch (e) {
    return text(String(e), 500, cors);
  }
});
