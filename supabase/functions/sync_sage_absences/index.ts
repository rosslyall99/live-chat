import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function isIgnorable(summaryOrLabel: string): boolean {
  const s = (summaryOrLabel ?? "").toLowerCase();
  return s.includes("birthday") || s.includes("employment anniversary");
}

function parseDateCompact(v: string): string {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) throw new Error(`Bad date: ${v}`);
  const [, Y, Mo, D] = m;
  return `${Y}-${Mo}-${D}`;
}

// Sage all-day events use DTEND as exclusive; end_date should be inclusive.
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

function buildNaturalKey(
  staff: string,
  start_date: string,
  end_date: string,
  absence_type: string,
  absence_label: string,
): string {
  return `${norm(staff)}|${start_date}|${end_date}|${norm(absence_type)}|${norm(absence_label)}`;
}

Deno.serve(async (req) => {
  const authErr = requireCronSecret(req);
  if (authErr) return authErr;

  const SUPABASE_URL = getEnv("SUPABASE_URL");
  const SERVICE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const FEED_URL = getEnv("SAGE_ABSENCE_ICAL_URL");

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const runSeenAt = new Date().toISOString();

  const res = await fetch(FEED_URL);
  if (!res.ok) return new Response(`Failed to fetch absence feed: ${res.status}`, { status: 500 });

  const ics = await res.text();
  const events = parseIcs(ics);

  // All-day absences have DTSTART like 20260128 (no "T")
  const allday = events.filter((e) => {
    const dt = e["DTSTART"]?.[0] || "";
    return dt.length === 8 && /^\d{8}$/.test(dt);
  });

  const rows = allday
    .map((e) => {
      const uid = e["UID"]?.[0] ?? null;
      const dtstamp = e["DTSTAMP"]?.[0] ?? null;
      const summary = e["SUMMARY"]?.[0] ?? "";
      const dtstart = e["DTSTART"]?.[0];
      const dtend = e["DTEND"]?.[0];

      if (!uid) return null;
      if (!dtstart || !dtend) return null;
      if (isIgnorable(summary)) return null;

      const { staff, label } = parseSummary(summary);
      if (!staff) return null;

      const start_date = parseDateCompact(dtstart);
      const end_exclusive = parseDateCompact(dtend);
      const end_date = minusOneDay(end_exclusive);

      const cls = classifyAbsence(label);

      const absence_label = label?.trim() ? label.trim() : "(no label)";
      const absence_type = cls.absence_type;

      const natural_key = buildNaturalKey(staff, start_date, end_date, absence_type, absence_label);

      return {
        natural_key,
        source_uid: uid,
        dtstamp,
        staff_name: staff,
        absence_label,
        absence_type,
        start_date,
        end_date,
        is_partial: cls.is_partial,
        last_seen_at: runSeenAt,
      };
    })
    .filter(Boolean);

  const { error: upErr } = await sb
    .from("rota_absences")
    .upsert(rows as any[], { onConflict: "source_uid" });

  if (upErr) return new Response(`Upsert error: ${upErr.message}`, { status: 500 });

  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, absences_upserted: 0, deleted: 0, note: "No absences in feed; skipped delete." }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Feed-covered span (min start_date, max end_date)
  const startMin = rows.reduce((m: string, r: any) => (r.start_date < m ? r.start_date : m), (rows[0] as any).start_date);
  const endMax = rows.reduce((m: string, r: any) => (r.end_date > m ? r.end_date : m), (rows[0] as any).end_date);

  // Delete only absences overlapping that span that weren't seen this run
  const { error: delErr, count } = await sb
    .from("rota_absences")
    .delete({ count: "exact" })
    .lte("start_date", endMax)
    .gte("end_date", startMin)
    .or(`last_seen_at.is.null,last_seen_at.lt.${runSeenAt}`);

  if (delErr) return new Response(`Delete cleanup error: ${delErr.message}`, { status: 500 });

  return new Response(JSON.stringify({ ok: true, absences_upserted: rows.length, deleted: count ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});