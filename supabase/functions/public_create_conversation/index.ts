import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getLiveBranches,
  type SiteId,
} from "../_shared/chatAvailability.ts";

export const config = { verify_jwt: false };

const BRANCHES: SiteId[] = ["duke", "sten", "off"];

function makeCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowList = new Set([
    "https://slanjkilts.com",
    "https://www.slanjkilts.com",
  ]);

  const allowOrigin = allowList.has(origin) ? origin : "https://slanjkilts.com";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-credentials": "true",
    "vary": "Origin",
  };
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function text(body: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(body, { status, headers: { ...corsHeaders } });
}

serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return text("Method not allowed", 405, corsHeaders);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "").replace(/\/+$/, "");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return text("Missing env vars", 500, corsHeaders);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const customer_name = String(body.customer_name || "").trim();
    const customer_email = body.customer_email ? String(body.customer_email).trim() : null;
    const first_message = String(body.message || "").trim();

    if (!customer_name || customer_name.length < 2) {
      return text("customer_name required", 400, corsHeaders);
    }

    if (!first_message || first_message.length < 1) {
      return text("message required", 400, corsHeaders);
    }

    const openBranches = await getLiveBranches(supabase, BRANCHES);

    if (openBranches.length === 0) {
      return json(
        { mode: "offline", reason: "no_branches_available" },
        409,
        corsHeaders,
      );
    }

    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .insert({
        site_id: "web",
        customer_name,
        customer_email,
        status: "open",
        eligible_sites: openBranches,
      })
      .select("id, customer_token")
      .single();

    if (convoErr) {
      return text(`Conversation create failed: ${convoErr.message}`, 500, corsHeaders);
    }

    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: convo.id,
      sender_type: "customer",
      body: first_message,
    });

    if (msgErr) {
      return text(`Message create failed: ${msgErr.message}`, 500, corsHeaders);
    }

    return json(
      {
        conversation_id: convo.id,
        customer_token: convo.customer_token,
        conversation_url: APP_BASE_URL ? `${APP_BASE_URL}/chat/${convo.id}` : null,
        site_name: null,
        eligible_sites: openBranches,
      },
      200,
      corsHeaders,
    );
  } catch (e) {
    return text(e instanceof Error ? e.message : String(e), 500, corsHeaders);
  }
});
