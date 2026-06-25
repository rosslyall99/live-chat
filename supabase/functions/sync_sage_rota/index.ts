import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DateTime } from "https://esm.sh/luxon@3.5.0";

type IcsEvent = Record<string, string[]>;

function requireCronSecret(req: Request) {
  const expected = Deno.env.get("ROTA_CRON_SECRET");
  const got = req.headers.get("x-rota-cron-secret");
  if (!expected || got !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * Minimal ICS parser:
 * - Handles CRLF
 * - Handles folded lines (lines starting with space/tab)
 * - Captures VEVENT blocks
 * - Stores keys without params (DTSTART;TZID=... -> DTSTART)
 */
function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  const unfolded: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  const events: IcsEvent[] = [];
  let cur: IcsEvent | null = null;

  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;

    const rawKey = line.slice(0, idx);
    const val = line.slice(idx + 1);
    const key = rawKey.split(";")[0].trim().toUpperCase();

    cur[key] ||= [];
    cur[key].push(val);
  }

  return events;
}

function norm(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parseSummary(summary: string): { staff: string; label: string } {
  const parts = (summary ?? "").split(" - ");
  if (parts.length >= 2) {
    return {
      staff: parts[0].trim(),
      label: parts.slice(1).join(" - ").trim(),
    };
  }
  return { staff: (summary ?? "").trim(), label: "" };
}

function detectBranch(label: string): string {
  const s = (label ?? "").toLowerCase();
  if (s.includes("duke street") || s.includes("duke st")) return "Duke Street";
  if (s.includes("st enoch")) return "St Enoch";
  if (s.includes("hire dept")) return "Hire";
  if (s.includes("office")) return "Office";
  return "Unknown";
}

function isIgnorable(summaryOrLabel: string): boolean {
  const s = (summaryOrLabel ?? "").toLowerCase();
  return s.includes("birthday") || s.includes("employment anniversary");
}

/**
 * Parse an ICS local timestamp like 20260128T070000 as Europe/London wall-clock
 * and convert to UTC.
 */
function parseIcsLondonToUtcKeyString(v: string): { utcKey: string; dbValue: string } {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) throw new Error(`Bad datetime: ${v}`);

  const [, Y, Mo, D, h, mi, s] = m;

  const london = DateTime.fromObject(
    {
      year: +Y,
      month: +Mo,
      day: +D,
      hour: +h,
      minute: +mi,
      second: +s,
    },
    { zone: "Europe/London" },
  );

  if (!london.isValid) {
    throw new Error(`Invalid Europe/London datetime: ${v} (${london.invalidReason || "unknown"})`);
  }

  const utc = london.toUTC();
  const utcKey = utc.toFormat("yyyy-MM-dd HH:mm:ss'+00'");
  const dbValue = utc.toISO({ suppressMilliseconds: true });

  if (!dbValue) throw new Error(`Failed to convert datetime to ISO: ${v}`);

  return { utcKey, dbValue };
}

function parseDateCompact(v: string): string {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) throw new Error(`Bad date: ${v}`);
  const [, Y, Mo, D] = m;
  return `${Y}-${Mo}-${D}`;
}

/**
 * Sage all-day events use DTEND as exclusive.
 */
function minusOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function classifyAbsence(label: string): { absence_type: "SICK" | "HOL" | "OTHER"; is_partial: boolean } {
  const s = (label ?? "").toLowerCase();

  const is_partial =
    s.includes("first part of the day") ||
    s.includes("second part of the day") ||
    s.includes("half day") ||
    s.includes("part of the day");

  if (s.includes("sick")) return { absence_type: "SICK", is_partial };
  if (s.includes("regular hours") || s.includes("salaried staff")) return { absence_type: "HOL", is_partial };

  return { absence_type: "OTHER", is_partial };
}

function buildShiftNaturalKey(staff: string, startKey: string, endKey: string, label: string): string {
  return `${norm(staff)}|${startKey}|${endKey}|${norm(label)}`;
}

