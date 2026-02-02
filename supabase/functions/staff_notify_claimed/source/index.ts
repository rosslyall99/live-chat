import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!; // reserved, auto provided
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const TEAMS_WEBHOOK_URL = Deno.env.get("TEAMS_WEBHOOK_URL")!;
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

    // Read bearer token sent by the browser (supabase.functions.invoke includes it)
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { error: "Missing bearer token" });
    }
    const jwt = authHeader.split(" ")[1];

    // Validate token by asking Supabase Auth who this is
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (!authRes.ok) {
      const t = await authRes.text();
      return json(401, { error: "Invalid token", details: t });
    }

    const user = await authRes.json();
    const userId = user?.id;
    if (!userId) return json(401, { error: "No user id returned" });

    // Service role for DB reads
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Confirm active staff
    const { data: staff, error: staffErr } = await admin
      .from("staff_profiles")
      .select("display_name, username, is_active")
      .eq("user_id", userId)
      .single();

    if (staffErr || !staff?.is_active) {
      return json(403, { error: "Not active staff" });
    }

    const body = await req.json();
    const conversation_id = String(body.conversation_id || "").trim();
    if (!conversation_id) return json(400, { error: "conversation_id required" });

    const { data: convo, error: convoErr } = await admin
      .from("conversations")
      .select("id, site_id, customer_name")
      .eq("id", conversation_id)
      .single();

    if (convoErr || !convo) return json(404, { error: "Conversation not found" });

    const { data: site } = await admin
      .from("sites")
      .select("name")
      .eq("id", convo.site_id)
      .single();

    const claimedBy = staff.display_name || staff.username || "Staff";
    const conversationUrl = APP_BASE_URL ? `${APP_BASE_URL}/chat/${convo.id}` : "";

    const teamsBody = {
      text:
        `✅ **Claimed — ${site?.name ?? convo.site_id}**\n\n` +
        `**By:** ${claimedBy}\n\n` +
        `**Customer:** ${convo.customer_name}\n\n` +
        (conversationUrl ? `${conversationUrl}` : ""),
    };

    const r = await fetch(TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(teamsBody),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("Teams webhook failed", r.status, errText);
      // Don't fail the request if Teams fails
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error("staff_notify_claimed error", e);
    return json(500, { error: String(e) });
  }
});
