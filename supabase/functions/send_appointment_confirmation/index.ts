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

type AppointmentEmailTemplateRow = {
  subject: string;
  body_text: string;
  body_html: string | null;
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

function applyPlaceholders(template: string, replacements: Record<string, string>) {
  let result = template;

  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
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
    appointmentId = String(body?.appointment_id || "").trim();
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
    return json(400, { error: "Cancelled appointments cannot be confirmed by email." });
  }

  const { data: canAccess, error: accessError } = await authedClient.rpc(
    "staff_can_access_appointment_branch",
    { p_branch: appointment.branch }
  );

  if (accessError || !canAccess) {
    return json(403, { error: "You are not allowed to send email for this appointment." });
  }

  const customerEmail = String(appointment.customer_email || "").trim();
  if (!customerEmail) {
    return json(400, { error: "This appointment does not have a customer email address." });
  }

  const [{ data: appointmentType }, { data: area }, { data: templateRows }] = await Promise.all([
    adminClient
      .from("appointment_types")
      .select("name, email_subject, email_body_html, email_body_text")
      .eq("id", appointment.appointment_type_id)
      .maybeSingle(),
    adminClient
      .from("appointment_areas")
      .select("name")
      .eq("id", appointment.area_id)
      .maybeSingle(),
    adminClient
      .from("appointment_email_templates")
      .select("subject, body_text, body_html, appointment_type_id, is_active, updated_at")
      .eq("template_type", "confirmation")
      .eq("is_active", true)
      .or(`appointment_type_id.eq.${appointment.appointment_type_id},appointment_type_id.is.null`)
      .order("updated_at", { ascending: false }),
  ]);

  const staffName =
    String(profile.display_name || "").trim() ||
    String(profile.username || "").trim() ||
    "Slanj Kilts";
  const appointmentTypeName = String(appointmentType?.name || "appointment");
  const siteName = branchToSiteName(appointment.branch);
  const areaName = String(area?.name || "Area");
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

  const fallbackSubject = "Appointment confirmation - Slanj Kilts";
  const fallbackText = [
    `Hi ${replacements.customer_name},`,
    "",
    `Your ${replacements.appointment_type} appointment has been confirmed for ${replacements.appointment_date} at ${replacements.appointment_time}.`,
    "",
    "Location:",
    `${replacements.site_name}`,
    `${replacements.area_name}`,
    "",
    "If you need to make any changes, please contact us directly.",
    "",
    "Thanks,",
    "Slanj Kilts",
  ].join("\n");

  const templateRowsSafe = Array.isArray(templateRows) ? templateRows : [];
  const specificTemplate = templateRowsSafe.find(
    (row) => row.appointment_type_id === appointment.appointment_type_id
  ) as (AppointmentEmailTemplateRow & { appointment_type_id?: string | null }) | undefined;
  const generalTemplate = templateRowsSafe.find(
    (row) => row.appointment_type_id == null
  ) as (AppointmentEmailTemplateRow & { appointment_type_id?: string | null }) | undefined;
  const selectedTemplate = specificTemplate || generalTemplate || null;

  const subject = applyPlaceholders(
    String(selectedTemplate?.subject || appointmentType?.email_subject || "").trim() || fallbackSubject,
    replacements
  );

  const bodyText = applyPlaceholders(
    String(selectedTemplate?.body_text || appointmentType?.email_body_text || "").trim() || fallbackText,
    replacements
  );

  const bodyHtml = applyPlaceholders(
    String(selectedTemplate?.body_html || appointmentType?.email_body_html || "").trim() || textToHtml(bodyText),
    replacements
  );

  const fromEmail = String(Deno.env.get("APPOINTMENTS_FROM_EMAIL") || "").trim();
  const fromName = String(Deno.env.get("APPOINTMENTS_FROM_NAME") || "Slanj Kilts").trim();

  if (!resendApiKey || !fromEmail) {
    const errorMessage = !resendApiKey
      ? "RESEND_API_KEY is not configured."
      : "APPOINTMENTS_FROM_EMAIL is not configured.";

    await adminClient.from("appointment_email_log").insert({
      appointment_id: appointment.id,
      email_type: "confirmation",
      recipient_email: customerEmail,
      subject,
      body_text: bodyText,
      body_html: bodyHtml,
      sent_by_user_id: user.id,
      status: "failed",
      error_message: errorMessage,
    });

    return json(500, {
      error:
        "Confirmation email could not be sent because email delivery is not configured on this environment.",
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
      email_type: "confirmation",
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
      action: "confirmation_sent",
      changed_by_user_id: user.id,
      after_data: {
        email_type: "confirmation",
        recipient_email: customerEmail,
        resend_message_id: result.data?.id || null,
      },
    });

    return json(200, {
      ok: true,
      sent_at: new Date().toISOString(),
      recipient_email: customerEmail,
      resend_message_id: result.data?.id || null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Resend send failed.";

    await adminClient.from("appointment_email_log").insert({
      appointment_id: appointment.id,
      email_type: "confirmation",
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
