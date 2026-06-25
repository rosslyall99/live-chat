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

function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
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

  const STAFF_EMAIL_DOMAIN = Deno.env.get("STAFF_EMAIL_DOMAIN") || "staff.slanj";

  try {
    const body = await req.json();

    const usernameRaw = String(body.username || "");
    const display_name = String(body.display_name || "").trim() || usernameRaw;
    const site_id = body.site_id ? String(body.site_id) : null;
    const role = String(body.role || "agent");
    const pin = String(body.pin || "");

    const username = normalizeUsername(usernameRaw);

    if (!username) return json(400, { error: "username required" });
    if (!pin || pin.length < 4) return json(400, { error: "pin/password required (min 4)" });

    const email = `${username}@${STAFF_EMAIL_DOMAIN}`;

    // 1) Create Auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
    });

    if (createErr) return json(400, { error: createErr.message });
    const userId = created.user?.id;
    if (!userId) return json(500, { error: "Auth user created but no id returned" });

    // 2) Insert staff profile
    const { data: profile, error: profErr } = await admin
      .from("staff_profiles")
      .insert({
        user_id: userId,
        username,
        display_name,
        site_id,
        role,
        is_active: true,
      })
      .select("user_id, username, display_name, site_id, role, is_active, created_at")
      .single();

    if (profErr) {
      // rollback Auth user if profile insert fails
      await admin.auth.admin.deleteUser(userId);
      return json(400, { error: profErr.message });
    }

    return json(200, { ok: true, email, profile });
  } catch (e) {
    console.error("admin_create_staff error", e);
    return json(500, { error: String(e) });
  }
});
