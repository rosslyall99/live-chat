// supabase/functions/calendar_create_appointment/index.ts
// -------------------------------------------------------
// VERSION: with per-appointment-type email templates + prep notes
// (falls back to default email if templates are not set)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Branch = "STE" | "DUK";

type Payload = {
  branch: Branch;
  area_id: string;
  appointment_type_id: string;
  start_at: string; // ISO
  assigned_staff_user_id?: string | null;

  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  sms_consent?: boolean;

  linked_conversation_id?: string | null;
};

function branchLabel(branch: Branch) {
  return branch === "STE" ? "St Enoch" : "Duke Street";
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidUUID(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isValidBranch(v: unknown): v is Branch {
  return v === "STE" || v === "DUK";
}

function parseISO(s: string): Date | null {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function htmlEscape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { skipped: true };

  const from = Deno.env.get("RESEND_FROM") ?? "Slanj <no-reply@slanjkilts.com>";

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { skipped: false, ok: false, status: resp.status, text };
  }
  return { skipped: false, ok: true };
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { ok: false, error: "MISSING_ENV" });
    }

    // Auth: require bearer token
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return json(401, { ok: false, error: "NO_AUTH" });
    }

    // Validate user token
    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await authed.auth.getUser();
    if (userErr || !userData?.user) {
      return json(401, { ok: false, error: "INVALID_AUTH" });
    }
    const user = userData.user;

    // Service client for DB operations (bypasses RLS)
    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Parse body
    let payload: Payload;
    try {
      payload = await req.json();
    } catch {
      return json(400, { ok: false, error: "INVALID_JSON" });
    }

    // Validate payload
    if (!isValidBranch(payload.branch)) {
      return json(400, { ok: false, error: "VALIDATION_ERROR", field: "branch" });
    }
    if (!isValidUUID(payload.area_id)) {
      return json(400, { ok: false, error: "VALIDATION_ERROR", field: "area_id" });
    }
    if (!isValidUUID(payload.appointment_type_id)) {
      return json(400, { ok: false, error: "VALIDATION_ERROR", field: "appointment_type_id" });
    }
    const startAt = parseISO(payload.start_at);
    if (!startAt) {
      return json(400, { ok: false, error: "VALIDATION_ERROR", field: "start_at" });
    }

    const assignedStaff =
      payload.assigned_staff_user_id && isValidUUID(payload.assigned_staff_user_id)
        ? payload.assigned_staff_user_id
        : null;

    const customerName = (payload.customer_name ?? "").trim();
    const customerEmail = (payload.customer_email ?? "").trim();
    const customerPhone = (payload.customer_phone ?? "").trim() || null;

    if (!customerName) {
      return json(400, { ok: false, error: "VALIDATION_ERROR", field: "customer_name" });
    }
    if (!customerEmail || !customerEmail.includes("@")) {
      return json(400, { ok: false, error: "VALIDATION_ERROR", field: "customer_email" });
    }

    // Role gate: must be staff (agent/manager/admin)
    const { data: prof, error: profErr } = await svc
      .from("staff_profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profErr || !prof?.role || !["admin", "manager", "agent"].includes(prof.role)) {
      return json(403, { ok: false, error: "NOT_STAFF" });
    }

    // Load appointment type (now includes template fields)
    const { data: apptType, error: typeErr } = await svc
      .from("appointment_types")
      .select("id,name,duration_minutes,is_active,email_subject,email_body_html,email_body_text,customer_prep_notes")
      .eq("id", payload.appointment_type_id)
      .maybeSingle();

    if (typeErr || !apptType) {
      return json(400, { ok: false, error: "INVALID_APPOINTMENT_TYPE" });
    }
    if (!apptType.is_active) {
      return json(400, { ok: false, error: "APPOINTMENT_TYPE_INACTIVE" });
    }

    const durationMinutes = Number(apptType.duration_minutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return json(500, { ok: false, error: "BAD_APPOINTMENT_TYPE_DURATION" });
    }

    const endAt = addMinutes(startAt, durationMinutes);

    // Validate area belongs to branch
    const { data: area, error: areaErr } = await svc
      .from("appointment_areas")
      .select("id,branch,name,is_active")
      .eq("id", payload.area_id)
      .maybeSingle();

    if (areaErr || !area) return json(400, { ok: false, error: "INVALID_AREA" });
    if (!area.is_active) return json(400, { ok: false, error: "AREA_INACTIVE" });
    if (area.branch !== payload.branch) return json(400, { ok: false, error: "AREA_BRANCH_MISMATCH" });

    // ---- Block checks (branch-wide, area; and staff blocks if assigned) ----
    {
      let q = svc
        .from("appointment_blocks")
        .select("id,reason,area_id,staff_user_id,start_at,end_at")
        .eq("branch", payload.branch)
        .lt("start_at", endAt.toISOString())
        .gt("end_at", startAt.toISOString());

      const orParts: string[] = [];
      orParts.push("and(area_id.is.null,staff_user_id.is.null)"); // branch-wide
      orParts.push(`area_id.eq.${payload.area_id}`);              // area block
      if (assignedStaff) orParts.push(`staff_user_id.eq.${assignedStaff}`); // staff block

      q = q.or(orParts.join(","));

      const { data: blockHit, error: blockErr } = await q.limit(1);
      if (blockErr) return json(500, { ok: false, error: "BLOCK_CHECK_FAILED" });

      if (blockHit?.length) {
        return json(409, {
          ok: false,
          error: "BLOCKED",
          details: { reason: blockHit[0].reason, block_id: blockHit[0].id },
        });
      }
    }

    // ---- Area overlap check ----
    {
      const { data: areaHit, error: areaHitErr } = await svc
        .from("appointments")
        .select("id")
        .eq("area_id", payload.area_id)
        .neq("status", "cancelled")
        .lt("start_at", endAt.toISOString())
        .gt("end_at", startAt.toISOString())
        .limit(1);

      if (areaHitErr) return json(500, { ok: false, error: "AREA_CONFLICT_CHECK_FAILED" });
      if (areaHit?.length) return json(409, { ok: false, error: "AREA_CONFLICT" });
    }

    // ---- Assigned staff checks (only if assigned) ----
    if (assignedStaff) {
      // Staff overlap check
      const { data: staffHit, error: staffHitErr } = await svc
        .from("appointments")
        .select("id")
        .eq("assigned_staff_user_id", assignedStaff)
        .neq("status", "cancelled")
        .lt("start_at", endAt.toISOString())
        .gt("end_at", startAt.toISOString())
        .limit(1);

      if (staffHitErr) return json(500, { ok: false, error: "STAFF_CONFLICT_CHECK_FAILED" });
      if (staffHit?.length) return json(409, { ok: false, error: "STAFF_CONFLICT" });

      // Staff working check (rota_shifts overlap)
      const { data: shiftHit, error: shiftErr } = await svc
        .from("rota_shifts")
        .select("id")
        .eq("staff_user_id", assignedStaff)
        .eq("branch", payload.branch) // ensure rota uses STE/DUK
        .lt("start_at", endAt.toISOString())
        .gt("end_at", startAt.toISOString())
        .limit(1);

      if (shiftErr) return json(500, { ok: false, error: "ROTA_CHECK_FAILED" });
      if (!shiftHit?.length) return json(409, { ok: false, error: "STAFF_NOT_WORKING" });
    }

    // ---- Insert appointment ----
    const insertRow = {
      branch: payload.branch,
      area_id: payload.area_id,
      appointment_type_id: payload.appointment_type_id,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      status: "booked",

      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      sms_consent: Boolean(payload.sms_consent),

      linked_conversation_id: payload.linked_conversation_id ?? null,

      booked_by_user_id: user.id,
      assigned_staff_user_id: assignedStaff,
    };

    const { data: inserted, error: insErr } = await svc
      .from("appointments")
      .insert(insertRow)
      .select("id,branch,start_at,end_at,customer_name,customer_email,customer_phone")
      .single();

    if (insErr) {
      const msg = (insErr.message || "").toLowerCase();
      if (msg.includes("appts_no_overlap_area") || msg.includes("exclude")) {
        return json(409, { ok: false, error: "AREA_CONFLICT" });
      }
      if (msg.includes("appts_no_overlap_assigned_staff")) {
        return json(409, { ok: false, error: "STAFF_CONFLICT" });
      }
      return json(500, { ok: false, error: "INSERT_FAILED", details: insErr.message });
    }

    // ---- Build confirmation email (template fallback) ----
    const branchName = branchLabel(payload.branch);

    const startUk = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(inserted.start_at));

    const endUk = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(inserted.end_at));

    const subject = (apptType.email_subject?.trim() ||
      `Your ${apptType.name} appointment is confirmed`);

    const prepNotes = (apptType.customer_prep_notes ?? "").trim();
    const prepHtml = prepNotes
      ? `<div style="margin-top:12px;"><strong>Before you arrive:</strong><div style="margin-top:6px; white-space:pre-line;">${htmlEscape(prepNotes)}</div></div>`
      : "";

    const defaultHtml = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2 style="margin:0 0 12px 0;">Appointment Confirmation</h2>
        <p style="margin:0 0 8px 0;">Hi ${htmlEscape(customerName)},</p>
        <p style="margin:0 0 8px 0;">Your appointment has been booked.</p>

        <ul style="margin:0 0 12px 18px; padding:0;">
          <li><strong>Appointment:</strong> ${htmlEscape(apptType.name)}</li>
          <li><strong>When:</strong> ${startUk} – ${endUk}</li>
          <li><strong>Branch:</strong> ${branchName}</li>
          <li><strong>Duration:</strong> ${durationMinutes} minutes</li>
        </ul>

        ${prepHtml}

        <p style="margin:12px 0 0 0;">If you need to make changes, please reply to this email.</p>
      </div>
    `.trim();

    const defaultText = `
Hi ${customerName},

Your appointment has been booked.

Appointment: ${apptType.name}
When: ${startUk} – ${endUk}
Branch: ${branchName}
Duration: ${durationMinutes} minutes

${prepNotes ? `Before you arrive:\n${prepNotes}\n\n` : ""}If you need to make changes, please reply to this email.
`.trim();

    const html = (apptType.email_body_html?.trim() || defaultHtml);
    const text = (apptType.email_body_text?.trim() || defaultText);

    // Best-effort send (booking succeeds even if email fails)
    const emailResult = await sendResendEmail({
      to: customerEmail,
      subject,
      html,
      text,
    });

    return json(200, {
      ok: true,
      appointment_id: inserted.id,
      email: emailResult,
    });
  } catch (e) {
    return json(500, { ok: false, error: "UNHANDLED", details: String(e?.message ?? e) });
  }
});