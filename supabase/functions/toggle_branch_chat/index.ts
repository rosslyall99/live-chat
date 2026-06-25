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
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  console.log("[toggle_branch_chat] hit");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      console.log("[toggle_branch_chat] missing env", {
        hasUrl: !!SUPABASE_URL,
        hasAnon: !!ANON_KEY,
        hasService: !!SERVICE_ROLE_KEY,
      });
      return json(500, { error: "Missing required env vars (URL/ANON/SERVICE_ROLE)" });
    }

    // 1) Identify caller using ANON client + incoming Authorization header
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });

    const { data: auth, error: authErr } = await authClient.auth.getUser();
    if (authErr || !auth?.user) {
      console.log("[toggle_branch_chat] auth failed", authErr);
      return json(401, { error: "Unauthorized" });
    }
    const userId = auth.user.id;

    // 2) Parse body
    const body = await req.json().catch(() => ({}));
    const enabled = body?.enabled;
    if (typeof enabled !== "boolean") {
      return json(400, { error: "Body must be { enabled: boolean }" });
    }

    // 3) Privileged DB ops using SERVICE ROLE client (no user JWT override)
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 4) Confirm staff profile exists + active
    const { data: profile, error: profErr } = await svc
      .from("staff_profiles")
      .select("user_id, site_id, role, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr || !profile) {
      console.log("[toggle_branch_chat] no profile", profErr);
      return json(403, { error: "No staff profile found" });
    }

    if (!profile.is_active) return json(403, { error: "Inactive staff account" });

    // Any active staff role is allowed (agent/manager/admin)
    const siteId = profile.site_id;
    if (!siteId) return json(400, { error: "Profile missing site_id" });

    // 5) Update their site only
    const { data: updated, error: upErr } = await svc
      .from("chat_settings")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("site_id", siteId)
      .select("site_id, enabled, global_enabled")
      .single();

    if (upErr) {
      console.log("[toggle_branch_chat] update error", upErr);
      return json(500, { error: upErr.message });
    }

    // 6) Log
    const { error: logErr } = await svc.from("chat_kill_switch_log").insert({
      scope: "branch",
      site_id: siteId,
      new_state: enabled,
      changed_by: userId,
    });

    if (logErr) {
      console.log("[toggle_branch_chat] log error", logErr);
      return json(500, { error: logErr.message });
    }

    return json(200, { ok: true, updated });
  } catch (e) {
    console.log("[toggle_branch_chat] crash", e);
    return json(500, { error: String(e) });
  }
});
