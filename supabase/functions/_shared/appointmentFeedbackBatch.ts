import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  AppointmentRow,
  branchToSiteName,
  formatTimeLabel,
  getEmailEnvironment,
  sendAppointmentEmailForAppointment,
  trimmedValue,
} from "./appointmentEmail.ts";

export const feedbackOptions = {
  emailType: "feedback" as const,
  auditAction: "feedback_sent" as const,
  cancelledError: "Cancelled appointments cannot be sent feedback emails.",
  successMessage: "Feedback email sent.",
  configErrorMessage:
    "Feedback email could not be sent because email delivery is not configured on this environment.",
  fallbackSubject: "How did your appointment go?",
  buildFallbackText: (replacements: Record<string, string>) =>
    [
      `Hi ${replacements.customer_name},`,
      "",
      "Thank you for visiting Slanj for your appointment today.",
      "",
      "We hope everything went as expected. If there is anything about the appointment process that could have been clearer, smoother, or more helpful, we would really appreciate your feedback.",
      "",
      "This is just to help us improve how we manage appointments and look after customers.",
      "",
      "Thanks,",
      "Slanj",
    ].join("\n"),
};

export type FeedbackResultRow = {
  appointment_id: string;
  customer_name: string;
  customer_email: string;
  site_name: string;
  appointment_time: string;
  status: "eligible" | "already_sent" | "missing_email" | "not_attended";
  eligible: boolean;
  send_result: "pending" | "sent" | "failed" | "skipped" | "dry_run";
  message: string;
  error: string | null;
};

type RunFeedbackBatchParams = {
  adminClient: SupabaseClient;
  senderUserId: string;
  senderName: string;
  dryRun?: boolean;
  limit?: number;
};

type SentFeedbackLogRow = {
  appointment_id: string | null;
  sent_at: string | null;
};

function summariseRows(rows: FeedbackResultRow[]) {
  return {
    total_found: rows.length,
    eligible_count: rows.filter((row: FeedbackResultRow) => row.eligible).length,
    sent_count: rows.filter((row: FeedbackResultRow) => row.send_result === "sent").length,
    skipped_already_sent_count: rows.filter(
      (row: FeedbackResultRow) => row.status === "already_sent",
    ).length,
    skipped_missing_email_count: rows.filter(
      (row: FeedbackResultRow) => row.status === "missing_email",
    ).length,
    skipped_not_attended_count: rows.filter(
      (row: FeedbackResultRow) => row.status === "not_attended",
    ).length,
    failed_count: rows.filter((row: FeedbackResultRow) => row.send_result === "failed").length,
  };
}

async function loadCandidateAppointments(adminClient: SupabaseClient, limit: number) {
  const { data, error } = await adminClient
    .from("appointments")
    .select(
      "id, branch, area_id, start_at, end_at, status, customer_name, customer_email, appointment_type_id, booked_by_user_id, attendance_status",
    )
    .neq("status", "cancelled")
    .in("attendance_status", ["checked_in", "checked_in_late"])
    .lt("end_at", new Date().toISOString())
    .order("end_at", { ascending: true })
    .limit(limit)
    .returns<AppointmentRow[]>();

  if (error) throw error;
  return data || [];
}

