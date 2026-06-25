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

function newNonce() {
  // simple, safe nonce
  return crypto.randomUUID().replaceAll("-", "");
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing function secrets" });
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { error: "Missing bearer token" });
    }

    // Validate caller with anon key
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await authClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json(401, { error: "Invalid token" });

    // Service role client
    const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Must be active staff (any role)
    const { data: prof, error: profErr } = await adminDb
      .from("staff_profiles")
      .select("user_id, is_active")
      .eq("user_id", user.id)
      .single();

    if (profErr || !prof) return json(403, { error: "No staff profile" });
    if (!prof.is_active) return json(403, { error: "Inactive staff" });

    const nonce = newNonce();

    const { error: upErr } = await adminDb
      .from("staff_profiles")
      .update({ session_nonce: nonce })
      .eq("user_id", user.id);

    if (upErr) return json(500, { error: "Failed to update session" });

    return json(200, { ok: true, session_nonce: nonce });
  } catch (e) {
    return json(500, { error: "Unhandled error", detail: String((e as any)?.message || e) });
  }
});
