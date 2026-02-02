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

async function requireAdmin(req: Request) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" } as const;
  }
  const jwt = authHeader.split(" ")[1];

  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!authRes.ok) return { ok: false, status: 401, error: "Invalid token" } as const;

  const user = await authRes.json();
  const userId = user?.id as string | undefined;
  if (!userId) return { ok: false, status: 401, error: "No user id" } as const;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: profile } = await admin
    .from("staff_profiles")
    .select("user_id, role, is_active")
    .eq("user_id", userId)
    .single();

  if (!profile?.is_active) return { ok: false, status: 403, error: "Inactive staff" } as const;
  if (profile.role !== "admin") return { ok: false, status: 403, error: "Admins only" } as const;

  return { ok: true, admin } as const;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const gate = await requireAdmin(req);
  if (!gate.ok) return json(gate.status, { error: gate.error });
  const { admin } = gate;

  try {
    const body = await req.json();
    const user_id = String(body.user_id || "");
    if (!user_id) return json(400, { error: "user_id required" });

    const { data, error } = await admin
      .from("staff_profiles")
      .update({ is_active: false })
      .eq("user_id", user_id)
      .select("user_id, username, display_name, site_id, role, is_active, created_at")
      .single();

    if (error) return json(400, { error: error.message });

    return json(200, { ok: true, profile: data });
  } catch (e) {
    console.error("admin_deactivate_staff error", e);
    return json(500, { error: String(e) });
  }
});