async function loadSentFeedbackLogMap(
  adminClient: SupabaseClient,
  appointmentIds: string[],
): Promise<Map<string, string>> {
  if (appointmentIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await adminClient
    .from("appointment_email_log")
    .select("appointment_id, sent_at")
    .in("appointment_id", appointmentIds)
    .eq("email_type", "feedback")
    .eq("status", "sent")
    .returns<SentFeedbackLogRow[]>();

  if (error) throw error;

  return new Map<string, string>(
    (data || [])
      .filter((row: SentFeedbackLogRow) => Boolean(row.appointment_id))
      .map((row: SentFeedbackLogRow): [string, string] => [
        String(row.appointment_id),
        String(row.sent_at || new Date().toISOString()),
      ]),
  );
}

async function markFeedbackSentFromExistingLog(
  _adminClient: SupabaseClient,
  _appointmentId: string,
  _sentAt: string,
) {
  // Temporary workaround:
  // appointment_email_log is the source of truth for scheduled feedback emails.
}

async function claimAppointmentForFeedback(_adminClient: SupabaseClient, _appointmentId: string) {
  // Temporary workaround:
  // Do not touch appointments.feedback_email_status until the API/schema issue is resolved.
  return true;
}

async function markFeedbackSent(_adminClient: SupabaseClient, _appointmentId: string) {
  // Temporary workaround:
  // sendAppointmentEmailForAppointment inserts the appointment_email_log row on success.
}

async function markFeedbackFailed(
  _adminClient: SupabaseClient,
  _appointmentId: string,
  _errorMessage: string,
) {
  // Temporary workaround:
  // Do not touch appointments.feedback_email_status until the API/schema issue is resolved.
}

export async function runFeedbackBatch(params: RunFeedbackBatchParams) {
  const {
    adminClient,
    senderUserId,
    senderName,
    dryRun = false,
    limit = 50,
  } = params;

  const rows = await loadCandidateAppointments(
    adminClient,
    Math.min(Math.max(limit, 1), 200),
  );

  const sentLogMap = await loadSentFeedbackLogMap(
    adminClient,
    rows.map((row: AppointmentRow) => row.id),
  );

  const emailEnv = getEmailEnvironment();
  const results: FeedbackResultRow[] = [];

  for (const appointment of rows) {
    const customerEmail = trimmedValue(appointment.customer_email);
    const baseRow = {
      appointment_id: appointment.id,
      customer_name: appointment.customer_name,
      customer_email: customerEmail,
      site_name: branchToSiteName(appointment.branch as Parameters<typeof branchToSiteName>[0]),
      appointment_time: formatTimeLabel(String(appointment.start_at || "")),
    };

    const existingSentAt = sentLogMap.get(appointment.id);
    if (existingSentAt) {
      await markFeedbackSentFromExistingLog(adminClient, String(appointment.id), String(existingSentAt));
      results.push({
        ...baseRow,
        status: "already_sent",
        eligible: false,
        send_result: "skipped",
        message: "Already sent",
        error: null,
      });
      continue;
    }

    if (!customerEmail) {
      results.push({
        ...baseRow,
        status: "missing_email",
        eligible: false,
        send_result: "skipped",
        message: "Missing customer email",
        error: null,
      });
      continue;
    }

    if (
      appointment.attendance_status !== "checked_in" &&
      appointment.attendance_status !== "checked_in_late"
    ) {
      results.push({
        ...baseRow,
        status: "not_attended",
        eligible: false,
        send_result: "skipped",
        message: "Not attended",
        error: null,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        ...baseRow,
        status: "eligible",
        eligible: true,
        send_result: "dry_run",
        message: "Ready to send",
        error: null,
      });
      continue;
    }

    const claimed = await claimAppointmentForFeedback(adminClient, appointment.id);
    if (!claimed) {
      results.push({
        ...baseRow,
        status: "already_sent",
        eligible: false,
        send_result: "skipped",
        message: "Already claimed or sent",
        error: null,
      });
      continue;
    }

    const result = await sendAppointmentEmailForAppointment({
      adminClient,
      appointment,
      senderUserId,
      senderName,
      emailEnv,
      options: feedbackOptions,
    });

    if (!result.ok) {
      const errorMessage = String(result.error || "Feedback email failed.");
      await markFeedbackFailed(adminClient, appointment.id, errorMessage);
      results.push({
        ...baseRow,
        status: "eligible",
        eligible: true,
        send_result: "failed",
        message: "Failed",
        error: errorMessage,
      });
      continue;
    }

    await markFeedbackSent(adminClient, appointment.id);
    results.push({
      ...baseRow,
      status: "eligible",
      eligible: true,
      send_result: "sent",
      message: "Sent",
      error: null,
    });
  }

  return {
    ok: true,
    dry_run: dryRun,
    ...summariseRows(results),
    results,
  };
}