import { Resend } from "npm:resend";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export type AppointmentRow = {
  id: string;
  branch: "DUK" | "STE";
  area_id: string;
  start_at: string;
  end_at: string;
  status: string;
  customer_name: string;
  customer_email: string;
  appointment_type_id: string;
  booked_by_user_id: string;
};

export type StaffProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  site_id: string | null;
  role: string | null;
  is_active: boolean;
};

type AppointmentTypeRow = {
  name: string | null;
  email_subject: string | null;
  email_body_html: string | null;
  email_body_text: string | null;
  reminder_email_subject: string | null;
  reminder_email_body_html: string | null;
  reminder_email_body_text: string | null;
};

type AppointmentEmailTemplateRow = {
  subject: string;
  body_text: string;
  body_html: string | null;
  appointment_type_id: string | null;
};

export type PlaceholderReplacements = Record<string, string>;

export type AppointmentEmailHandlerOptions = {
  emailType: "confirmation" | "reminder";
  auditAction: "confirmation_sent" | "reminder_sent";
  cancelledError: string;
  successMessage: string;
  configErrorMessage: string;
  fallbackSubject: string;
  buildFallbackText: (replacements: PlaceholderReplacements) => string;
  legacyFields?: {
    subject: keyof AppointmentTypeRow;
    bodyText: keyof AppointmentTypeRow;
    bodyHtml: keyof AppointmentTypeRow;
  };
};

type EmailEnvironment = {
  resendApiKey: string;
  fromEmail: string;
  fromName: string;
};

type SendAppointmentEmailParams = {
  adminClient: SupabaseClient;
  appointment: AppointmentRow;
  senderUserId: string;
  senderName: string;
  emailEnv: EmailEnvironment;
  options: AppointmentEmailHandlerOptions;
};

type SendAppointmentEmailResult =
  | {
      ok: true;
      status: number;
      body: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function branchToSiteName(branch: "DUK" | "STE") {
  return branch === "DUK" ? "Duke Street" : "St Enoch";
}

export function siteIdToAppointmentBranch(siteId: string | null | undefined) {
  const normalized = trimmedValue(siteId).toLowerCase();
  if (normalized === "duke" || normalized === "duk" || normalized === "duke street") return "DUK";
  if (
    normalized === "sten" ||
    normalized === "ste" ||
    normalized === "stenoch" ||
    normalized === "st enoch" ||
    normalized === "st enochs"
  ) {
    return "STE";
  }
  return null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function textToHtml(value: string) {
  return `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${escapeHtml(value)}</div>`;
}

export function formatDateLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(iso));
}

export function formatTimeLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(new Date(iso));
}

export function applyPlaceholders(template: string, replacements: PlaceholderReplacements) {
  let result = template;

  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}

export function trimmedValue(value: unknown) {
  return String(value || "").trim();
}

export function getEmailEnvironment() {
  return {
    resendApiKey: trimmedValue(Deno.env.get("RESEND_API_KEY")),
    fromEmail: trimmedValue(Deno.env.get("APPOINTMENTS_FROM_EMAIL")),
    fromName: trimmedValue(Deno.env.get("APPOINTMENTS_FROM_NAME")) || "Slanj Kilts",
  };
}

async function buildAppointmentEmailContent(
  adminClient: SupabaseClient,
  appointment: AppointmentRow,
  senderName: string,
  options: AppointmentEmailHandlerOptions
) {
  const [{ data: appointmentType }, { data: area }, { data: templateRows }] = await Promise.all([
    adminClient
      .from("appointment_types")
      .select(
        "name, email_subject, email_body_html, email_body_text, reminder_email_subject, reminder_email_body_html, reminder_email_body_text"
      )
      .eq("id", appointment.appointment_type_id)
      .maybeSingle<AppointmentTypeRow>(),
    adminClient
      .from("appointment_areas")
      .select("name")
      .eq("id", appointment.area_id)
      .maybeSingle(),
    adminClient
      .from("appointment_email_templates")
      .select("subject, body_text, body_html, appointment_type_id, updated_at")
      .eq("template_type", options.emailType)
      .eq("is_active", true)
      .or(`appointment_type_id.eq.${appointment.appointment_type_id},appointment_type_id.is.null`)
      .order("updated_at", { ascending: false }),
  ]);

  const appointmentTypeName = trimmedValue(appointmentType?.name) || "appointment";
  const siteName = branchToSiteName(appointment.branch);
  const areaName = trimmedValue(area?.name) || "Area";
  const appointmentDate = formatDateLabel(appointment.start_at);
  const appointmentTime = formatTimeLabel(appointment.start_at);

  const replacements = {
    customer_name: appointment.customer_name,
    appointment_type: appointmentTypeName,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    site_name: siteName,
    area_name: areaName,
    staff_name: senderName,
  };

  const fallbackText = options.buildFallbackText(replacements);
  const safeTemplates = Array.isArray(templateRows) ? templateRows : [];
  const specificTemplate = safeTemplates.find(
    (row) => row.appointment_type_id === appointment.appointment_type_id
  ) as AppointmentEmailTemplateRow | undefined;
  const generalTemplate = safeTemplates.find(
    (row) => row.appointment_type_id == null
  ) as AppointmentEmailTemplateRow | undefined;
  const selectedTemplate = specificTemplate || generalTemplate || null;

  const legacySubject = options.legacyFields
    ? trimmedValue(appointmentType?.[options.legacyFields.subject])
    : "";
  const legacyBodyText = options.legacyFields
    ? trimmedValue(appointmentType?.[options.legacyFields.bodyText])
    : "";
  const legacyBodyHtml = options.legacyFields
    ? trimmedValue(appointmentType?.[options.legacyFields.bodyHtml])
    : "";

  const subject = applyPlaceholders(
    trimmedValue(selectedTemplate?.subject) || legacySubject || options.fallbackSubject,
    replacements
  );

  const bodyText = applyPlaceholders(
    trimmedValue(selectedTemplate?.body_text) || legacyBodyText || fallbackText,
    replacements
  );

  const bodyHtml = applyPlaceholders(
    trimmedValue(selectedTemplate?.body_html) || legacyBodyHtml || textToHtml(bodyText),
    replacements
  );

  return {
    subject,
    bodyText,
    bodyHtml,
    recipientEmail: trimmedValue(appointment.customer_email),
  };
}

