import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getChatAvailability,
  getLiveBranches,
  type SiteId,
} from "../_shared/chatAvailability.ts";
export const config = { verify_jwt: false };

type Mode = "live" | "offline" | "closed";

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
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-credentials": "true",
    "vary": "Origin",
  };
}

function text(body: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(body, { status, headers: { ...corsHeaders } });
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

async function getConversationStatus(
  supabase: any,
  conversation_id: string,
  customer_token: string,
) {
  const { data: convo, error } = await supabase
    .from("conversations")
    .select("id, status, customer_token, closed_by_name")
    .eq("id", conversation_id)
    .maybeSingle();

  if (error) {
    throw new Error(`conversation lookup failed: ${error.message}`);
  }

  if (!convo) {
    return { conversation_found: false as const };
  }

  if (String(convo.customer_token || "") !== customer_token) {
    return {
      conversation_found: true as const,
      token_valid: false as const,
    };
  }

  return {
    conversation_found: true as const,
    token_valid: true as const,
    conversation_status: String(convo.status || "open"),
    closed_by_name: convo.closed_by_name || null,
  };
}

serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "GET") {
      return text("Method not allowed", 405, corsHeaders);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return text("Missing env vars", 500, corsHeaders);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const site_id_raw = String(url.searchParams.get("site_id") || "").trim();
    const conversation_id = String(url.searchParams.get("conversation_id") || "").trim();
    const customer_token = String(url.searchParams.get("customer_token") || "").trim();

    if (conversation_id) {
      if (!customer_token) {
        return text("customer_token required", 400, corsHeaders);
      }

      const convoStatus = await getConversationStatus(
        supabase,
        conversation_id,
        customer_token,
      );

      if (!convoStatus.conversation_found) {
        return json(
          {
            mode: "offline" as const,
            conversation_found: false,
          },
          200,
          corsHeaders,
        );
      }

      if (!convoStatus.token_valid) {
        return text("Forbidden", 403, corsHeaders);
      }

      if (convoStatus.conversation_status === "closed") {
        return json(
          {
            mode: "closed" as const,
            conversation_status: "closed",
            closed_by_name: convoStatus.closed_by_name,
          },
          200,
          corsHeaders,
        );
      }

      return json(
        {
          mode: "live" as const,
          conversation_status: "open",
        },
        200,
        corsHeaders,
      );
    }

    if (site_id_raw) {
      if (!BRANCHES.includes(site_id_raw as SiteId)) {
        return text("Invalid site_id", 400, corsHeaders);
      }

      const result = await getChatAvailability(supabase, site_id_raw as SiteId);
      return json(result, 200, corsHeaders);
    }

    const live_branches = await getLiveBranches(supabase, BRANCHES);

    if (live_branches.length > 0) {
      return json(
        {
          mode: "live" as const,
          live_branches,
        },
        200,
        corsHeaders,
      );
    }

    return json(
      {
        mode: "offline" as const,
        reason: "no_branches_available",
      },
      200,
      corsHeaders,
    );
  } catch (e) {
    return text(e instanceof Error ? e.message : String(e), 500, corsHeaders);
  }
});
