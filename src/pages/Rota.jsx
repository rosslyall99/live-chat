import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import "./rota.css";

const BRANCHES = ["All Branches", "St Enoch", "Duke Street", "Hire", "Office"];
const BRANCH_ORDER = ["St Enoch", "Duke Street", "Hire", "Office"];

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtDay(d) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function fmtTimeRange(startIso, endIso) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sh = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const eh = e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${sh}–${eh}`;
}

function overlapsDate(abs, date) {
  // abs.start_date / end_date are YYYY-MM-DD (inclusive)
  const ds = new Date(abs.start_date + "T00:00:00Z");
  const de = new Date(abs.end_date + "T23:59:59Z");
  return date >= ds && date <= de;
}

function normName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// ---- TodayCard helpers + component (paste above Rota() in Rota.jsx) ----

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayMobile(d) {
  return d.toLocaleDateString("en-GB", {
    weekday: "narrow",
    day: "2-digit",
    month: "2-digit",
  });
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((x, y) => x.localeCompare(y));
}

function normBranch(branch) {
  const b = String(branch || "").trim().toLowerCase();

  // tweak these if your DB uses slightly different labels
  if (b.includes("st enoch") || b.includes("stenoch") || b === "se") return "stenoch";
  if (b.includes("duke")) return "duke";
  if (b.includes("hire")) return "hire";
  if (b.includes("office")) return "office";

  return null;
}

function buildTodayBuckets({ shifts, absences, today, labelFor, overlapsDate }) {
  // 1) Who is off today (HOL/SICK/OTHER) — used to EXCLUDE from branch columns
  const offToday = new Set(
    (absences || [])
      .filter((a) => overlapsDate(a, today))
      .map((a) => labelFor(a.staff_name))
  );

  // 2) Holiday + Sick columns (only from absences)
  const holiday = uniqueSorted(
    (absences || [])
      .filter((a) => overlapsDate(a, today) && a.absence_type === "HOL")
      .map((a) => labelFor(a.staff_name))
  );

  const sick = uniqueSorted(
    (absences || [])
      .filter((a) => overlapsDate(a, today) && a.absence_type === "SICK")
      .map((a) => labelFor(a.staff_name))
  );

  // 3) Branch columns (from shifts starting today, excluding anyone offToday)
  const buckets = {
    stenoch: [],
    duke: [],
    hire: [],
    office: [],
  };

  for (const s of shifts || []) {
    const start = new Date(s.start_at);
    if (!sameDay(start, today)) continue;

    const displayName = labelFor(s.staff_name);
    if (offToday.has(displayName)) continue; // key rule

    const key = normBranch(s.branch);
    if (!key) continue;

    buckets[key].push(displayName);
  }

  return {
    stenoch: uniqueSorted(buckets.stenoch),
    duke: uniqueSorted(buckets.duke),
    hire: uniqueSorted(buckets.hire),
    office: uniqueSorted(buckets.office),
    holiday,
    sick,
  };
}

function pillClassFor(key) {
  // Change these to match your existing rota pill colour classes
  switch (key) {
    case "stenoch":
      return "rota-pill--stenoch";
    case "duke":
      return "rota-pill--duke";
    case "hire":
      return "rota-pill--hire";
    case "office":
      return "rota-pill--office";
    case "holiday":
      return "rota-pill--hol";
    case "sick":
      return "rota-pill--sick";
    default:
      return "";
  }
}

function TodayCard({ shifts, absences, today, labelFor, overlapsDate, className = "" }) {
  const t = buildTodayBuckets({ shifts, absences, today, labelFor, overlapsDate });

  const cols = [
    { key: "stenoch", title: "St Enoch", className: "today-col today-col--stenoch", items: t.stenoch },
    { key: "duke", title: "Duke Street", className: "today-col today-col--duke", items: t.duke },
    { key: "hire", title: "Hire", className: "today-col today-col--hire", items: t.hire },
    { key: "office", title: "Office", className: "today-col today-col--office", items: t.office },
    { key: "holiday", title: "Holiday", className: "today-col today-col--holiday", items: t.holiday },
    { key: "sick", title: "Sick", className: "today-col today-col--sick", items: t.sick },
  ];

  return (
    <div className={["rota-card", "today-card", className].join(" ").trim()}>
      <div className="rota-toolbar today-toolbar">
        <div>
          <div className="rota-title">Today</div>
          <div className="rota-subtitle">{fmtDay(today)}</div>
        </div>
      </div>

      <div className="today-grid">
        {cols.map((c) => (
          <div key={c.key} className={c.className}>
            <div className="today-col-title">{c.title}</div>

            {c.items.length === 0 ? (
              <div className="today-empty">—</div>
            ) : (
              <div className="today-pillList">
                {c.items.map((name) => (
                  <span key={name} className={`rota-pill ${pillClassFor(c.key)}`}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function startOfDayLocal(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Rota() {
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date()));
  const [branch, setBranch] = React.useState("All");
  const [loading, setLoading] = React.useState(false);
  const [mobileView, setMobileView] = React.useState("today"); // "today" | "rota"

  const [shiftsWeek, setShiftsWeek] = React.useState([]);
  const [absencesWeek, setAbsencesWeek] = React.useState([]);

  const [shiftsToday, setShiftsToday] = React.useState([]);
  const [absencesToday, setAbsencesToday] = React.useState([]);

  // rota_match_name (Sage) -> CRM label (short_name/display_name)
  const [nameMap, setNameMap] = React.useState(() => ({}));

  const weekEnd = React.useMemo(() => addDays(weekStart, 7), [weekStart]); // exclusive
  const days = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 780px)").matches;

  // Auto-refresh every 2 minutes (keeps Today accurate)
  React.useEffect(() => {
    const timer = setInterval(() => {
      load(); // simplest version — reloads week + today
    }, 120_000); // 2 minutes

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNameMapAll() {
    const { data, error } = await supabase.rpc("get_rota_name_map");
    if (error) throw error;

    const out = {};
    for (const p of data || []) {
      const key = normName(p.rota_match_name);
      if (!key) continue;
      out[key] = String(p.display_name || p.rota_match_name).trim();
    }
    return out;
  }

  async function load() {
    setLoading(true);
    try {
      // -------- Week dataset (rota grid) --------
      const startIso = weekStart.toISOString();
      const endIso = weekEnd.toISOString();

      let sQ = supabase
        .from("rota_shifts")
        .select("staff_name, branch, label, start_at, end_at")
        .gte("start_at", startIso)
        .lt("start_at", endIso)
        .order("staff_name", { ascending: true })
        .order("start_at", { ascending: true });

      if (branch !== "All") sQ = sQ.eq("branch", branch);

      const aQ = supabase
        .from("rota_absences")
        .select("staff_name, absence_type, absence_label, start_date, end_date, is_partial")
        .lte("start_date", weekEnd.toISOString().slice(0, 10))
        .gte("end_date", weekStart.toISOString().slice(0, 10))
        .order("staff_name", { ascending: true });

      // -------- Today dataset (TodayCard) --------
      const today0 = startOfDayLocal(new Date());
      const tomorrow0 = addDays(today0, 1);

      const sTodayQ = supabase
        .from("rota_shifts")
        .select("staff_name, branch, label, start_at, end_at")
        .gte("start_at", today0.toISOString())
        .lt("start_at", tomorrow0.toISOString())
        .order("staff_name", { ascending: true })
        .order("start_at", { ascending: true });

      const aTodayQ = supabase
        .from("rota_absences")
        .select("staff_name, absence_type, absence_label, start_date, end_date, is_partial")
        .lte("start_date", today0.toISOString().slice(0, 10))
        .gte("end_date", today0.toISOString().slice(0, 10))
        .order("staff_name", { ascending: true });

      const [
        { data: sWeekData, error: sWeekErr },
        { data: aWeekData, error: aWeekErr },
        { data: sTodayData, error: sTodayErr },
        { data: aTodayData, error: aTodayErr },
      ] = await Promise.all([sQ, aQ, sTodayQ, aTodayQ]);

      if (sWeekErr) throw sWeekErr;
      if (aWeekErr) throw aWeekErr;
      if (sTodayErr) throw sTodayErr;
      if (aTodayErr) throw aTodayErr;

      setShiftsWeek(sWeekData ?? []);
      setAbsencesWeek(aWeekData ?? []);
      setShiftsToday(sTodayData ?? []);
      setAbsencesToday(aTodayData ?? []);

      // Mapping stays as-is
      const map = await loadNameMapAll();
      setNameMap(map);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, [weekStart, branch]);

  // Stable staff list: keep Sage key + render label
  const staff = React.useMemo(() => {
    // staffKey -> { key, counts: Map<branch, count> }
    const byStaff = new Map();

    // Count branches per staff across shifts (this week)
    for (const s of shiftsWeek) {
      const key = s.staff_name;
      const branch = s.branch || "Unknown";

      let rec = byStaff.get(key);
      if (!rec) {
        rec = { key, counts: new Map() };
        byStaff.set(key, rec);
      }

      rec.counts.set(branch, (rec.counts.get(branch) || 0) + 1);
    }

    // Ensure absence-only staff still appear
    for (const a of absencesWeek) {
      const key = a.staff_name;
      if (!byStaff.has(key)) {
        byStaff.set(key, { key, counts: new Map([["Unknown", 1]]) });
      }
    }

    const idx = (branch) => {
      const i = BRANCH_ORDER.indexOf(branch);
      return i === -1 ? 999 : i;
    };

    // Pick "most common branch" (ties broken by BRANCH_ORDER, then alphabetical)
    const picked = Array.from(byStaff.values()).map((rec) => {
      let bestBranch = "Unknown";
      let bestCount = -1;

      for (const [branch, count] of rec.counts.entries()) {
        if (count > bestCount) {
          bestCount = count;
          bestBranch = branch;
          continue;
        }
        if (count === bestCount) {
          // tie-break: earlier in BRANCH_ORDER wins
          const a = idx(branch);
          const b = idx(bestBranch);
          if (a < b) bestBranch = branch;
          // if still tied (both unknown), stable tie-break later via label sort
        }
      }

      const label = nameMap[normName(rec.key)] || rec.key;

      return {
        key: rec.key,          // Sage key for lookups
        label,                 // CRM display name
        branch: bestBranch,    // most common branch this week
        branchIndex: idx(bestBranch),
      };
    });

    // Sort: branch groups first, then by label
    picked.sort((a, b) => {
      if (a.branchIndex !== b.branchIndex) return a.branchIndex - b.branchIndex;
      return a.label.localeCompare(b.label);
    });

    // Add divider flags (true when branch group changes)
    let prevBranchIndex = null;
    return picked.map((s, i) => {
      const dividerBefore = i > 0 && s.branchIndex !== prevBranchIndex;
      prevBranchIndex = s.branchIndex;
      return { ...s, dividerBefore };
    });
  }, [shiftsWeek, absencesWeek, nameMap]);

  const today = React.useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const labelFor = React.useCallback(
    (sageName) => nameMap[normName(sageName)] || sageName,
    [nameMap]
  );

  function pillClassForAbsenceType(type) {
    const t = String(type || "").toUpperCase();
    if (t === "HOL") return "rota-pill rota-pill--hol";   // Purple
    if (t === "SICK") return "rota-pill rota-pill--sick"; // Yellow
    return "rota-pill rota-pill--other";
  }

  function pillClassForBranch(branch) {
    const b = String(branch || "").toLowerCase();

    if (b.includes("st enoch")) return "rota-pill rota-pill--stenoch";     // Blue
    if (b.includes("duke")) return "rota-pill rota-pill--duke";           // Green
    if (b.includes("hire")) return "rota-pill rota-pill--hire";           // Orange
    if (b.includes("office")) return "rota-pill rota-pill--office";       // Red

    return "rota-pill rota-pill--unknown";
  }

  function cellFor(staffNameKey, day) {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addDays(dayStart, 1);

    // Absence priority
    const abs = absencesWeek.find((a) => normName(a.staff_name) === normName(staffNameKey) && overlapsDate(a, dayStart));
    if (abs) {
      const label = String(abs.absence_type || "OTHER").toUpperCase();
      return (
        <span className={pillClassForAbsenceType(label)} title={abs.absence_label || ""}>
          {label}
          {abs.is_partial ? " (Partial)" : ""}
        </span>
      );
    }

    // Shift
    const shift = shiftsWeek.find((s) => {
      if (normName(s.staff_name) !== normName(staffNameKey)) return false;
      const st = new Date(s.start_at);
      return st >= dayStart && st < dayEnd;
    });

    if (shift) {
      return (
        <span className={pillClassForBranch(shift.branch)} title={shift.label || ""}>
          {fmtTimeRange(shift.start_at, shift.end_at)}
        </span>
      );
    }

    return <span className="rota-empty">—</span>;
  }

  return (
    <div className="rota-page">
      {/* Mobile-only Today / Rota toggle */}
      <div className="rota-mobileNav">
        <button
          type="button"
          className={`rota-mobileTab ${mobileView === "today" ? "is-active" : ""}`}
          onClick={() => setMobileView("today")}
        >
          Today
        </button>
        <button
          type="button"
          className={`rota-mobileTab ${mobileView === "rota" ? "is-active" : ""}`}
          onClick={() => setMobileView("rota")}
        >
          Rota
        </button>
      </div>
      {/* Today card (separate) */}
      <div className="rota-stack">
        <TodayCard
          className={mobileView !== "today" ? "rota-mobilePane--hidden" : ""}
          shifts={shiftsToday}
          absences={absencesToday}
          today={today}
          labelFor={labelFor}
          overlapsDate={overlapsDate}
        />

        {/* Main Rota card (toolbar + grid inside one white card) */}
        <div className={`rota-card ${mobileView !== "rota" ? "rota-mobilePane--hidden" : ""}`}>
          {/* Header / toolbar */}
          <div className="rota-toolbar">
            <div>
              <div className="rota-title">Rota</div>
              <div className="rota-subtitle">
                {fmtDay(weekStart)} → {fmtDay(addDays(weekStart, 6))}
              </div>
            </div>

            <div className="rota-actions">
              <button
                className="rota-btn"
                onClick={() => setWeekStart(startOfWeek(addDays(weekStart, -7)))}
              >
                ← Prev
              </button>

              <button className="rota-btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                This week
              </button>

              <button
                className="rota-btn"
                onClick={() => setWeekStart(startOfWeek(addDays(weekStart, 7)))}
              >
                Next →
              </button>

              <select className="rota-select" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <button className="rota-btn" onClick={load} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {/* Grid */}
          <div className="rota-gridWrap">
            <div className="rota-gridInner">
              <table className="rota-grid">
                <thead>
                  <tr>
                    <th className="rota-staffCol">Day</th>
                    {staff.map((s, i) => {
                      const bKey = normBranch(s.branch) || "unknown";
                      return (
                        <th
                          key={s.key}
                          className={[
                            "rota-branch",
                            `rota-branch--${bKey}`,
                            s.dividerBefore ? "rota-colDivider" : "",
                          ].join(" ").trim()}
                        >
                          {s.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {days.map((d) => (
                    <tr key={d.toISOString()}>
                      <th className="rota-staffCol" style={{ fontWeight: 850, whiteSpace: "nowrap" }}>
                        {isMobile ? formatDayMobile(d) : fmtDay(d)}
                      </th>

                      {staff.map((s, i) => {
                        const bKey = normBranch(s.branch) || "unknown";
                        return (
                          <td
                            key={s.key}
                            className={[
                              "rota-branch",
                              `rota-branch--${bKey}`,
                              i === 0 ? "rota-afterDayDivider" : "",
                              s.dividerBefore ? "rota-colDivider" : "",
                            ].join(" ").trim()}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {cellFor(s.key, d)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}