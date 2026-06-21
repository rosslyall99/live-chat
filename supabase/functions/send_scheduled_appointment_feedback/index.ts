import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  trimmedValue,
} from "../_shared/appointmentEmail.ts";
import { runFeedbackBatch } from "../_shared/appointmentFeedbackBatch.ts";

function parseScheduledBody(rawBody: string) {
  const trimmedBody = rawBody.trim();

  if (!trimmedBody) {
    return {};
  }

  const normalizedBody =
    trimmedBody.startsWith("'") && trimmedBody.endsWith("'")
      ? trimmedBody.slice(1, -1).trim()
      : trimmedBody;
  const parsed = JSON.parse(normalizedBody);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Scheduled request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret =
    trimmedValue(Deno.env.get("APPOINTMENT_FEEDBACK_CRON_SECRET")) ||
    trimmedValue(Deno.env.get("APPOINTMENT_REMINDER_CRON_SECRET"));
  const systemUserId =
    trimmedValue(Deno.env.get("APPOINTMENT_FEEDBACK_SYSTEM_USER_ID")) ||
    trimmedValue(Deno.env.get("APPOINTMENT_REMINDER_SYSTEM_USER_ID"));
  const providedSecret =
    trimmedValue(req.headers.get("x-feedback-cron-secret")) ||
    trimmedValue(req.headers.get("x-reminder-cron-secret")) ||
    trimmedValue(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");

  if (!cronSecret || !systemUserId) {
    return json(500, {
      error:
        "Scheduled feedback configuration is incomplete. Set APPOINTMENT_FEEDBACK_CRON_SECRET and APPOINTMENT_FEEDBACK_SYSTEM_USER_ID, or reuse the reminder equivalents.",
    });
  }

  if (!providedSecret || providedSecret !== cronSecret) {
    return json(401, { error: "Invalid scheduled feedback secret." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Supabase server configuration is missing." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let dryRun = false;
  let limit = 50;

  if (req.method !== "GET") {
    try {
      const rawBody = await req.text();
      const body = parseScheduledBody(rawBody);
      dryRun = body?.dry_run === true;
      limit = Number(body?.limit || limit);
      console.log(
        "scheduled-feedback request",
        JSON.stringify({
          has_body: rawBody.trim().length > 0,
          dry_run: dryRun,
          limit,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A valid scheduled request body is required.";
      return json(400, { error: message });
    }
  }

  const { data: systemProfile, error: systemProfileError } = await adminClient
    .from("staff_profiles")
    .select("user_id, username, display_name, is_active")
    .eq("user_id", systemUserId)
    .maybeSingle();

  if (systemProfileError || !systemProfile?.is_active) {
    return json(500, {
      error:
        "APPOINTMENT_FEEDBACK_SYSTEM_USER_ID must belong to an active staff profile so email logs and activity can be attributed safely.",
    });
  }

  const senderName =
    trimmedValue(systemProfile.display_name) ||
    trimmedValue(systemProfile.username) ||
    "Slanj";

  try {
    const result = await runFeedbackBatch({
      adminClient,
      senderUserId: systemUserId,
      senderName,
      dryRun,
      limit,
    });

    return json(200, {
      ...result,
      scheduled: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not run scheduled feedback emails.";
    return json(500, { error: message });
  }
});
