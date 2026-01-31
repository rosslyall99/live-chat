import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

const inputStyle = {
    display: "block",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #999999",
    background: "#fff",
    color: "#111",
    outline: "none",
    boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
};

async function invokeAdmin(fn, body = {}) {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw new Error(sessErr.message);

    const jwt = sessionData?.session?.access_token;
    if (!jwt) throw new Error("Not signed in.");

    const { data, error } = await supabase.functions.invoke(fn, {
        body,
        headers: { Authorization: `Bearer ${jwt}` },
    });

    if (error) {
        const status = error?.context?.status;
        const msg = status ? `HTTP ${status}: ${error.message}` : error.message;
        throw new Error(msg);
    }

    return data;
}

function fmtSeconds(sec) {
    if (sec == null) return "—";
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r}s`;
}

function fmtMinutes(mins) {
    if (mins == null) return "—";
    const m = Math.round(mins);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return `${h}h ${r}m`;
}

function isoDateInputValue(d) {
    // yyyy-mm-dd
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export default function AdminInsights() {
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState("");

    const [staff, setStaff] = React.useState([]);
    const [sites, setSites] = React.useState([]);

    // Filters
    const [range, setRange] = React.useState("7d"); // today | 7d | 30d | custom
    const [siteId, setSiteId] = React.useState("all");
    const [agentId, setAgentId] = React.useState("all");

    // custom dates (local date inputs)
    const [startDate, setStartDate] = React.useState(() => isoDateInputValue(new Date(Date.now() - 7 * 86400000)));
    const [endDate, setEndDate] = React.useState(() => isoDateInputValue(new Date()));

    // Results
    const [overall, setOverall] = React.useState(null);
    const [agents, setAgents] = React.useState([]);

    // Sorters
    const [sortBy, setSortBy] = React.useState("closed_count"); // default
    const [sortDir, setSortDir] = React.useState("desc"); // "asc" | "desc"
    const [avgMode, setAvgMode] = React.useState("response"); // "response" | "duration"

    async function loadFilters() {
        // Staff list (admin-only)
        const staffRes = await invokeAdmin("admin_list_staff", {});
        const staffList = (staffRes?.staff || []).filter((s) => s.is_active);
        staffList.sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username));
        setStaff(staffList);

        // Sites list (try table; if your table name differs, this will just fall back)
        const { data: siteRows, error: siteErr } = await supabase
            .from("sites")
            .select("id, name")
            .order("name", { ascending: true });

        if (!siteErr && siteRows?.length) {
            setSites(siteRows);
        } else {
            // fallback – keep lightweight; you can remove once sites table is confirmed
            setSites([
                { id: "duke", name: "Duke Street" },
                { id: "stenoch", name: "St Enoch" },
                { id: "office", name: "Office" },
            ]);
        }
    }

    function buildMetricsBody() {
        const body = {
            range,
        };

        if (siteId !== "all") body.site_id = siteId;
        if (agentId !== "all") body.agent_id = agentId;

        if (range === "custom") {
            // Use full-day boundaries in local time:
            // start: 00:00:00, end: 23:59:59
            const start = new Date(`${startDate}T00:00:00`);
            const end = new Date(`${endDate}T23:59:59`);
            body.start = start.toISOString();
            body.end = end.toISOString();
        }

        return body;
    }

    async function loadMetrics() {
        setError("");
        setLoading(true);

        try {
            const body = buildMetricsBody();
            const res = await invokeAdmin("admin_chat_metrics", body);

            setOverall(res?.overall || null);
            setAgents(res?.agents || []);
        } catch (e) {
            console.error(e);
            setError(String(e.message || e));
            setOverall(null);
            setAgents([]);
        } finally {
            setLoading(false);
        }
    }

    function toggleSort(key) {
        if (sortBy === key) {
            setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        } else {
            setSortBy(key);
            setSortDir("desc");
        }
    }

    function toggleAvgMetric() {
        if (sortBy === "avg_metric") {
            setAvgMode((m) => (m === "response" ? "duration" : "response"));
            return;
        }

        setSortBy("avg_metric");
        setSortDir("desc");
        setAvgMode("response");
    }

    function SortHeader({ label, active, dir, onClick }) {
        return (
            <button
                type="button"
                onClick={onClick}
                style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                }}
            >
                <span>{label}</span>

                {/* Reserved space: always 14px wide */}
                <span
                    style={{
                        width: 14,
                        display: "inline-flex",
                        justifyContent: "center",
                        opacity: active ? 1 : 0, // invisible but keeps space
                        transform: dir === "asc" ? "rotate(180deg)" : "none",
                        transition: "transform 120ms ease",
                    }}
                >
                    ▼
                </span>
            </button>
        );
    }

    function AvgMetricHeader({ avgMode, setAvgMode, active, dir, onToggleDir, onActivate }) {
        const [hover, setHover] = React.useState(false);
        const showArrow = active || hover;

        return (
            <div
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    width: "100%",
                }}
            >
                {/* Label toggles response/duration */}
                <button
                    type="button"
                    onClick={() => {
                        // Ensure we are sorting by avg_metric first
                        if (!active) onActivate();
                        setAvgMode((m) => (m === "response" ? "duration" : "response"));
                    }}
                    style={{
                        all: "unset",
                        cursor: "pointer",
                        fontWeight: 800,
                        color: "#111",
                        whiteSpace: "nowrap",
                    }}
                    title="Click to toggle response/duration"
                >
                    {avgMode === "response" ? "Avg response" : "Avg duration"}
                </button>

                {/* Arrow toggles sort direction */}
                <button
                    type="button"
                    onClick={() => {
                        if (!active) onActivate();
                        onToggleDir();
                    }}
                    style={{
                        all: "unset",
                        cursor: "pointer",
                        width: 14,                 // fixed width => no layout shift
                        display: "inline-flex",
                        justifyContent: "center",
                        opacity: showArrow ? 1 : 0, // fade in on hover
                        transform: active && dir === "asc" ? "rotate(180deg)" : "none",
                        transition: "opacity 120ms ease, transform 120ms ease",
                        userSelect: "none",
                    }}
                    title="Click to sort"
                >
                    ▼
                </button>
            </div>
        );
    }

    const th = {
        padding: 10,
        fontWeight: 800,
        color: "#111",
    };

    function SortHeader({ label, active, dir, onClick }) {
        const [hover, setHover] = React.useState(false);
        const show = active || hover;

        return (
            <button
                type="button"
                onClick={onClick}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    fontWeight: 700,
                    color: "#111",
                }}
            >
                <span>{label}</span>

                {/* Fixed-width arrow container prevents layout shift */}
                <span
                    style={{
                        width: 14,
                        display: "inline-flex",
                        justifyContent: "center",
                        opacity: show ? 1 : 0,
                        transform: active && dir === "asc" ? "rotate(180deg)" : "none",
                        transition: "opacity 120ms ease, transform 120ms ease",
                    }}
                >
                    ▼
                </span>
            </button>
        );
    }

    React.useEffect(() => {
        (async () => {
            setLoading(true);
            setError("");
            try {
                await loadFilters();
                await loadMetrics();
            } catch (e) {
                setError(String(e.message || e));
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // auto-refresh metrics when filters change
    React.useEffect(() => {
        // don’t auto-run until initial load done
        // but also don’t run if custom dates are empty
        if (range === "custom" && (!startDate || !endDate)) return;
        loadMetrics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range, siteId, agentId, startDate, endDate]);


    const agentsSorted = React.useMemo(() => {
        const dir = sortDir === "asc" ? 1 : -1;

        function val(a) {
            if (sortBy === "avg_metric") {
                return avgMode === "response"
                    ? (a?.avg_first_reply_seconds ?? -1)
                    : (a?.avg_chat_duration_minutes ?? -1);
            }

            const v = a?.[sortBy];
            return v == null ? -1 : v;
        }

        return [...agents].sort((a, b) => {
            const av = val(a);
            const bv = val(b);

            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;

            // tie-break: closed desc, then name
            const ac = a.closed_count ?? 0;
            const bc = b.closed_count ?? 0;
            if (ac !== bc) return bc - ac;

            const an = (a.display_name || a.username || "").toLowerCase();
            const bn = (b.display_name || b.username || "").toLowerCase();
            return an.localeCompare(bn);
        });
    }, [agents, sortBy, sortDir]);

    return (
        <div style={{ maxWidth: 1100, margin: "20px auto", padding: 16, color: "#111" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                    <Link to="/">← Inbox</Link>
                    <h2 style={{ marginTop: 8 }}>Admin: Insights</h2>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Chat stats by staff — filter by time, branch, and user.
                    </div>
                </div>

                <button onClick={loadMetrics} disabled={loading} style={{ padding: "8px 12px" }}>
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {error && (
                <div
                    style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "#ffe6e6",
                        border: "1px solid #ffb3b3",
                    }}
                >
                    {error}
                </div>
            )}

            {/* Filters */}
            <div
                style={{
                    marginTop: 14,
                    padding: 12,
                    border: "1px solid #bcbcbc",
                    borderRadius: 12,
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "end",
                }}
            >
                <label style={{ fontSize: 13 }}>
                    Range
                    <select value={range} onChange={(e) => setRange(e.target.value)} style={inputStyle}>
                        <option value="today">Today</option>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="custom">Custom</option>
                    </select>
                </label>

                {range === "custom" && (
                    <>
                        <label style={{ fontSize: 13 }}>
                            Start
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={inputStyle}
                            />
                        </label>

                        <label style={{ fontSize: 13 }}>
                            End
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={inputStyle}
                            />
                        </label>
                    </>
                )}

                <label style={{ fontSize: 13 }}>
                    Site
                    <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={inputStyle}>
                        <option value="all">All</option>
                        {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name || s.id}
                            </option>
                        ))}
                    </select>
                </label>

                <label style={{ fontSize: 13 }}>
                    Agent
                    <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={inputStyle}>
                        <option value="all">All</option>
                        {staff.map((s) => (
                            <option key={s.user_id} value={s.user_id}>
                                {s.display_name || s.username}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Summary */}
            <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ border: "1px solid #bcbcbc", borderRadius: 12, padding: 12, minWidth: 240 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Created (in range)</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{overall?.created_conversations ?? "—"}</div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                        Assigned: <b>{overall?.created_assigned ?? "—"}</b> • Unassigned: <b>{overall?.created_unassigned ?? "—"}</b>
                    </div>
                </div>

                <div style={{ border: "1px solid #bcbcbc", borderRadius: 12, padding: 12, minWidth: 240 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Closed (in range)</div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{overall?.closed_conversations ?? "—"}</div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                        Filters:{" "}
                        <b>{range}</b>
                        {siteId !== "all" ? <> • Site: <b>{siteId}</b></> : null}
                        {agentId !== "all" ? <> • Agent: <b>selected</b></> : null}
                    </div>
                </div>
            </div>

            {/* Per-agent table */}
            <div style={{ marginTop: 16, border: "1px solid #bcbcbc", borderRadius: 12, overflow: "hidden" }}>
                {(() => {
                    function arrow(key) {
                        if (sortBy !== key) return "";
                        return sortDir === "asc" ? " ▲" : " ▼";
                    }

                    const th = {
                        padding: 10,
                        fontWeight: 700,
                        userSelect: "none",
                    };

                    const clickable = {
                        ...th,
                        cursor: "pointer",
                    };

                    return (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1.2fr 0.8fr 0.7fr 0.9fr minmax(260px, 1fr)",
                                background: "#f6f6f6",
                                borderBottom: "1px solid #bcbcbc",
                            }}
                        >
                            <div style={th}>Agent</div>
                            <div style={th}>Site</div>

                            <div style={th}>
                                <SortHeader
                                    label="Claimed"
                                    active={sortBy === "claimed_count"}
                                    dir={sortDir}
                                    onClick={() => toggleSort("claimed_count")}
                                />
                            </div>

                            <div style={th}>
                                <SortHeader
                                    label="Closed"
                                    active={sortBy === "closed_count"}
                                    dir={sortDir}
                                    onClick={() => toggleSort("closed_count")}
                                />
                            </div>

                            <div style={th}>
                                <AvgMetricHeader
                                    avgMode={avgMode}
                                    setAvgMode={setAvgMode}
                                    active={sortBy === "avg_metric"}
                                    dir={sortDir}
                                    onActivate={() => {
                                        setSortBy("avg_metric");
                                        setSortDir("desc"); // default when first activating
                                    }}
                                    onToggleDir={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                                />
                            </div>
                        </div>
                    );
                })()}

                {loading ? (
                    <div style={{ padding: 12 }}>Loading…</div>
                ) : agents.length === 0 ? (
                    <div style={{ padding: 12, opacity: 0.8 }}>No data for this filter range.</div>
                ) : (
                    agentsSorted.map((a) => (
                        <div
                            key={a.user_id}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1.2fr 0.8fr 0.7fr 0.9fr minmax(260px, 1fr)",
                                borderBottom: "1px solid #eee",
                            }}
                        >
                            <div style={{ padding: 10 }}>
                                <div style={{ fontWeight: 800 }}>{a.display_name || a.username || a.user_id}</div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>{a.username}</div>
                            </div>

                            <div style={{ padding: 10 }}>{a.staff_site_id || "—"}</div>
                            <div style={{ padding: 10, fontWeight: 700 }}>{a.claimed_count ?? 0}</div>
                            <div style={{ padding: 10, fontWeight: 700 }}>{a.closed_count ?? 0}</div>

                            <div style={{ padding: 10 }}>
                                <div style={{ fontSize: 13 }}>
                                    <b>{fmtSeconds(a.avg_first_reply_seconds)}</b> first reply
                                </div>
                                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                                    <b>{fmtMinutes(a.avg_chat_duration_minutes)}</b> duration
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
