import { Resend } from "npm:resend";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppointmentRow = {
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

type StaffProfile = {
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

type PlaceholderReplacements = Record<string, string>;

type AppointmentEmailHandlerOptions = {
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

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function branchToSiteName(branch: "DUK" | "STE") {
  return branch === "DUK" ? "Duke Street" : "St Enoch";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(value: string) {
  return `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${escapeHtml(value)}</div>`;
}

function formatDateLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(iso));
}

function formatTimeLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(new Date(iso));
}

function applyPlaceholders(template: string, replacements: PlaceholderReplacements) {
  let result = template;

  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}

function trimmedValue(value: unknown) {
  return String(value || "").trim();
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

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

    if (appointment.status === "cancelled") {
      return json(400, { error: options.cancelledError });
    }

    const { data: canAccess, error: accessError } = await authedClient.rpc(
      "staff_can_access_appointment_branch",
      { p_branch: appointment.branch }
    );

    if (accessError || !canAccess) {
      return json(403, { error: "You are not allowed to send email for this appointment." });
    }

    const customerEmail = trimmedValue(appointment.customer_email);
    if (!customerEmail) {
      return json(400, { error: "This appointment does not have a customer email address." });
    }

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

    const staffName =
      trimmedValue(profile.display_name) ||
      trimmedValue(profile.username) ||
      "Slanj Kilts";
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
      staff_name: staffName,
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

    const fromEmail = trimmedValue(Deno.env.get("APPOINTMENTS_FROM_EMAIL"));
    const fromName = trimmedValue(Deno.env.get("APPOINTMENTS_FROM_NAME")) || "Slanj Kilts";

    if (!resendApiKey || !fromEmail) {
      const errorMessage = !resendApiKey
        ? "RESEND_API_KEY is not configured."
        : "APPOINTMENTS_FROM_EMAIL is not configured.";

      await adminClient.from("appointment_email_log").insert({
        appointment_id: appointment.id,
        email_type: options.emailType,
        recipient_email: customerEmail,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        sent_by_user_id: user.id,
        status: "failed",
        error_message: errorMessage,
      });

      return json(500, {
        error: options.configErrorMessage,
      });
    }

    const resend = new Resend(resendApiKey);

    try {
      const result = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [customerEmail],
        subject,
        text: bodyText,
        html: bodyHtml,
      });

      await adminClient.from("appointment_email_log").insert({
        appointment_id: appointment.id,
        email_type: options.emailType,
        recipient_email: customerEmail,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        sent_by_user_id: user.id,
        status: "sent",
        resend_message_id: result.data?.id || null,
      });

      await adminClient.from("appointment_audit_log").insert({
        appointment_id: appointment.id,
        action: options.auditAction,
        changed_by_user_id: user.id,
        after_data: {
          email_type: options.emailType,
          recipient_email: customerEmail,
          resend_message_id: result.data?.id || null,
        },
      });

      return json(200, {
        ok: true,
        email_type: options.emailType,
        message: options.successMessage,
        sent_at: new Date().toISOString(),
        recipient_email: customerEmail,
        resend_message_id: result.data?.id || null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Resend send failed.";

      await adminClient.from("appointment_email_log").insert({
        appointment_id: appointment.id,
        email_type: options.emailType,
        recipient_email: customerEmail,
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        sent_by_user_id: user.id,
        status: "failed",
        error_message: errorMessage,
      });

      return json(500, { error: errorMessage });
    }
  });
}
