import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DateTime } from "https://esm.sh/luxon@3.5.0";

type IcsEvent = Record<string, string[]>;

function requireCronSecret(req: Request) {
  const expected = Deno.env.get("ROTA_CRON_SECRET");
  const got = req.headers.get("x-rota-cron-secret");
  if (!expected || got !== expected) return new Response("Unauthorized", { status: 401 });
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
    if (/^[ \t]/.test(line) && unfolded.length) unfolded[unfolded.length - 1] += line.slice(1);
    else unfolded.push(line);
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
    return { staff: parts[0].trim(), label: parts.slice(1).join(" - ").trim() };
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



/**
 * Parse an ICS local timestamp like 20260128T070000
 * Output:
 * - utcKey: "YYYY-MM-DD HH:MM:SS+00" (stable key)
 * - dbValue: "YYYY-MM-DDTHH:MM:SSZ" (for timestamptz insert)
 *
 * NOTE: This treats the numbers as UTC (no DST intelligence).
 * If Sage truly emits Europe/London local across DST, we can improve later.
 */
function parseIcsLondonToUtcKeyString(v: string): { utcKey: string; dbValue: string } {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) throw new Error(`Bad datetime: ${v}`);

  const [, Y, Mo, D, h, mi, s] = m;

  // Treat incoming ICS value as Europe/London wall-clock time
  const london = DateTime.fromObject(
    {
      year: +Y,
      month: +Mo,
      day: +D,
      hour: +h,
      minute: +mi,
      second: +s,
    },
    { zone: "Europe/London" }
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

function buildNaturalKey(staff: string, start_key: string, end_key: string, label: string): string {
  return `${norm(staff)}|${start_key}|${end_key}|${norm(label)}`;
}

Deno.serve(async (req) => {
  const authErr = requireCronSecret(req);
  if (authErr) return authErr;

  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SERVICE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const FEED_URL = getEnv("SAGE_SHIFT_ICAL_URL");

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const runSeenAt = new Date().toISOString();

  const res = await fetch(FEED_URL);
  if (!res.ok) return new Response(`Failed to fetch shift feed: ${res.status}`, { status: 500 });

  const ics = await res.text();
  const events = parseIcs(ics);

  const timed = events.filter((e) => (e["DTSTART"]?.[0] || "").includes("T"));

  const startDates: Date[] = [];

  const rows = timed
    .map((e) => {
      const uid = e["UID"]?.[0] ?? null;
      const dtstamp = e["DTSTAMP"]?.[0] ?? null;
      const summary = e["SUMMARY"]?.[0] ?? "";
      const dtstart = e["DTSTART"]?.[0];
      const dtend = e["DTEND"]?.[0];

      if (!uid) return null;
      if (!dtstart || !dtend) return null;

      const { staff, label } = parseSummary(summary);
      if (!staff) return null;

      const start = parseIcsLondonToUtcKeyString(dtstart);
      const end = parseIcsLondonToUtcKeyString(dtend);

      const startObj = new Date(start.dbValue);
      if (Number.isNaN(startObj.getTime())) return null;
      startDates.push(startObj);

      const branch = detectBranch(label);
      const natural_key = buildNaturalKey(staff, start.utcKey, end.utcKey, label);

      return {
        natural_key,
        source_uid: uid,
        dtstamp,
        staff_name: staff,
        label,
        branch,
        start_at: start.dbValue,
        end_at: end.dbValue,
        last_seen_at: runSeenAt,
      };
    })
    .filter(Boolean);

  // Upsert by source_uid (matches your unique constraint)
  const { error: upErr } = await sb
    .from("rota_shifts")
    .upsert(rows as any[], { onConflict: "source_uid" });

  if (upErr) return new Response(`Upsert error: ${upErr.message}`, { status: 500 });

  // If feed has no shifts, don't delete anything
  if (startDates.length === 0) {
    return new Response(JSON.stringify({ ok: true, shifts_upserted: 0, deleted: 0, note: "No shifts in feed; skipped delete." }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Delete only within the date span covered by THIS feed pull
  startDates.sort((a, b) => a.getTime() - b.getTime());

  const minStartIso = startDates[0].toISOString();
  const maxStart = startDates[startDates.length - 1];

  // cover the last day fully: [minStart, maxStart + 1 day)
  const maxPlus1 = new Date(maxStart);
  maxPlus1.setUTCDate(maxPlus1.getUTCDate() + 1);
  const maxExclusiveIso = maxPlus1.toISOString();

  const { error: delErr, count } = await sb
    .from("rota_shifts")
    .delete({ count: "exact" })
    .gte("start_at", minStartIso)
    .lt("start_at", maxExclusiveIso)
    .or(`last_seen_at.is.null,last_seen_at.lt.${runSeenAt}`);

  if (delErr) return new Response(`Delete cleanup error: ${delErr.message}`, { status: 500 });

  return new Response(JSON.stringify({ ok: true, shifts_upserted: rows.length, deleted: count ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});