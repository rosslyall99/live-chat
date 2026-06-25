// supabase/functions/desktop_notifier_status/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getChatAvailability,
  type SiteId,
} from "../_shared/chatAvailability.ts";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function normalizeSiteId(value: unknown): SiteId | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "duke" || s === "sten" || s === "off") return s;
  return null;
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const expectedSecret = Deno.env.get("NOTIFIER_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!expectedSecret || !supabaseUrl || !serviceRoleKey) {
      return json(500, { ok: false, error: "Missing server configuration" });
    }

    const body = await req.json().catch(() => null);
    const siteId = normalizeSiteId(body?.site_id);
    const secret = String(body?.secret ?? "");
    const recentlyClaimingIds = normalizeIdList(body?.recently_claiming_ids);

    if (!siteId) {
      return json(400, { ok: false, error: "Invalid site_id" });
    }

    if (secret !== expectedSecret) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let availability;

    try {
      availability = await getChatAvailability(supabase, siteId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      if (detail.startsWith("chat_settings lookup failed")) {
        return json(500, {
          ok: false,
          error: "Failed to load chat settings",
          detail,
        });
      }

      if (detail.startsWith("site_settings lookup failed")) {
        return json(500, {
          ok: false,
          error: "Failed to load site settings",
          detail,
        });
      }

      throw error;
    }

    if (availability.mode !== "live") {
      return json(200, {
        ok: true,
        site_id: siteId,
        can_notify: false,
        reason: availability.reason,
        count: 0,
        latest: null,
        rows: [],
        claimed_rows: [],
      });
    }

    const { data: rows, error: rowsError } = await supabase
      .from("notifier_conversations")
      .select("id, customer_name, first_customer_message, last_message_at, assigned_to, assigned_to_name, eligible_sites")
      .eq("status", "open")
      .is("assigned_to", null)
      .contains("eligible_sites", [siteId])
      .order("last_message_at", { ascending: true })
      .limit(12);

    if (rowsError) {
      return json(500, {
        ok: false,
        error: "Failed to load notifier rows",
        detail: rowsError.message,
      });
    }

    let claimedRows: Array<{
      id: string;
      customer_name: string | null;
      assigned_to_name: string | null;
    }> = [];

    if (recentlyClaimingIds.length > 0) {
      const { data: claimed, error: claimedError } = await supabase
        .from("conversations")
        .select("id, customer_name, assigned_to_name, eligible_sites, status")
        .in("id", recentlyClaimingIds)
        .eq("status", "open")
        .contains("eligible_sites", [siteId])
        .not("assigned_to_name", "is", null);

      if (claimedError) {
        return json(500, {
          ok: false,
          error: "Failed to load claimed conversations",
          detail: claimedError.message,
        });
      }

      claimedRows = (claimed ?? []).map((row) => ({
        id: row.id,
        customer_name: row.customer_name ?? null,
        assigned_to_name: row.assigned_to_name ?? null,
      }));
    }

    return json(200, {
      ok: true,
      site_id: siteId,
      can_notify: true,
      reason: null,
      count: rows?.length ?? 0,
      latest: rows?.[0] ?? null,
      rows: rows ?? [],
      claimed_rows: claimedRows,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: "Unhandled function error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});
