import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function firstNameOnly(full: string) {
  const s = String(full || "").trim();
  if (!s) return "";
  return s.split(/\s+/g)[0];
}

function normKey(s: string) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Monday-start week, computed in UTC (good enough for rota week boundaries in practice)
function startOfWeekUTC(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  const dow = (x.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const body = await req.json().catch(() => ({}));
    const k = String(body?.k || "");
    const weekParam = String(body?.week || "");   // YYYY-MM-DD (Monday)
    const branch = String(body?.branch || "All"); // "All" or exact branch label

    const EXPECTED = Deno.env.get("STAFF_VIEW_KEY") || "";
    if (!EXPECTED || k !== EXPECTED) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: latestRun, error: latestRunErr } = await admin
      .from("rota_sync_runs")
      .select("id")
      .eq("status", "complete")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    if (latestRunErr) throw latestRunErr;
    const runId = latestRun.id;

    // ----- compute today window -----
    const now = new Date();
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);
    const tomorrow0 = new Date(today0);
    tomorrow0.setDate(tomorrow0.getDate() + 1);
    const todayIso = isoDate(today0);

    // ----- compute week window -----
    let weekStart = startOfWeekUTC(new Date());
    if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      weekStart = startOfWeekUTC(new Date(weekParam + "T00:00:00Z"));
    }
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const weekStartIso = isoDate(weekStart);
    const weekEndIsoExclusive = weekEnd.toISOString();
    const weekEndIsoInclusiveDate = isoDate(new Date(weekEnd.getTime() - 1));

    // ----- name map (Sage->CRM label) -----
    const { data: mapRows, error: mapErr } = await admin.rpc("get_rota_name_map");
    if (mapErr) throw mapErr;

    const nameMap: Record<string, string> = {};
    for (const r of mapRows || []) {
      const k2 = normKey(r?.rota_match_name);
      const label = String(r?.display_name || r?.rota_match_name || "").trim();
      if (k2) nameMap[k2] = label;
    }

    const labelFor = (sageName: string) => firstNameOnly(nameMap[normKey(sageName)] || sageName);

    // ----- queries -----
    let sTodayQ = admin
      .from("rota_shifts")
      .select("staff_name, branch, label, start_at, end_at")
      .eq("sync_run_id", runId)
      .gte("start_at", today0.toISOString())
      .lt("start_at", tomorrow0.toISOString())
      .order("staff_name", { ascending: true })
      .order("start_at", { ascending: true });

    let sWeekQ = admin
      .from("rota_shifts")
      .select("staff_name, branch, label, start_at, end_at")
      .eq("sync_run_id", runId)
      .gte("start_at", weekStart.toISOString())
      .lt("start_at", weekEndIsoExclusive)
      .order("staff_name", { ascending: true })
      .order("start_at", { ascending: true });

    if (branch !== "All") {
      sTodayQ = sTodayQ.eq("branch", branch);
      sWeekQ = sWeekQ.eq("branch", branch);
    }

    const aTodayQ = admin
      .from("rota_absences")
      .select("staff_name, absence_type, absence_label, start_date, end_date, is_partial")
      .eq("sync_run_id", runId)
      .lte("start_date", todayIso)
      .gte("end_date", todayIso)
      .order("staff_name", { ascending: true });

    const aWeekQ = admin
      .from("rota_absences")
      .select("staff_name, absence_type, absence_label, start_date, end_date, is_partial")
      .eq("sync_run_id", runId)
      .lte("start_date", weekEndIsoInclusiveDate)
      .gte("end_date", weekStartIso)
      .order("staff_name", { ascending: true });

    const [
      { data: sToday, error: sTodayErr },
      { data: aToday, error: aTodayErr },
      { data: sWeek, error: sWeekErr },
      { data: aWeek, error: aWeekErr },
    ] = await Promise.all([sTodayQ, aTodayQ, sWeekQ, aWeekQ]);

    if (sTodayErr) throw sTodayErr;
    if (aTodayErr) throw aTodayErr;
    if (sWeekErr) throw sWeekErr;
    if (aWeekErr) throw aWeekErr;

    const out = {
      today: todayIso,

      week_start: weekStartIso,
      week_end: isoDate(new Date(weekEnd.getTime() - 1)), // inclusive display (Sunday)

      shifts_today: (sToday || []).map((x) => ({
        name: labelFor(x.staff_name),
        branch: x.branch,
        label: x.label,
        start_at: x.start_at,
        end_at: x.end_at,
      })),

      absences_today: (aToday || []).map((x) => ({
        name: labelFor(x.staff_name),
        type: x.absence_type,
        label: x.absence_label,
        start_date: x.start_date,
        end_date: x.end_date,
        is_partial: !!x.is_partial,
      })),

      shifts_week: (sWeek || []).map((x) => ({
        name: labelFor(x.staff_name),
        branch: x.branch,
        label: x.label,
        start_at: x.start_at,
        end_at: x.end_at,
      })),

      absences_week: (aWeek || []).map((x) => ({
        name: labelFor(x.staff_name),
        type: x.absence_type,
        label: x.absence_label,
        start_date: x.start_date,
        end_date: x.end_date,
        is_partial: !!x.is_partial,
      })),
    };

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});