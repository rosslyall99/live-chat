// supabase/functions/public_set_claim_intent/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Simple UUID check (good enough for input validation)
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SERVICE_ROLE_KEY") ??
      "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(500, {
        error: "Missing function secrets",
        missing: {
          SUPABASE_URL: !SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !SERVICE_ROLE_KEY,
        },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const conversation_id = String(body.conversation_id ?? "").trim();
    const site_id = String(body.site_id ?? "").trim();
    const claiming_by = String(body.claiming_by ?? "").trim();

    if (!conversation_id || !isUuid(conversation_id)) {
      return json(400, { error: "Invalid conversation_id (uuid required)" });
    }
    if (!site_id) return json(400, { error: "Missing site_id" });
    if (!claiming_by) return json(400, { error: "Missing claiming_by" });

    // 30 second TTL
    const expires_at = new Date(Date.now() + 30_000).toISOString();

    const { error } = await supabase
      .from("claim_intents")
      .upsert(
        {
          conversation_id,
          site_id,
          claiming_by,
          expires_at,
        },
        { onConflict: "conversation_id" },
      );

    if (error) {
      return json(500, { error: "Database upsert failed", details: error.message });
    }

    return json(200, { ok: true, conversation_id, expires_at });
  } catch (e) {
    return json(500, { error: "Unhandled exception", details: String(e?.message ?? e) });
  }
});
