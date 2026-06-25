import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(req: Request) {
  const reqHeaders =
    req.headers.get("access-control-request-headers") ??
    "authorization, x-client-info, apikey, content-type, x-reset-secret";

  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": reqHeaders,
    "Content-Type": "application/json",
    Vary: "Origin, Access-Control-Request-Headers",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors(req),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(req) });
  }

  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const resetSecret = Deno.env.get("ADMIN_RESET_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !anonKey || !resetSecret) {
      return json(req, 500, { error: "Missing server environment variables" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const suppliedResetSecret = req.headers.get("x-reset-secret");
    let authorised = suppliedResetSecret === resetSecret;

    // Optional second path: allow logged-in admins from the CRM
    if (!authorised) {
      const authHeader = req.headers.get("Authorization") ?? "";

      if (authHeader.startsWith("Bearer ")) {
        const userJwt = authHeader.replace("Bearer ", "").trim();

        const userClient = createClient(supabaseUrl, anonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${userJwt}`,
            },
          },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const {
          data: { user },
          error: userError,
        } = await userClient.auth.getUser();

        if (!userError && user) {
          const { data: me, error: meError } = await adminClient
            .from("staff_profiles")
            .select("user_id, role, is_active")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!meError && me && me.is_active && me.role === "admin") {
            authorised = true;
          }
        }
      }
    }

    if (!authorised) {
      return json(req, 401, { error: "Not authorised" });
    }

    const body = await req.json();
    const targetUserId = String(body.user_id ?? "").trim();
    const newPassword = String(body.new_password ?? "").trim();

    if (!targetUserId) {
      return json(req, 400, { error: "user_id is required" });
    }

    if (!newPassword || newPassword.length < 4) {
      return json(req, 400, { error: "new_password must be at least 4 characters" });
    }

    const { data: targetProfile, error: targetError } = await adminClient
      .from("staff_profiles")
      .select("user_id, username, display_name, is_active")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return json(req, 404, { error: "Staff profile not found" });
    }

    if (!targetProfile.is_active) {
      return json(req, 400, { error: "Cannot reset password for inactive user" });
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUserId,
      { password: newPassword }
    );

    if (updateError) {
      return json(req, 400, { error: updateError.message });
    }

    return json(req, 200, {
      ok: true,
      user_id: targetProfile.user_id,
      username: targetProfile.username,
      display_name: targetProfile.display_name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(req, 500, { error: message });
  }
});