function buildAbsenceNaturalKey(
  staff: string,
  startDate: string,
  endDate: string,
  absenceType: string,
  absenceLabel: string,
): string {
  return `${norm(staff)}|${startDate}|${endDate}|${norm(absenceType)}|${norm(absenceLabel)}`;
}

type ShiftRow = {
  natural_key: string;
  source_uid: string;
  dtstamp: string | null;
  staff_name: string;
  label: string;
  branch: string;
  start_at: string;
  end_at: string;
  last_seen_at: string;
  sync_run_id: string;
};

type AbsenceRow = {
  natural_key: string;
  source_uid: string;
  dtstamp: string | null;
  staff_name: string;
  absence_label: string;
  absence_type: "SICK" | "HOL" | "OTHER";
  start_date: string;
  end_date: string;
  is_partial: boolean;
  last_seen_at: string;
  sync_run_id: string;
};

function buildShiftRows(ics: string, runSeenAt: string, runId: string): ShiftRow[] {
  const events = parseIcs(ics);

  const timed = events.filter((e) => (e["DTSTART"]?.[0] || "").includes("T"));

  return timed
    .map((e) => {
      const uid = e["UID"]?.[0] ?? null;
      const dtstamp = e["DTSTAMP"]?.[0] ?? null;
      const summary = e["SUMMARY"]?.[0] ?? "";
      const dtstart = e["DTSTART"]?.[0];
      const dtend = e["DTEND"]?.[0];

      if (!uid || !dtstart || !dtend) return null;

      const { staff, label } = parseSummary(summary);
      if (!staff) return null;

      const start = parseIcsLondonToUtcKeyString(dtstart);
      const end = parseIcsLondonToUtcKeyString(dtend);

      return {
        natural_key: buildShiftNaturalKey(staff, start.utcKey, end.utcKey, label),
        source_uid: uid,
        dtstamp,
        staff_name: staff,
        label,
        branch: detectBranch(label),
        start_at: start.dbValue,
        end_at: end.dbValue,
        last_seen_at: runSeenAt,
        sync_run_id: runId,
      } satisfies ShiftRow;
    })
    .filter((row): row is ShiftRow => !!row);
}

function buildAbsenceRows(ics: string, runSeenAt: string, runId: string): AbsenceRow[] {
  const events = parseIcs(ics);

  const allday = events.filter((e) => {
    const dt = e["DTSTART"]?.[0] || "";
    return dt.length === 8 && /^\d{8}$/.test(dt);
  });

  return allday
    .map((e) => {
      const uid = e["UID"]?.[0] ?? null;
      const dtstamp = e["DTSTAMP"]?.[0] ?? null;
      const summary = e["SUMMARY"]?.[0] ?? "";
      const dtstart = e["DTSTART"]?.[0];
      const dtend = e["DTEND"]?.[0];

      if (!uid || !dtstart || !dtend) return null;
      if (isIgnorable(summary)) return null;

      const { staff, label } = parseSummary(summary);
      if (!staff) return null;

      const start_date = parseDateCompact(dtstart);
      const end_exclusive = parseDateCompact(dtend);
      const end_date = minusOneDay(end_exclusive);

      const cls = classifyAbsence(label);
      const absence_label = label?.trim() ? label.trim() : "(no label)";

      return {
        natural_key: buildAbsenceNaturalKey(staff, start_date, end_date, cls.absence_type, absence_label),
        source_uid: uid,
        dtstamp,
        staff_name: staff,
        absence_label,
        absence_type: cls.absence_type,
        start_date,
        end_date,
        is_partial: cls.is_partial,
        last_seen_at: runSeenAt,
        sync_run_id: runId,
      } satisfies AbsenceRow;
    })
    .filter((row): row is AbsenceRow => !!row);
}

