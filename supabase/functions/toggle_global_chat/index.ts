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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  console.log("[toggle_global_chat] hit");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      console.log("[toggle_global_chat] missing env", {
        hasUrl: !!SUPABASE_URL,
        hasAnon: !!ANON_KEY,
        hasService: !!SERVICE_ROLE_KEY,
      });
      return json(500, { error: "Missing required env vars (URL/ANON/SERVICE_ROLE)" });
    }

    // 1) Identify caller using ANON client + incoming JWT
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });

    const { data: auth, error: authErr } = await authClient.auth.getUser();
    if (authErr || !auth?.user) {
      console.log("[toggle_global_chat] auth failed", authErr);
      return json(401, { error: "Unauthorized" });
    }
    const userId = auth.user.id;

    // 2) Parse body
    const body = await req.json().catch(() => ({}));
    const global_enabled = body?.global_enabled;
    if (typeof global_enabled !== "boolean") {
      return json(400, { error: "Body must be { global_enabled: boolean }" });
    }

    // 3) Privileged DB ops with service role
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 4) Confirm admin OR manager + active
    const { data: profile, error: profErr } = await svc
      .from("staff_profiles")
      .select("role, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (profErr || !profile) {
      console.log("[toggle_global_chat] no profile", profErr);
      return json(403, { error: "No staff profile found" });
    }

    if (!profile.is_active) return json(403, { error: "Inactive staff account" });

    const role = String(profile.role).toLowerCase();
    const canToggleGlobal = role === "admin" || role === "manager";
    if (!canToggleGlobal) return json(403, { error: "Admin/Manager only" });

    // 5) Fetch all site ids, then update with a WHERE IN (avoids “unrestricted update”)
    const { data: sites, error: sitesErr } = await svc.from("sites").select("id");

    if (sitesErr) {
      console.log("[toggle_global_chat] sites read error", sitesErr);
      return json(500, { error: sitesErr.message });
    }

    const siteIds = (sites || []).map((s) => s.id).filter(Boolean);
    if (siteIds.length === 0) return json(500, { error: "No sites found" });

    const { error: upErr } = await svc
      .from("chat_settings")
      .update({ global_enabled, updated_at: new Date().toISOString() })
      .in("site_id", siteIds);

    if (upErr) {
      console.log("[toggle_global_chat] update error", upErr);
      return json(500, { error: upErr.message });
    }

    // 6) Log
    const { error: logErr } = await svc.from("chat_kill_switch_log").insert({
      scope: "global",
      site_id: null,
      new_state: global_enabled,
      changed_by: userId,
    });

    if (logErr) {
      console.log("[toggle_global_chat] log error", logErr);
      return json(500, { error: logErr.message });
    }

    console.log("[toggle_global_chat] ok", { global_enabled, siteCount: siteIds.length });
    return json(200, { ok: true, global_enabled });
  } catch (e) {
    console.log("[toggle_global_chat] crash", e);
    return json(500, { error: String(e) });
  }
});
