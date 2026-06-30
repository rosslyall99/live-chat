import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  AppointmentRow,
  branchToSiteName,
  formatTimeLabel,
  getEmailEnvironment,
  sendAppointmentEmailForAppointment,
  trimmedValue,
} from "./appointmentEmail.ts";

export const reminderOptions = {
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
  legacyFields: {
    subject: "reminder_email_subject" as const,
    bodyText: "reminder_email_body_text" as const,
    bodyHtml: "reminder_email_body_html" as const,
  },
};

export type PreviewRow = {
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

type RunReminderBatchParams = {
  adminClient: SupabaseClient;
  branch: "DUK" | "STE";
  dateValue: string;
  previewOnly: boolean;
  senderUserId: string | null;
  senderName: string;
  triggeredBy: "manual" | "scheduled";
  dryRun?: boolean;
};

function buildUtcDayBounds(dateValue: string) {
  return {
    startAt: `${dateValue}T00:00:00.000Z`,
    endAt: `${dateValue}T23:59:59.999Z`,
  };
}

export function tomorrowInLondonInputValue() {
  const londonNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
  londonNow.setDate(londonNow.getDate() + 1);
  const yyyy = londonNow.getFullYear();
  const mm = String(londonNow.getMonth() + 1).padStart(2, "0");
  const dd = String(londonNow.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function loadPreviewRows(params: {
  adminClient: SupabaseClient;
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
      ? adminClient.from("appointment_types").select("id, name").in("id", appointmentTypeIds)
      : Promise.resolve({ data: [], error: null }),
    areaIds.length
      ? adminClient.from("appointment_areas").select("id, name").in("id", areaIds)
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
    const status = alreadySent ? "already_sent" : missingEmail ? "missing_email" : "eligible";

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

export function summariseRows(rows: PreviewRow[]) {
  return {
    total_found: rows.length,
    eligible_count: rows.filter((row) => row.eligible).length,
    sent_count: rows.filter((row) => row.send_result === "sent").length,
    skipped_already_sent_count: rows.filter((row) => row.status === "already_sent").length,
    skipped_missing_email_count: rows.filter((row) => row.status === "missing_email").length,
    failed_count: rows.filter((row) => row.send_result === "failed").length,
  };
}

async function logReminderRun(params: {
  adminClient: SupabaseClient;
  branch: "DUK" | "STE";
  dateValue: string;
  triggeredBy: "manual" | "scheduled";
  initiatedByUserId: string | null;
  dryRun: boolean;
  result: Record<string, unknown>;
}) {
  const { adminClient, branch, dateValue, triggeredBy, initiatedByUserId, dryRun, result } = params;

  await adminClient.from("appointment_reminder_runs").insert({
    branch,
    run_for_date: dateValue,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    triggered_by: triggeredBy,
    initiated_by_user_id: initiatedByUserId,
    dry_run: dryRun,
    total_found: Number(result.total_found || 0),
    sent_count: Number(result.sent_count || 0),
    skipped_count:
      Number(result.skipped_already_sent_count || 0) + Number(result.skipped_missing_email_count || 0),
    failed_count: Number(result.failed_count || 0),
    raw_result: result,
  });
}

export async function runReminderBatch(params: RunReminderBatchParams) {
  const {
    adminClient,
    branch,
    dateValue,
    previewOnly,
    senderUserId,
    senderName,
    triggeredBy,
    dryRun = previewOnly,
  } = params;

  const { previewRows, appointmentMap } = await loadPreviewRows({
    adminClient,
    branch,
    dateValue,
  });

  if (previewOnly) {
    const previewResult = {
      ok: true,
      preview_only: true,
      branch,
      site_name: branchToSiteName(branch),
      selected_date: dateValue,
      ...summariseRows(previewRows),
      results: previewRows,
    };

    if (triggeredBy === "scheduled") {
      await logReminderRun({
        adminClient,
        branch,
        dateValue,
        triggeredBy,
        initiatedByUserId: senderUserId,
        dryRun: true,
        result: previewResult,
      });
    }

    return previewResult;
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
      senderUserId: senderUserId || "00000000-0000-0000-0000-000000000000",
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

  const finalResult = {
    ok: true,
    preview_only: false,
    branch,
    site_name: branchToSiteName(branch),
    selected_date: dateValue,
    ...summariseRows(nextRows),
    results: nextRows,
  };

  await logReminderRun({
    adminClient,
    branch,
    dateValue,
    triggeredBy,
    initiatedByUserId: senderUserId,
    dryRun,
    result: finalResult,
  });

  return finalResult;
}
