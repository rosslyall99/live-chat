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
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
      return json(500, {
        error: "Missing function secrets",
        missing: {
          SUPABASE_URL: !SUPABASE_URL,
          SUPABASE_ANON_KEY: !ANON_KEY,
          SERVICE_ROLE_KEY: !SERVICE_ROLE_KEY,
        },
      });
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { error: "Missing bearer token" });
    }

    // 1) Validate caller token using anon key
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await authClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      // avoid leaking details in prod
      // console.error("Invalid token:", userErr);
      return json(401, { error: "Invalid token" });
    }

    // 2) Admin DB client (service role)
    const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3) Check caller is active admin
    const { data: profile, error: profErr } = await adminDb
      .from("staff_profiles")
      .select("user_id, role, is_active")
      .eq("user_id", user.id)
      .single();

    if (profErr || !profile) {
      // console.error("No staff profile:", profErr);
      return json(403, { error: "No staff profile" });
    }
    if (!profile.is_active) return json(403, { error: "Inactive staff" });
    if (profile.role !== "admin") return json(403, { error: "Admins only" });

    // 4) List ALL staff
    const { data, error } = await adminDb
      .from("staff_profiles")
      .select(
        "user_id, username, display_name, site_id, role, is_active, created_at, rota_match_name, rota_branch, login_group",
      )
      .order("created_at", { ascending: false });

    if (error) {
      // console.error("List staff error:", error);
      return json(500, { error: "Database error" });
    }

    return json(200, { staff: data || [] });
  } catch (e) {
    // console.error("Unhandled:", e);
    return json(500, { error: "Unhandled error" });
  }
});
