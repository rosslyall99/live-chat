import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  AppointmentRow,
  StaffProfile,
  branchToSiteName,
  corsHeaders,
  formatTimeLabel,
  getEmailEnvironment,
  json,
  sendAppointmentEmailForAppointment,
  siteIdToAppointmentBranch,
  trimmedValue,
} from "../_shared/appointmentEmail.ts";

const reminderOptions = {
  emailType: "reminder" as const,
  auditAction: "reminder_sent" as const,
  cancelledError: "Cancelled appointments cannot be sent reminder emails.",
  successMessage: "Reminder email sent.",
  configErrorMessage:
    "Reminder email could not be sent because email delivery is not configured on this environment.",
  fallbackSubject: "Appointment reminder - Slanj Kilts",
  buildFallbackText: (replacements: Record<string, string>) =>
    [
      `Hi ${replacements.customer_name},`,
      "",
      `This is a reminder of your ${replacements.appointment_type} appointment with Slanj Kilts.`,
      "",
      "Appointment:",
      `${replacements.appointment_date} at ${replacements.appointment_time}`,
      "",
      "Location:",
      `${replacements.site_name}`,
      "",
      "If you need to make any changes, please contact us directly.",
      "",
      "Thanks,",
      "Slanj Kilts",
    ].join("\n"),
};

type PreviewRow = {
  appointment_id: string;
  customer_name: string;
  customer_email: string;
  appointment_type: string;
  appointment_time: string;
  site_name: string;
  area_name: string;
  status: "eligible" | "already_sent" | "missing_email";
  eligible: boolean;
  message: string;
  send_result: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
};

function buildUtcDayBounds(dateValue: string) {
  return {
    startAt: `${dateValue}T00:00:00.000Z`,
    endAt: `${dateValue}T23:59:59.999Z`,
  };
}

