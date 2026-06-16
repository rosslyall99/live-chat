import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  trimmedValue,
} from "../_shared/appointmentEmail.ts";
import {
  runReminderBatch,
  tomorrowInLondonInputValue,
} from "../_shared/appointmentReminderBatch.ts";

const BRANCHES = ["DUK", "STE"] as const;

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

  const cronSecret = trimmedValue(Deno.env.get("APPOINTMENT_REMINDER_CRON_SECRET"));
  const systemUserId = trimmedValue(Deno.env.get("APPOINTMENT_REMINDER_SYSTEM_USER_ID"));
  const providedSecret =
    trimmedValue(req.headers.get("x-reminder-cron-secret")) ||
    trimmedValue(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");

  if (!cronSecret || !systemUserId) {
    return json(500, {
      error:
        "Scheduled reminder configuration is incomplete. Set APPOINTMENT_REMINDER_CRON_SECRET and APPOINTMENT_REMINDER_SYSTEM_USER_ID.",
    });
  }

  if (!providedSecret || providedSecret !== cronSecret) {
    return json(401, { error: "Invalid scheduled reminder secret." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Supabase server configuration is missing." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let selectedDate = tomorrowInLondonInputValue();
  let dryRun = false;

  if (req.method !== "GET") {
    try {
      const rawBody = await req.text();
      const body = parseScheduledBody(rawBody);
      selectedDate = trimmedValue(body?.date) || selectedDate;
      dryRun = body?.dry_run === true;
      console.log(
        "scheduled-reminders request",
        JSON.stringify({
          has_body: rawBody.trim().length > 0,
          dry_run: dryRun,
          selected_date: selectedDate,
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

  if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return json(400, { error: "A valid date is required." });
  }

  const { data: systemProfile, error: systemProfileError } = await adminClient
    .from("staff_profiles")
    .select("user_id, username, display_name, is_active")
    .eq("user_id", systemUserId)
    .maybeSingle();

  if (systemProfileError || !systemProfile?.is_active) {
    return json(500, {
      error:
        "APPOINTMENT_REMINDER_SYSTEM_USER_ID must belong to an active staff profile so email logs and activity can be attributed safely.",
    });
  }

  const senderName =
    trimmedValue(systemProfile.display_name) ||
    trimmedValue(systemProfile.username) ||
    "Slanj Kilts";

  try {
    const branchResults = [];

    for (const branch of BRANCHES) {
      const result = await runReminderBatch({
        adminClient,
        branch,
        dateValue: selectedDate,
        previewOnly: dryRun,
        senderUserId: systemUserId,
        senderName,
        triggeredBy: "scheduled",
        dryRun,
      });

      branchResults.push(result);
    }

    const summary = branchResults.reduce(
      (acc, row) => ({
        total_found: acc.total_found + Number(row.total_found || 0),
        eligible_count: acc.eligible_count + Number(row.eligible_count || 0),
        sent_count: acc.sent_count + Number(row.sent_count || 0),
        skipped_already_sent_count:
          acc.skipped_already_sent_count + Number(row.skipped_already_sent_count || 0),
        skipped_missing_email_count:
          acc.skipped_missing_email_count + Number(row.skipped_missing_email_count || 0),
        failed_count: acc.failed_count + Number(row.failed_count || 0),
      }),
      {
        total_found: 0,
        eligible_count: 0,
        sent_count: 0,
        skipped_already_sent_count: 0,
        skipped_missing_email_count: 0,
        failed_count: 0,
      }
    );

    return json(200, {
      ok: true,
      scheduled: true,
      dry_run: dryRun,
      selected_date: selectedDate,
      ...summary,
      branches: branchResults,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not run scheduled reminders.";
    return json(500, { error: message });
  }
});
