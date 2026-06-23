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

type StaffProfileRotaRow = {
  rota_match_name: string | null;
};

function normaliseName(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS")
      return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST")
      return json(405, { error: "Method not allowed" });

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
    if (userErr || !user) return json(401, { error: "Invalid token" });

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

    if (profErr || !profile) return json(403, { error: "No staff profile" });
    if (!profile.is_active) return json(403, { error: "Inactive staff" });
    if (profile.role !== "admin") return json(403, { error: "Admins only" });

    // 4) Fetch recent/current staff_name values from rota_shifts in pages,
    // then de-dupe in code.
    //
    // Do not scan all historical rota_shifts rows because the table contains
    // many duplicate old shifts and the Edge Function can time out.
    //
    // start_at is indexed, so this keeps the query bounded while still picking up
    // current staff names from recent/future rota imports.
    const allNameSet = new Set<string>();
    const pageSize = 1000;
    let from = 0;

    const since = new Date();
    since.setDate(since.getDate() - 180);
    const sinceIso = since.toISOString();

    while (true) {
      const { data: shiftRows, error: shiftErr } = await adminDb
        .from("rota_shifts")
        .select("staff_name")
        .not("staff_name", "is", null)
        .gte("start_at", sinceIso)
        .order("staff_name", { ascending: true })
        .range(from, from + pageSize - 1);

      if (shiftErr) {
        console.error("rota_shifts query failed", shiftErr);
        return json(500, {
          error: "Database error (rota_shifts)",
          details: shiftErr.message,
        });
      }

      for (const row of shiftRows || []) {
        const name = String(row.staff_name || "").trim();
        if (name) allNameSet.add(name);
      }

      if (!shiftRows || shiftRows.length < pageSize) break;

      from += pageSize;

      // Safety guard to avoid this optional admin helper becoming slow again.
      if (from > 25000) {
        return json(500, {
          error: "Too many recent rota_shifts rows to scan safely",
        });
      }
    }

    const allNames: string[] = Array.from(allNameSet);

    // 5) Fetch assigned rota_match_name values from staff_profiles
    const { data: profRows, error: profErr2 } = await adminDb
      .from("staff_profiles")
      .select("rota_match_name")
      .not("rota_match_name", "is", null)
      .limit(5000);

    if (profErr2)
      return json(500, { error: "Database error (staff_profiles)" });

    const assigned = new Set(
      ((profRows || []) as StaffProfileRotaRow[])
        .map((r) => normaliseName(r.rota_match_name))
        .filter(Boolean),
    );

    // 6) Only return unassigned rota names
    const names = allNames
      .filter((n) => !assigned.has(normaliseName(n)))
      .sort((a: string, b: string) => a.localeCompare(b));

    return json(200, { names });
  } catch (_e) {
    return json(500, { error: "Unhandled error" });
  }
});
