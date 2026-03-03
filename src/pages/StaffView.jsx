// src/pages/StaffView.jsx
import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";

// Reuse your helpers (copied from Rota.jsx)
function fmtDay(d) {
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
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
    return null;
}
function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort((x, y) => x.localeCompare(y));
}

function pillClassFor(key) {
    switch (key) {
        case "stenoch": return "rota-pill--stenoch";
        case "duke": return "rota-pill--duke";
        case "hire": return "rota-pill--hire";
        case "office": return "rota-pill--office";
        case "holiday": return "rota-pill--hol";
        case "sick": return "rota-pill--sick";
        default: return "";
    }
}

function buildTodayBuckets({ shifts, absences, today, labelFor }) {
    const offToday = new Set(
        (absences || []).filter((a) => overlapsDate(a, today)).map((a) => labelFor(a.staff_name))
    );

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

    const buckets = { stenoch: [], duke: [], hire: [], office: [] };

    for (const s of shifts || []) {
        const start = new Date(s.start_at);
        if (!sameDay(start, today)) continue;

        const displayName = labelFor(s.staff_name);
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

function TodayCard({ shifts, absences, today, labelFor }) {
    const t = buildTodayBuckets({ shifts, absences, today, labelFor });

    const cols = [
        { key: "stenoch", title: "St Enoch", items: t.stenoch },
        { key: "duke", title: "Duke Street", items: t.duke },
        { key: "hire", title: "Hire", items: t.hire },
        { key: "office", title: "Office", items: t.office },
        { key: "holiday", title: "Holiday", items: t.holiday },
        { key: "sick", title: "Sick", items: t.sick },
    ];

    return (
        <div style={{
            background: ui.colors.cardBg,
            border: `1px solid ${ui.colors.border}`,
            borderRadius: ui.radius.lg,
            boxShadow: ui.shadow.card,
            padding: 14,
        }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900, color: ui.colors.text }}>Today</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: ui.colors.muted }}>{fmtDay(today)}</div>
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                gap: 10,
            }}>
                {cols.map((c) => (
                    <div key={c.key} style={{
                        borderRadius: 14,
                        border: `1px solid ${ui.colors.border}`,
                        padding: 10,
                        minHeight: 80,
                        background: ui.colors.pageBg,
                    }}>
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
        </div>
    );
}

export default function StaffView() {
    const [loading, setLoading] = React.useState(true);
    const [shiftsToday, setShiftsToday] = React.useState([]);
    const [absencesToday, setAbsencesToday] = React.useState([]);
    const [nameMap, setNameMap] = React.useState({});

    const today = React.useMemo(() => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        return t;
    }, []);

    const labelFor = React.useCallback(
        (sageName) => nameMap[normName(sageName)] || sageName,
        [nameMap]
    );

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
            const today0 = new Date(today);
            const tomorrow0 = addDays(today0, 1);

            const sTodayQ = supabase
                .from("rota_shifts")
                .select("staff_name, branch, label, start_at, end_at")
                .gte("start_at", today0.toISOString())
                .lt("start_at", tomorrow0.toISOString());

            const aTodayQ = supabase
                .from("rota_absences")
                .select("staff_name, absence_type, absence_label, start_date, end_date, is_partial")
                .lte("start_date", today0.toISOString().slice(0, 10))
                .gte("end_date", today0.toISOString().slice(0, 10));

            const [{ data: sTodayData, error: sErr }, { data: aTodayData, error: aErr }] =
                await Promise.all([sTodayQ, aTodayQ]);

            if (sErr) throw sErr;
            if (aErr) throw aErr;

            setShiftsToday(sTodayData ?? []);
            setAbsencesToday(aTodayData ?? []);

            const map = await loadNameMapAll();
            setNameMap(map);
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
        <div style={{
            minHeight: "100vh",
            background: ui.colors.pageBg,
            padding: 12,
            boxSizing: "border-box",
            fontFamily: ui.font.ui,
        }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
                {loading ? (
                    <div style={{
                        background: ui.colors.cardBg,
                        border: `1px solid ${ui.colors.border}`,
                        borderRadius: ui.radius.lg,
                        boxShadow: ui.shadow.card,
                        padding: 14,
                        fontWeight: 800,
                        color: ui.colors.muted,
                    }}>
                        Loading…
                    </div>
                ) : (
                    <TodayCard shifts={shiftsToday} absences={absencesToday} today={today} labelFor={labelFor} />
                )}

                {/* Calendar slot (wire this to your real calendar component/page later) */}
                <div style={{
                    background: ui.colors.cardBg,
                    border: `1px solid ${ui.colors.border}`,
                    borderRadius: ui.radius.lg,
                    boxShadow: ui.shadow.card,
                    padding: 14,
                    minHeight: 280,
                }}>
                    <div style={{ fontWeight: 900, color: ui.colors.text, marginBottom: 8 }}>Calendar</div>
                    <div style={{ color: ui.colors.muted, fontWeight: 800 }}>
                        Calendar view coming next — once you paste your calendar component, I’ll drop it in here.
                    </div>
                </div>
            </div>

            {/* Mobile responsiveness for the 6 columns */}
            <style>{`
        @media (max-width: 980px) {
          .rota-pill { font-size: 12px; }
        }
        @media (max-width: 780px) {
          /* Make the Today buckets wrap nicely */
          div[style*="grid-template-columns: repeat(6"] {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
      `}</style>
        </div>
    );
}