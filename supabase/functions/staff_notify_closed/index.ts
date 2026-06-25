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
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const TEAMS_WEBHOOK_URL = Deno.env.get("TEAMS_WEBHOOK_URL")!;
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

    // Validate staff token
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { error: "Missing bearer token" });
    }
    const jwt = authHeader.split(" ")[1];

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (!authRes.ok) {
      return json(401, { error: "Invalid token" });
    }

    const user = await authRes.json();
    const userId = user?.id;
    if (!userId) return json(401, { error: "No user id" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Confirm active staff
    const { data: staff } = await admin
      .from("staff_profiles")
      .select("display_name, username, is_active")
      .eq("user_id", userId)
      .single();

    if (!staff?.is_active) {
      return json(403, { error: "Not active staff" });
    }

    const { conversation_id } = await req.json();
    if (!conversation_id) {
      return json(400, { error: "conversation_id required" });
    }

    const { data: convo } = await admin
      .from("conversations")
      .select("id, site_id, customer_name")
      .eq("id", conversation_id)
      .single();

    if (!convo) return json(404, { error: "Conversation not found" });

    const { data: site } = await admin
      .from("sites")
      .select("name")
      .eq("id", convo.site_id)
      .single();

    const closedBy = staff.display_name || staff.username || "Staff";
    const conversationUrl = APP_BASE_URL
      ? `${APP_BASE_URL}/chat/${convo.id}`
      : "";

    const teamsBody = {
      text:
        `🔒 **Chat closed — ${site?.name ?? convo.site_id}**\n\n` +
        `**By:** ${closedBy}\n\n` +
        `**Customer:** ${convo.customer_name}\n\n` +
        (conversationUrl ? `${conversationUrl}` : ""),
    };

    await fetch(TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(teamsBody),
    });

    return json(200, { ok: true });
  } catch (e) {
    console.error("staff_notify_closed error", e);
    return json(500, { error: String(e) });
  }
});
