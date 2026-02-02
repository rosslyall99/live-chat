import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addDaysUtc(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function parseIso(s: unknown): Date | null {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function requireAdmin(req: Request) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token" } as const;
  }
  const jwt = authHeader.split(" ")[1];

  // Validate JWT via GoTrue (doesn't require SERVICE key)
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!authRes.ok) return { ok: false, status: 401, error: "Invalid token" } as const;

  const user = await authRes.json();
  const userId = user?.id as string | undefined;
  if (!userId) return { ok: false, status: 401, error: "No user id" } as const;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: profile, error: profErr } = await admin
    .from("staff_profiles")
    .select("user_id, role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profErr) return { ok: false, status: 500, error: profErr.message } as const;
  if (!profile?.is_active) return { ok: false, status: 403, error: "Inactive staff" } as const;
  if (profile.role !== "admin") return { ok: false, status: 403, error: "Admins only" } as const;

  return { ok: true, admin, caller_user_id: userId } as const;
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return s / nums.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const gate = await requireAdmin(req);
  if (!gate.ok) return json(gate.status, { error: gate.error });
  const { admin } = gate;

  try {
    const body = await req.json().catch(() => ({}));

    const range = String(body.range || "7d"); // today | 7d | 30d | custom
    const site_id = body.site_id ? String(body.site_id) : null;
    const agent_id = body.agent_id ? String(body.agent_id) : null;

    const now = new Date();
    let start: Date;
    let end: Date;

    if (range === "today") {
      start = startOfUtcDay(now);
      end = now;
    } else if (range === "7d") {
      end = now;
      start = addDaysUtc(end, -7);
    } else if (range === "30d") {
      end = now;
      start = addDaysUtc(end, -30);
    } else if (range === "custom") {
      const s = parseIso(body.start);
      const e = parseIso(body.end);
      if (!s || !e) return json(400, { error: "custom range requires ISO start and end" });
      start = s;
      end = e;
    } else {
      return json(400, { error: `Invalid range: ${range}` });
    }

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // ----------------------------
    // 1) Conversations created in range (for claimed + first reply + open snapshot)
    // ----------------------------
    let createdQ = admin
      .from("conversations")
      .select("id, site_id, assigned_to, status, created_at, last_message_at, closed_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    if (site_id) createdQ = createdQ.eq("site_id", site_id);
    if (agent_id) createdQ = createdQ.eq("assigned_to", agent_id);

    const { data: createdConvos, error: createdErr } = await createdQ;
    if (createdErr) return json(500, { error: createdErr.message });

    const createdList = createdConvos || [];
    const createdIds = createdList.map((c) => c.id);

    // ----------------------------
    // 2) Conversations closed in range (for closure + duration)
    // ----------------------------
    let closedQ = admin
      .from("conversations")
      .select("id, site_id, assigned_to, status, created_at, closed_at")
      .eq("status", "closed")
      .not("closed_at", "is", null)
      .gte("closed_at", startIso)
      .lte("closed_at", endIso);

    if (site_id) closedQ = closedQ.eq("site_id", site_id);
    if (agent_id) closedQ = closedQ.eq("assigned_to", agent_id);

    const { data: closedConvos, error: closedErr } = await closedQ;
    if (closedErr) return json(500, { error: closedErr.message });

    const closedList = closedConvos || [];

    // ----------------------------
    // 3) First staff reply times (for convos created in range)
    //    Fetch only staff messages for those conversation ids
    // ----------------------------
    const firstStaffAtByConvo = new Map<string, string>(); // convoId -> ISO
    if (createdIds.length > 0) {
      // chunk to avoid huge IN lists
      const chunkSize = 500;
      for (let i = 0; i < createdIds.length; i += chunkSize) {
        const chunk = createdIds.slice(i, i + chunkSize);

        const { data: staffMsgs, error: msgErr } = await admin
          .from("messages")
          .select("conversation_id, created_at, sender_type")
          .in("conversation_id", chunk)
          .eq("sender_type", "staff")
          .order("created_at", { ascending: true });

        if (msgErr) return json(500, { error: msgErr.message });

        for (const m of staffMsgs || []) {
          if (!firstStaffAtByConvo.has(m.conversation_id)) {
            firstStaffAtByConvo.set(m.conversation_id, m.created_at);
          }
        }
      }
    }

    // ----------------------------
    // 4) Aggregate per agent
    // ----------------------------
    type AgentAgg = {
      user_id: string;
      claimed_count: number;
      closed_count: number;
      first_reply_seconds: number[];
      durations_minutes: number[];
    };

    const agg = new Map<string, AgentAgg>();

    function getAgg(uid: string): AgentAgg {
      const existing = agg.get(uid);
      if (existing) return existing;
      const fresh: AgentAgg = {
        user_id: uid,
        claimed_count: 0,
        closed_count: 0,
        first_reply_seconds: [],
        durations_minutes: [],
      };
      agg.set(uid, fresh);
      return fresh;
    }

    // Claimed + first reply (based on conversations CREATED in range)
    for (const c of createdList) {
      const uid = c.assigned_to as string | null;
      if (!uid) continue; // skip unassigned for per-agent stats

      const a = getAgg(uid);
      a.claimed_count += 1;

      const firstStaffIso = firstStaffAtByConvo.get(c.id);
      if (firstStaffIso) {
        const t0 = new Date(c.created_at).getTime();
        const t1 = new Date(firstStaffIso).getTime();
        const sec = Math.max(0, Math.floor((t1 - t0) / 1000));
        a.first_reply_seconds.push(sec);
      }
    }

    // Closed + duration (based on conversations CLOSED in range)
    for (const c of closedList) {
      const uid = c.assigned_to as string | null;
      if (!uid) continue;

      const a = getAgg(uid);
      a.closed_count += 1;

      if (c.closed_at) {
        const t0 = new Date(c.created_at).getTime();
        const t1 = new Date(c.closed_at).getTime();
        const mins = Math.max(0, (t1 - t0) / 60000);
        a.durations_minutes.push(mins);
      }
    }

    const agentIds = Array.from(agg.keys());

    // ----------------------------
    // 5) Enrich with staff profile info
    // ----------------------------
    let staffProfiles: any[] = [];
    if (agentIds.length > 0) {
      const { data: profs, error: profErr } = await admin
        .from("staff_profiles")
        .select("user_id, username, display_name, site_id, role, is_active, created_at")
        .in("user_id", agentIds);

      if (profErr) return json(500, { error: profErr.message });
      staffProfiles = profs || [];
    }

    const profileMap = new Map<string, any>();
    for (const p of staffProfiles) profileMap.set(p.user_id, p);

    const agents = agentIds
      .map((uid) => {
        const a = agg.get(uid)!;
        const p = profileMap.get(uid);

        return {
          user_id: uid,
          username: p?.username || null,
          display_name: p?.display_name || p?.username || null,
          staff_site_id: p?.site_id || null,
          role: p?.role || null,
          is_active: p?.is_active ?? null,

          claimed_count: a.claimed_count,
          closed_count: a.closed_count,

          avg_first_reply_seconds: avg(a.first_reply_seconds),
          avg_chat_duration_minutes: avg(a.durations_minutes),
        };
      })
      .sort((x, y) => (y.closed_count || 0) - (x.closed_count || 0));

    // ----------------------------
    // 6) Overall summary (helpful at a glance)
    // ----------------------------
    const overall = {
      range: { start: startIso, end: endIso, range, site_id, agent_id },
      created_conversations: createdList.length,
      created_assigned: createdList.filter((c) => !!c.assigned_to).length,
      created_unassigned: createdList.filter((c) => !c.assigned_to).length,
      closed_conversations: closedList.length,
    };

    return json(200, { overall, agents });
  } catch (e) {
    console.error("admin_chat_metrics error", e);
    return json(500, { error: String(e) });
  }
});
