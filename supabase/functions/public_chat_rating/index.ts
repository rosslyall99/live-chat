// supabase/functions/public_chat_rating/index.ts
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

function text(body: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(body, { status, headers: { ...corsHeaders } });
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return text("Missing env vars", 500, corsHeaders);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const conversation_id = String(body.conversation_id || "").trim();
    const rating = Number(body.rating);
    const commentRaw = String(body.comment || "");
    const comment = commentRaw.trim() || null;

    if (!conversation_id) {
      return text("conversation_id required", 400, corsHeaders);
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return text("rating must be an integer between 1 and 5", 400, corsHeaders);
    }

    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversation_id)
      .maybeSingle();

    if (convoErr) {
      return text(`Conversation lookup failed: ${convoErr.message}`, 500, corsHeaders);
    }

    if (!convo) {
      return text("Conversation not found", 404, corsHeaders);
    }

    const { error: insertErr } = await supabase
      .from("chat_ratings")
      .upsert({
        conversation_id,
        rating,
        comment,
      });

    if (insertErr) {
      return text(`Rating save failed: ${insertErr.message}`, 500, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  } catch (e) {
    return text(String(e), 500, corsHeaders);
  }
});