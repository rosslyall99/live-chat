// src/pages/StaffView.jsx
import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import "../pages/rota.css"; // so we can reuse your existing rota-pill colours

function fmtDay(d) {
    return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
    });
}

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

// abs.start_date / end_date are YYYY-MM-DD (inclusive)
function overlapsDate(abs, date) {
    const ds = new Date(abs.start_date + "T00:00:00Z");
    const de = new Date(abs.end_date + "T23:59:59Z");
    return date >= ds && date <= de;
}

function sameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function uniqueSorted(arr) {
    return Array.from(new Set(arr))
        .filter(Boolean)
        .sort((x, y) => x.localeCompare(y));
}

function normBranch(branch) {
    const b = String(branch || "").trim().toLowerCase();
    if (b.includes("st enoch") || b.includes("stenoch") || b === "se") return "stenoch";
    if (b.includes("duke")) return "duke";
    if (b.includes("hire")) return "hire";
    if (b.includes("office")) return "office";
    return null;
}

function pillClassFor(key) {
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

/**
 * Expected data from Edge Function:
 * {
 *   today: "YYYY-MM-DD",
 *   shifts: [{ name, branch, start_at, end_at }],
 *   absences: [{ name, type, start_date, end_date }]
 * }
 */
function buildTodayBuckets({ shifts, absences, today }) {
    // People off today (exclude from branch columns)
    const offToday = new Set(
        (absences || []).filter((a) => overlapsDate(a, today)).map((a) => a.name)
    );

    const holiday = uniqueSorted(
        (absences || [])
            .filter((a) => overlapsDate(a, today) && String(a.type || "").toUpperCase() === "HOL")
            .map((a) => a.name)
    );

    const sick = uniqueSorted(
        (absences || [])
            .filter((a) => overlapsDate(a, today) && String(a.type || "").toUpperCase() === "SICK")
            .map((a) => a.name)
    );

    const buckets = { stenoch: [], duke: [], hire: [], office: [] };

    for (const s of shifts || []) {
        const start = new Date(s.start_at);
        if (!sameDay(start, today)) continue;

        const displayName = String(s.name || "").trim();
        if (!displayName) continue;
        if (offToday.has(displayName)) continue;

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

function TodayCard({ shifts, absences, today }) {
    const t = buildTodayBuckets({ shifts, absences, today });

    const cols = [
        { key: "stenoch", title: "St Enoch", items: t.stenoch },
        { key: "duke", title: "Duke Street", items: t.duke },
        { key: "hire", title: "Hire", items: t.hire },
        { key: "office", title: "Office", items: t.office },
        { key: "holiday", title: "Holiday", items: t.holiday },
        { key: "sick", title: "Sick", items: t.sick },
    ];

    return (
        <div
            style={{
                background: ui.colors.cardBg,
                border: `1px solid ${ui.colors.border}`,
                borderRadius: ui.radius.lg,
                boxShadow: ui.shadow.card,
                padding: 14,
                boxSizing: "border-box",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 10,
                }}
            >
                <div style={{ fontWeight: 900, color: ui.colors.text, fontSize: 14 }}>Today</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: ui.colors.muted }}>{fmtDay(today)}</div>
            </div>

            <div
                className="staffview-todaygrid"
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                    gap: 10,
                }}
            >
                {cols.map((c) => (
                    <div
                        key={c.key}
                        style={{
                            borderRadius: 14,
                            border: `1px solid ${ui.colors.border}`,
                            padding: 10,
                            minHeight: 86,
                            background: ui.colors.pageBg,
                            boxSizing: "border-box",
                        }}
                    >
                        <div style={{ fontSize: 12, fontWeight: 900, color: ui.colors.text, marginBottom: 8 }}>
                            {c.title}
                        </div>

                        {c.items.length === 0 ? (
                            <div style={{ color: ui.colors.muted, fontWeight: 800 }}>—</div>
                        ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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

            {/* Responsive: 6 cols -> 3 -> 2 */}
            <style>{`
        @media (max-width: 980px) {
          .staffview-todaygrid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 620px) {
          .staffview-todaygrid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
        </div>
    );
}

export default function StaffView() {
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState("");
    const [shiftsToday, setShiftsToday] = React.useState([]);
    const [absencesToday, setAbsencesToday] = React.useState([]);

    const today = React.useMemo(() => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        return t;
    }, []);

    async function load() {
        setLoading(true);
        setError("");
        try {
            const key = new URLSearchParams(window.location.search).get("k") || "";

            const { data, error } = await supabase.functions.invoke("staff_view_data", {
                body: { k: key },
            });

            if (error) throw error;
            if (!data) throw new Error("No data returned");

            setShiftsToday(data.shifts || []);
            setAbsencesToday(data.absences || []);
        } catch (e) {
            setError(e?.message || String(e));
            setShiftsToday([]);
            setAbsencesToday([]);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => {
        load();
        const t = setInterval(load, 120_000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            <div
                style={{
                    maxWidth: 1200,
                    margin: "0 auto",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                }}
            >
                {/* Top card: Today */}
                {loading ? (
                    <div
                        style={{
                            background: ui.colors.cardBg,
                            border: `1px solid ${ui.colors.border}`,
                            borderRadius: ui.radius.lg,
                            boxShadow: ui.shadow.card,
                            padding: 14,
                            fontWeight: 800,
                            color: ui.colors.muted,
                        }}
                    >
                        Loading…
                    </div>
                ) : error ? (
                    <div
                        style={{
                            background: ui.colors.cardBg,
                            border: `1px solid ${ui.colors.border}`,
                            borderRadius: ui.radius.lg,
                            boxShadow: ui.shadow.card,
                            padding: 14,
                        }}
                    >
                        <div style={{ fontWeight: 900, color: "#B42318", marginBottom: 6 }}>Couldn’t load staff view</div>
                        <div style={{ fontWeight: 800, color: ui.colors.muted, marginBottom: 10 }}>{error}</div>
                        <button
                            onClick={load}
                            style={{
                                padding: "10px 12px",
                                borderRadius: 12,
                                border: `1px solid ${ui.colors.border}`,
                                background: ui.colors.cardBg,
                                cursor: "pointer",
                                fontWeight: 800,
                                color: ui.colors.text,
                            }}
                        >
                            Retry
                        </button>
                    </div>
                ) : (
                    <TodayCard shifts={shiftsToday} absences={absencesToday} today={today} />
                )}

                {/* Calendar placeholder */}
                <div
                    style={{
                        background: ui.colors.cardBg,
                        border: `1px solid ${ui.colors.border}`,
                        borderRadius: ui.radius.lg,
                        boxShadow: ui.shadow.card,
                        padding: 14,
                        minHeight: 260,
                        boxSizing: "border-box",
                    }}
                >
                    <div style={{ fontWeight: 900, color: ui.colors.text, marginBottom: 8 }}>Calendar</div>
                    <div style={{ color: ui.colors.muted, fontWeight: 800 }}>
                        Next step: paste your calendar component and I’ll wire it into this panel.
                    </div>
                </div>
            </div>
        </div>
    );
}