async function cleanupOldShiftRows(
  sb: ReturnType<typeof createClient>,
  shiftRows: ShiftRow[],
  runId: string,
): Promise<number> {
  if (!shiftRows.length) return 0;

  const starts = shiftRows
    .map((r) => new Date(r.start_at).getTime())
    .sort((a, b) => a - b);

  const minStartIso = new Date(starts[0]).toISOString();

  const maxStart = new Date(starts[starts.length - 1]);
  maxStart.setUTCDate(maxStart.getUTCDate() + 1);
  const maxExclusiveIso = maxStart.toISOString();

  const { error, count } = await sb
    .from("rota_shifts")
    .delete({ count: "exact" })
    .gte("start_at", minStartIso)
    .lt("start_at", maxExclusiveIso)
    .neq("sync_run_id", runId);

  if (error) throw error;
  return count ?? 0;
}

async function cleanupOldAbsenceRows(
  sb: ReturnType<typeof createClient>,
  absenceRows: AbsenceRow[],
  runId: string,
): Promise<number> {
  if (!absenceRows.length) return 0;

  const startMin = absenceRows.reduce(
    (m, r) => (r.start_date < m ? r.start_date : m),
    absenceRows[0].start_date,
  );

  const endMax = absenceRows.reduce(
    (m, r) => (r.end_date > m ? r.end_date : m),
    absenceRows[0].end_date,
  );

  const { error, count } = await sb
    .from("rota_absences")
    .delete({ count: "exact" })
    .lte("start_date", endMax)
    .gte("end_date", startMin)
    .neq("sync_run_id", runId);

  if (error) throw error;
  return count ?? 0;
}

Deno.serve(async (req) => {
  const authErr = requireCronSecret(req);
  if (authErr) return authErr;

  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SERVICE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const SHIFT_FEED_URL = getEnv("SAGE_SHIFT_ICAL_URL");
  const ABSENCE_FEED_URL = getEnv("SAGE_ABSENCE_ICAL_URL");

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  let runId: string | null = null;

  try {
    const { data: run, error: runErr } = await sb
      .from("rota_sync_runs")
      .insert({ status: "pending" })
      .select("id")
      .single();

    if (runErr) throw runErr;
    runId = run.id;

    const [shiftRes, absenceRes] = await Promise.all([
      fetch(SHIFT_FEED_URL),
      fetch(ABSENCE_FEED_URL),
    ]);

    if (!shiftRes.ok) {
      throw new Error(`Failed to fetch shift feed: ${shiftRes.status}`);
    }
    if (!absenceRes.ok) {
      throw new Error(`Failed to fetch absence feed: ${absenceRes.status}`);
    }

    const [shiftIcs, absenceIcs] = await Promise.all([
      shiftRes.text(),
      absenceRes.text(),
    ]);

    const runSeenAt = new Date().toISOString();

    const shiftRows = buildShiftRows(shiftIcs, runSeenAt, runId);
    const absenceRows = buildAbsenceRows(absenceIcs, runSeenAt, runId);

    if (shiftRows.length > 0) {
      const { error } = await sb
        .from("rota_shifts")
        .upsert(shiftRows, { onConflict: "source_uid" });

      if (error) throw error;
    }

    if (absenceRows.length > 0) {
      const { error } = await sb
        .from("rota_absences")
        .upsert(absenceRows, { onConflict: "source_uid" });

      if (error) throw error;
    }

    const shiftsDeleted = await cleanupOldShiftRows(sb, shiftRows, runId);
    const absencesDeleted = await cleanupOldAbsenceRows(sb, absenceRows, runId);

    const { error: completeErr } = await sb
      .from("rota_sync_runs")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
        notes: JSON.stringify({
          shifts_upserted: shiftRows.length,
          absences_upserted: absenceRows.length,
          shifts_deleted: shiftsDeleted,
          absences_deleted: absencesDeleted,
        }),
      })
      .eq("id", runId);

    if (completeErr) throw completeErr;

    return new Response(
      JSON.stringify({
        ok: true,
        sync_run_id: runId,
        shifts_upserted: shiftRows.length,
        absences_upserted: absenceRows.length,
        shifts_deleted: shiftsDeleted,
        absences_deleted: absencesDeleted,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (runId) {
      await sb
        .from("rota_sync_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          notes: msg,
        })
        .eq("id", runId);
    }

    return new Response(msg, { status: 500 });
  }
});