async function loadPreviewRows(params: {
  adminClient: ReturnType<typeof createClient>;
  branch: "DUK" | "STE";
  dateValue: string;
}) {
  const { adminClient, branch, dateValue } = params;
  const { startAt, endAt } = buildUtcDayBounds(dateValue);

  const { data: appointments, error: appointmentsError } = await adminClient
    .from("appointments")
    .select(
      "id, branch, area_id, start_at, end_at, status, customer_name, customer_email, appointment_type_id, booked_by_user_id"
    )
    .eq("branch", branch)
    .neq("status", "cancelled")
    .gte("start_at", startAt)
    .lte("start_at", endAt)
    .order("start_at", { ascending: true })
    .returns<AppointmentRow[]>();

  if (appointmentsError) throw appointmentsError;

  const rows = appointments || [];
  const appointmentTypeIds = [...new Set(rows.map((item) => item.appointment_type_id).filter(Boolean))];
  const areaIds = [...new Set(rows.map((item) => item.area_id).filter(Boolean))];
  const appointmentIds = rows.map((item) => item.id);

  const [{ data: typeRows }, { data: areaRows }, { data: logRows }] = await Promise.all([
    appointmentTypeIds.length
      ? adminClient
          .from("appointment_types")
          .select("id, name")
          .in("id", appointmentTypeIds)
      : Promise.resolve({ data: [], error: null }),
    areaIds.length
      ? adminClient
          .from("appointment_areas")
          .select("id, name")
          .in("id", areaIds)
      : Promise.resolve({ data: [], error: null }),
    appointmentIds.length
      ? adminClient
          .from("appointment_email_log")
          .select("appointment_id")
          .in("appointment_id", appointmentIds)
          .eq("email_type", "reminder")
          .eq("status", "sent")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const typeMap = Object.fromEntries((typeRows || []).map((row) => [row.id, row.name || "Appointment"]));
  const areaMap = Object.fromEntries((areaRows || []).map((row) => [row.id, row.name || "Area"]));
  const sentReminderIds = new Set((logRows || []).map((row) => row.appointment_id));

  const previewRows: PreviewRow[] = rows.map((item) => {
    const customerEmail = trimmedValue(item.customer_email);
    const alreadySent = sentReminderIds.has(item.id);
    const missingEmail = !customerEmail;
    const status = alreadySent
      ? "already_sent"
      : missingEmail
        ? "missing_email"
        : "eligible";

    return {
      appointment_id: item.id,
      customer_name: item.customer_name,
      customer_email: customerEmail,
      appointment_type: String(typeMap[item.appointment_type_id] || "Appointment"),
      appointment_time: formatTimeLabel(item.start_at),
      site_name: branchToSiteName(item.branch),
      area_name: String(areaMap[item.area_id] || "Area"),
      status,
      eligible: status === "eligible",
      message:
        status === "already_sent"
          ? "Already sent"
          : status === "missing_email"
            ? "Missing customer email"
            : "Ready to send",
      send_result: "pending",
      error: null,
    };
  });

  const appointmentMap = new Map(rows.map((item) => [item.id, item]));

  return { previewRows, appointmentMap };
}

function summariseRows(rows: PreviewRow[]) {
  return {
    total_found: rows.length,
    eligible_count: rows.filter((row) => row.eligible).length,
    sent_count: rows.filter((row) => row.send_result === "sent").length,
    skipped_already_sent_count: rows.filter((row) => row.status === "already_sent").length,
    skipped_missing_email_count: rows.filter((row) => row.status === "missing_email").length,
    failed_count: rows.filter((row) => row.send_result === "failed").length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json(401, { error: "No active session." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json(500, { error: "Supabase server configuration is missing." });
  }

  const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await authedClient.auth.getUser();

  if (userError || !user) {
    return json(401, { error: "No active session." });
  }

  let selectedDate = "";
  let selectedSiteId = "";
  let previewOnly = true;

  try {
    const body = await req.json();
    selectedDate = trimmedValue(body?.date);
    selectedSiteId = trimmedValue(body?.site_id);
    previewOnly = body?.preview_only !== false;
  } catch {
    return json(400, { error: "A valid date and site are required." });
  }

  if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return json(400, { error: "A valid date is required." });
  }

  const requestedBranch = siteIdToAppointmentBranch(selectedSiteId);
  if (!requestedBranch) {
    return json(400, { error: "Reminder batches are only available for Duke Street and St Enoch." });
  }

  const { data: profile, error: profileError } = await adminClient
    .from("staff_profiles")
    .select("user_id, username, display_name, site_id, role, is_active")
    .eq("user_id", user.id)
    .maybeSingle<StaffProfile>();

  if (profileError || !profile?.is_active) {
    return json(403, { error: "Your staff profile is inactive or missing." });
  }

  const role = trimmedValue(profile.role).toLowerCase();
  if (role !== "admin" && role !== "manager") {
    return json(403, { error: "You are not allowed to send reminder batches." });
  }

  if (role === "manager") {
    const managerBranch = siteIdToAppointmentBranch(profile.site_id);
    if (!managerBranch || managerBranch !== requestedBranch) {
      return json(403, { error: "Managers can only send reminders for their own site." });
    }
  }

  const senderName =
    trimmedValue(profile.display_name) ||
    trimmedValue(profile.username) ||
    "Slanj Kilts";

  try {
    const { previewRows, appointmentMap } = await loadPreviewRows({
      adminClient,
      branch: requestedBranch,
      dateValue: selectedDate,
    });

    if (previewOnly) {
      return json(200, {
        ok: true,
        preview_only: true,
        branch: requestedBranch,
        site_name: branchToSiteName(requestedBranch),
        selected_date: selectedDate,
        ...summariseRows(previewRows),
        results: previewRows,
      });
    }

    const emailEnv = getEmailEnvironment();
    const nextRows: PreviewRow[] = [];

    for (const row of previewRows) {
      if (!row.eligible) {
        nextRows.push({ ...row, send_result: "skipped" });
        continue;
      }

      const appointment = appointmentMap.get(row.appointment_id);
      if (!appointment) {
        nextRows.push({
          ...row,
          send_result: "failed",
          error: "That appointment could not be loaded.",
          message: "Failed",
        });
        continue;
      }

      const result = await sendAppointmentEmailForAppointment({
        adminClient,
        appointment,
        senderUserId: user.id,
        senderName,
        emailEnv,
        options: reminderOptions,
      });

      if (!result.ok) {
        nextRows.push({
          ...row,
          send_result: "failed",
          error: result.error,
          message: "Failed",
        });
        continue;
      }

      nextRows.push({
        ...row,
        send_result: "sent",
        message: "Sent",
      });
    }

    return json(200, {
      ok: true,
      preview_only: false,
      branch: requestedBranch,
      site_name: branchToSiteName(requestedBranch),
      selected_date: selectedDate,
      ...summariseRows(nextRows),
      results: nextRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare reminder batch.";
    return json(500, { error: message });
  }
});
