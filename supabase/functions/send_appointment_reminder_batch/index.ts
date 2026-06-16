import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  StaffProfile,
  corsHeaders,
  json,
  siteIdToAppointmentBranch,
  trimmedValue,
} from "../_shared/appointmentEmail.ts";
import { runReminderBatch } from "../_shared/appointmentReminderBatch.ts";

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
    const result = await runReminderBatch({
      adminClient,
      branch: requestedBranch,
      dateValue: selectedDate,
      previewOnly,
      senderUserId: user.id,
      senderName,
      triggeredBy: "manual",
      dryRun: previewOnly,
    });

    return json(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare reminder batch.";
    return json(500, { error: message });
  }
});