export async function sendAppointmentEmailForAppointment(
  params: SendAppointmentEmailParams
): Promise<SendAppointmentEmailResult> {
  const { adminClient, appointment, senderUserId, senderName, emailEnv, options } = params;

  if (appointment.status === "cancelled") {
    return { ok: false, status: 400, error: options.cancelledError };
  }

  const emailContent = await buildAppointmentEmailContent(adminClient, appointment, senderName, options);
  const customerEmail = emailContent.recipientEmail;

  if (!customerEmail) {
    return {
      ok: false,
      status: 400,
      error: "This appointment does not have a customer email address.",
    };
  }

  if (!emailEnv.resendApiKey || !emailEnv.fromEmail) {
    const errorMessage = !emailEnv.resendApiKey
      ? "RESEND_API_KEY is not configured."
      : "APPOINTMENTS_FROM_EMAIL is not configured.";

    await adminClient.from("appointment_email_log").insert({
      appointment_id: appointment.id,
      email_type: options.emailType,
      recipient_email: customerEmail,
      subject: emailContent.subject,
      body_text: emailContent.bodyText,
      body_html: emailContent.bodyHtml,
      sent_by_user_id: senderUserId,
      status: "failed",
      error_message: errorMessage,
    });

    return {
      ok: false,
      status: 500,
      error: options.configErrorMessage,
    };
  }

  const resend = new Resend(emailEnv.resendApiKey);

  try {
    const result = await resend.emails.send({
      from: `${emailEnv.fromName} <${emailEnv.fromEmail}>`,
      to: [customerEmail],
      subject: emailContent.subject,
      text: emailContent.bodyText,
      html: emailContent.bodyHtml,
    });

    await adminClient.from("appointment_email_log").insert({
      appointment_id: appointment.id,
      email_type: options.emailType,
      recipient_email: customerEmail,
      subject: emailContent.subject,
      body_text: emailContent.bodyText,
      body_html: emailContent.bodyHtml,
      sent_by_user_id: senderUserId,
      status: "sent",
      resend_message_id: result.data?.id || null,
    });

    await adminClient.from("appointment_audit_log").insert({
      appointment_id: appointment.id,
      action: options.auditAction,
      changed_by_user_id: senderUserId,
      after_data: {
        email_type: options.emailType,
        recipient_email: customerEmail,
        resend_message_id: result.data?.id || null,
      },
    });

    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        email_type: options.emailType,
        message: options.successMessage,
        sent_at: new Date().toISOString(),
        recipient_email: customerEmail,
        resend_message_id: result.data?.id || null,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Resend send failed.";

    await adminClient.from("appointment_email_log").insert({
      appointment_id: appointment.id,
      email_type: options.emailType,
      recipient_email: customerEmail,
      subject: emailContent.subject,
      body_text: emailContent.bodyText,
      body_html: emailContent.bodyHtml,
      sent_by_user_id: senderUserId,
      status: "failed",
      error_message: errorMessage,
    });

    return { ok: false, status: 500, error: errorMessage };
  }
}

export function serveAppointmentEmail(options: AppointmentEmailHandlerOptions) {
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

    let appointmentId = "";

    try {
      const body = await req.json();
      appointmentId = trimmedValue(body?.appointment_id);
    } catch {
      return json(400, { error: "A valid appointment id is required." });
    }

    if (!appointmentId) {
      return json(400, { error: "A valid appointment id is required." });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("staff_profiles")
      .select("user_id, username, display_name, site_id, role, is_active")
      .eq("user_id", user.id)
      .maybeSingle<StaffProfile>();

    if (profileError || !profile?.is_active) {
      return json(403, { error: "Your staff profile is inactive or missing." });
    }

    const { data: appointment, error: appointmentError } = await adminClient
      .from("appointments")
      .select(
        "id, branch, area_id, start_at, end_at, status, customer_name, customer_email, appointment_type_id, booked_by_user_id"
      )
      .eq("id", appointmentId)
      .maybeSingle<AppointmentRow>();

    if (appointmentError || !appointment) {
      return json(404, { error: "That appointment could not be found." });
    }

    const { data: canAccess, error: accessError } = await authedClient.rpc(
      "staff_can_access_appointment_branch",
      { p_branch: appointment.branch }
    );

    if (accessError || !canAccess) {
      return json(403, { error: "You are not allowed to send email for this appointment." });
    }

    const senderName =
      trimmedValue(profile.display_name) ||
      trimmedValue(profile.username) ||
      "Slanj Kilts";

    const result = await sendAppointmentEmailForAppointment({
      adminClient,
      appointment,
      senderUserId: user.id,
      senderName,
      emailEnv: getEmailEnvironment(),
      options,
    });

    if (!result.ok) {
      return json(result.status, { error: result.error });
    }

    return json(result.status, result.body);
  });
}
