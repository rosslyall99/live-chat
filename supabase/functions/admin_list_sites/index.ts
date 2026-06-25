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
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" } as const;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return { ok: false, status: 401, error: "Invalid token" } as const;

  const { data: profile } = await admin
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
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

  const { data, error } = await admin
    .from("sites")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) return json(500, { error: error.message });

  return json(200, { sites: data || [] });
});
