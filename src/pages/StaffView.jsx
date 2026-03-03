import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import "./rota.css";

const BRANCHES = ["All", "St Enoch", "Duke Street", "Hire", "Office"];
const BRANCH_ORDER = ["St Enoch", "Duke Street", "Hire", "Office"];

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function startOfWeekLocal(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
}

function fmtDay(d) {
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

function fmtTimeRange(startIso, endIso) {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const sh = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const eh = e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${sh}–${eh}`;
}

function overlapsDate(abs, date) {
    const ds = new Date(abs.start_date + "T00:00:00Z");
    const de = new Date(abs.end_date + "T23:59:59Z");
    return date >= ds && date <= de;
}

function normName(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function normBranch(branch) {
    const b = String(branch || "").trim().toLowerCase();
    if (b.includes("st enoch") || b.includes("stenoch") || b === "se") return "stenoch";
    if (b.includes("duke")) return "duke";
    if (b.includes("hire")) return "hire";
    if (b.includes("office")) return "office";
    return "unknown";
}

function uniqueSorted(arr) {
    return Array.from(new Set(arr)).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function pillClassForToday(key) {
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

function buildTodayBuckets({ shifts, absences, today }) {
    const offToday = new Set((absences || []).filter((a) => overlapsDate(a, today)).map((a) => a.name));

    const holiday = uniqueSorted(
        (absences || []).filter((a) => overlapsDate(a, today) && String(a.type || "").toUpperCase() === "HOL").map((a) => a.name)
    );
    const sick = uniqueSorted(
        (absences || []).filter((a) => overlapsDate(a, today) && String(a.type || "").toUpperCase() === "SICK").map((a) => a.name)
    );

    const buckets = { stenoch: [], duke: [], hire: [], office: [] };

    for (const s of shifts || []) {
        const start = new Date(s.start_at);
        if (!sameDay(start, today)) continue;

        const displayName = String(s.name || "").trim();
        if (!displayName) continue;
        if (offToday.has(displayName)) continue;

        const key = normBranch(s.branch);
        if (key === "unknown") continue;

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

function TodayCard({ shifts, absences, today }) {
    const t = buildTodayBuckets({ shifts, absences, today });

    const cols = [
        { key: "stenoch", title: "St Enoch", className: "today-col today-col--stenoch", items: t.stenoch },
        { key: "duke", title: "Duke Street", className: "today-col today-col--duke", items: t.duke },
        { key: "hire", title: "Hire", className: "today-col today-col--hire", items: t.hire },
        { key: "office", title: "Office", className: "today-col today-col--office", items: t.office },
        { key: "holiday", title: "Holiday", className: "today-col today-col--holiday", items: t.holiday },
        { key: "sick", title: "Sick", className: "today-col today-col--sick", items: t.sick },
    ];

    return (
        <div className="rota-card today-card">
            <div className="rota-toolbar">
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
                                    <span key={name} className={`rota-pill ${pillClassForToday(c.key)}`}>
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

function pillClassForAbsenceType(type) {
    const t = String(type || "").toUpperCase();
    if (t === "HOL") return "rota-pill rota-pill--hol";
    if (t === "SICK") return "rota-pill rota-pill--sick";
    return "rota-pill rota-pill--other";
}

function pillClassForBranch(branch) {
    const b = String(branch || "").toLowerCase();
    if (b.includes("st enoch")) return "rota-pill rota-pill--stenoch";
    if (b.includes("duke")) return "rota-pill rota-pill--duke";
    if (b.includes("hire")) return "rota-pill rota-pill--hire";
    if (b.includes("office")) return "rota-pill rota-pill--office";
    return "rota-pill rota-pill--unknown";
}

function getParam(name) {
    try {
        return new URLSearchParams(window.location.search).get(name) || "";
    } catch {
        return "";
    }
}

function setParams(next) {
    const url = new URL(window.location.href);
    Object.entries(next).forEach(([k, v]) => {
        if (!v) url.searchParams.delete(k);
        else url.searchParams.set(k, v);
    });
    window.history.replaceState({}, "", url.toString());
}

export default function StaffView() {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    const [branch, setBranch] = React.useState(() => getParam("branch") || "All");
    const [weekStart, setWeekStart] = React.useState(() => {
        const w = getParam("week");
        if (w && /^\d{4}-\d{2}-\d{2}$/.test(w)) return new Date(w + "T00:00:00");
        return startOfWeekLocal(new Date());
    });

    const [shiftsToday, setShiftsToday] = React.useState([]);
    const [absencesToday, setAbsencesToday] = React.useState([]);
    const [shiftsWeek, setShiftsWeek] = React.useState([]);
    const [absencesWeek, setAbsencesWeek] = React.useState([]);

    const today = React.useMemo(() => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        return t;
    }, []);

    const days = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

    async function load() {
        setLoading(true);
        setError("");

        try {
            const k = getParam("k");
            if (!k) throw new Error("Missing key (k) in URL");

            const weekIso = weekStart.toISOString().slice(0, 10);

            const { data, error } = await supabase.functions.invoke("staff_view_data", {
                body: { k, week: weekIso, branch },
            });

            if (error) throw error;
            if (!data) throw new Error("No data returned");

            setShiftsToday(data.shifts_today || []);
            setAbsencesToday(data.absences_today || []);

            setShiftsWeek(data.shifts_week || []);
            setAbsencesWeek(data.absences_week || []);
        } catch (e) {
            setError(e?.message || String(e));
            setShiftsToday([]);
            setAbsencesToday([]);
            setShiftsWeek([]);
            setAbsencesWeek([]);
        } finally {
            setLoading(false);
        }
    }

    // keep URL in sync (shareable iframe URL)
    React.useEffect(() => {
        const weekIso = weekStart.toISOString().slice(0, 10);
        setParams({ week: weekIso, branch });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart, branch]);

    React.useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart, branch]);

    // Stable staff list (first-name keys)
    const staff = React.useMemo(() => {
        const byStaff = new Map();

        for (const s of shiftsWeek) {
            const key = s.name;
            const br = s.branch || "Unknown";
            let rec = byStaff.get(key);
            if (!rec) {
                rec = { key, counts: new Map() };
                byStaff.set(key, rec);
            }
            rec.counts.set(br, (rec.counts.get(br) || 0) + 1);
        }

        for (const a of absencesWeek) {
            const key = a.name;
            if (!byStaff.has(key)) byStaff.set(key, { key, counts: new Map([["Unknown", 1]]) });
        }

        const idx = (br) => {
            const i = BRANCH_ORDER.indexOf(br);
            return i === -1 ? 999 : i;
        };

        const picked = Array.from(byStaff.values()).map((rec) => {
            let bestBranch = "Unknown";
            let bestCount = -1;

            for (const [br, count] of rec.counts.entries()) {
                if (count > bestCount) {
                    bestCount = count;
                    bestBranch = br;
                    continue;
                }
                if (count === bestCount) {
                    if (idx(br) < idx(bestBranch)) bestBranch = br;
                }
            }

            return {
                key: rec.key,
                label: rec.key,
                branch: bestBranch,
                branchIndex: idx(bestBranch),
            };
        });

        picked.sort((a, b) => {
            if (a.branchIndex !== b.branchIndex) return a.branchIndex - b.branchIndex;
            return a.label.localeCompare(b.label);
        });

        let prev = null;
        return picked.map((s, i) => {
            const dividerBefore = i > 0 && s.branchIndex !== prev;
            prev = s.branchIndex;
            return { ...s, dividerBefore };
        });
    }, [shiftsWeek, absencesWeek]);

    function cellFor(staffNameKey, day) {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = addDays(dayStart, 1);

        const abs = absencesWeek.find((a) => normName(a.name) === normName(staffNameKey) && overlapsDate(a, dayStart));
        if (abs) {
            const label = String(abs.type || "OTHER").toUpperCase();
            return (
                <span className={pillClassForAbsenceType(label)} title={abs.label || ""}>
                    {label}
                    {abs.is_partial ? " (Partial)" : ""}
                </span>
            );
        }

        const shift = shiftsWeek.find((s) => {
            if (normName(s.name) !== normName(staffNameKey)) return false;
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
        <div
            style={{
                minHeight: "100vh",
                background: ui.colors.pageBg,
                padding: 12,
                boxSizing: "border-box",
                fontFamily: ui.font.ui,
            }}
        >
            <div className="rota-stack" style={{ maxWidth: 1200 }}>
                {error ? (
                    <div className="rota-card">
                        <div style={{ fontWeight: 900, color: "#B42318", marginBottom: 6 }}>Couldn’t load staff view</div>
                        <div style={{ fontWeight: 800, color: ui.colors.muted, marginBottom: 10 }}>{error}</div>
                        <button className="rota-btn" onClick={load}>
                            Retry
                        </button>
                    </div>
                ) : (
                    <TodayCard shifts={shiftsToday} absences={absencesToday} today={today} />
                )}

                <div className="rota-card">
                    <div className="rota-toolbar">
                        <div>
                            <div className="rota-title">Rota</div>
                            <div className="rota-subtitle">
                                {fmtDay(weekStart)} → {fmtDay(addDays(weekStart, 6))}
                            </div>
                        </div>

                        <div className="rota-actions">
                            <button className="rota-btn" onClick={() => setWeekStart(startOfWeekLocal(addDays(weekStart, -7)))}>
                                ← Prev
                            </button>
                            <button className="rota-btn" onClick={() => setWeekStart(startOfWeekLocal(new Date()))}>
                                This week
                            </button>
                            <button className="rota-btn" onClick={() => setWeekStart(startOfWeekLocal(addDays(weekStart, 7)))}>
                                Next →
                            </button>

                            <select className="rota-select" value={branch} onChange={(e) => setBranch(e.target.value)}>
                                {BRANCHES.map((b) => (
                                    <option key={b} value={b}>
                                        {b === "All" ? "All Branches" : b}
                                    </option>
                                ))}
                            </select>

                            <button className="rota-btn" onClick={load} disabled={loading}>
                                {loading ? "Loading…" : "Refresh"}
                            </button>
                        </div>
                    </div>

                    <div className="rota-gridWrap">
                        <div className="rota-gridInner">
                            <table className="rota-grid">
                                <thead>
                                    <tr>
                                        <th className="rota-staffCol">Day</th>
                                        {staff.map((s) => {
                                            const bKey = normBranch(s.branch);
                                            return (
                                                <th
                                                    key={s.key}
                                                    className={[
                                                        "rota-branch",
                                                        `rota-branch--${bKey}`,
                                                        s.dividerBefore ? "rota-colDivider" : "",
                                                    ].join(" ")}
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
                                                {fmtDay(d)}
                                            </th>

                                            {staff.map((s, i) => {
                                                const bKey = normBranch(s.branch);
                                                return (
                                                    <td
                                                        key={s.key}
                                                        className={[
                                                            "rota-branch",
                                                            `rota-branch--${bKey}`,
                                                            i === 0 ? "rota-afterDayDivider" : "",
                                                            s.dividerBefore ? "rota-colDivider" : "",
                                                        ].join(" ")}
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