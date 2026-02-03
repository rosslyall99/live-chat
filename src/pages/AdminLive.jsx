import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import { ui } from "../ui/tokens";

function Badge({ children, bg = "#eee", color = "#111", border = "#bcbcbc" }) {
    return (
        <span
            style={{
                display: "inline-block",
                padding: "4px 8px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: bg,
                color,
                lineHeight: 1,
                border: `1px solid ${border}`,
                whiteSpace: "nowrap",
            }}
        >
            {children}
        </span>
    );
}

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
        const msg = error?.context?.status
            ? `HTTP ${error.context.status}: ${error.message}`
            : error.message;
        throw new Error(msg);
    }
    return data;
}

export default function AdminLive() {
    const [me, setMe] = React.useState(null);

    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState("");

    const [rows, setRows] = React.useState([]);
    const [now, setNow] = React.useState(Date.now());

    const [staff, setStaff] = React.useState([]);
    const [staffMap, setStaffMap] = React.useState({});
    const [siteFilter, setSiteFilter] = React.useState("all");
    const [assigneeFilter, setAssigneeFilter] = React.useState("all");

    const [assigning, setAssigning] = React.useState({});
    const [reassignChoice, setReassignChoice] = React.useState({});
    const [sites, setSites] = React.useState([]);

    const inputStyle = {
        display: "block",
        marginTop: 6,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${ui.colors.border}`,
        background: ui.colors.cardBg,
        color: ui.colors.text,
        outline: "none",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        fontFamily: ui.font.ui,
    };

    const siteCounts = React.useMemo(() => {
        const m = {};
        for (const r of rows) {
            const k = r.site_id || "";
            if (!k) continue;
            m[k] = (m[k] || 0) + 1;
        }
        return m;
    }, [rows]);

    const staffCounts = React.useMemo(() => {
        const m = {};
        for (const r of rows) {
            if (!r.assigned_to) continue;
            m[r.assigned_to] = (m[r.assigned_to] || 0) + 1;
        }
        return m;
    }, [rows]);

    async function load() {
        setError("");
        setLoading(true);

        const { data: siteRows, error: siteErr } = await supabase
            .from("sites")
            .select("id, name")
            .order("name", { ascending: true });

        if (!siteErr && siteRows?.length) {
            setSites(siteRows);
        } else {
            setSites([
                { id: "duke", name: "Duke Street" },
                { id: "stenoch", name: "St Enoch" },
                { id: "office", name: "Office" },
            ]);
        }
        try {
            const { data: userData, error: userErr } = await supabase.auth.getUser();
            if (userErr) throw new Error(userErr.message);
            setMe(userData?.user ?? null);

            const staffRes = await invokeAdmin("admin_list_staff", {});
            const staffList = staffRes?.staff || [];
            setStaff(staffList);

            const map = {};
            for (const s of staffList) map[s.user_id] = s;
            setStaffMap(map);

            const { data, error: qErr } = await supabase
                .from("conversations")
                .select("id, site_id, customer_name, status, assigned_to, last_message_at, created_at")
                .eq("status", "open")
                .order("last_message_at", { ascending: false });

            if (qErr) throw new Error(qErr.message);

            setRows(data || []);
        } catch (e) {
            console.error(e);
            setError(String(e.message || e));
            setRows([]);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => {
        if (siteFilter === "all") return;
        const count = siteCounts[siteFilter] || 0;
        if (count === 0) setSiteFilter("all");
    }, [siteFilter, siteCounts]);

    React.useEffect(() => {
        if (assigneeFilter === "all" || assigneeFilter === "unassigned") return;
        const count = staffCounts[assigneeFilter] || 0;
        if (count === 0) setAssigneeFilter("all");
    }, [assigneeFilter, staffCounts]);

    React.useEffect(() => {
        load();

        const channel = supabase
            .channel("admin-live")
            .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
            .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
            .subscribe();

        const timer = setInterval(() => setNow(Date.now()), 30 * 1000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function takeOver(conversation_id) {
        if (!me) return;
        setError("");
        setAssigning((p) => ({ ...p, [conversation_id]: true }));

        try {
            const { error: updErr } = await supabase
                .from("conversations")
                .update({ assigned_to: me.id })
                .eq("id", conversation_id);

            if (updErr) throw new Error(updErr.message);

            await supabase.from("messages").insert({
                conversation_id,
                sender_type: "staff",
                sender_user_id: me.id,
                body: `SYSTEM: Admin took over this chat.`,
            });

            await load();
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setAssigning((p) => ({ ...p, [conversation_id]: false }));
        }
    }

    async function reassign(conversation_id) {
        const target = reassignChoice[conversation_id];
        if (!target) {
            setError("Pick a staff member to assign to.");
            return;
        }

        setError("");
        setAssigning((p) => ({ ...p, [conversation_id]: true }));

        try {
            const { error: updErr } = await supabase
                .from("conversations")
                .update({ assigned_to: target })
                .eq("id", conversation_id);

            if (updErr) throw new Error(updErr.message);

            await load();
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setAssigning((p) => ({ ...p, [conversation_id]: false }));
        }
    }

    const siteOptions = React.useMemo(() => {
        const set = new Set(rows.map((r) => r.site_id).filter(Boolean));
        return Array.from(set).sort();
    }, [rows]);

    const filtered = rows.filter((c) => {
        if (siteFilter !== "all" && c.site_id !== siteFilter) return false;
        if (assigneeFilter === "all") return true;
        if (assigneeFilter === "unassigned") return !c.assigned_to;
        return c.assigned_to === assigneeFilter;
    });

    const sorted = [...filtered].sort((a, b) => {
        const aU = a.assigned_to ? 1 : 0;
        const bU = b.assigned_to ? 1 : 0;
        if (aU !== bU) return aU - bU;

        const aT = new Date(a.last_message_at || a.created_at).getTime();
        const bT = new Date(b.last_message_at || b.created_at).getTime();
        return bT - aT;
    });

    function activityColors(c) {
        const mins = Math.max(0, Math.floor((now - new Date(c.last_message_at || c.created_at).getTime()) / 60000));
        const isUnassigned = !c.assigned_to;

        if (isUnassigned) {
            if (mins >= 10) return { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)" };
            if (mins >= 5) return { bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.35)" };
            return { bg: "rgba(34,197,94,0.14)", border: "rgba(34,197,94,0.35)" };
        } else {
            if (mins >= 15) return { bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.35)" };
            return { bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.35)" };
        }
    }

    const th = { padding: 10, fontWeight: 800, color: ui.colors.text };

    return (
        <div style={{ width: "100%", color: ui.colors.text, fontFamily: ui.font.ui }}>
            {/* Header (match Insights) */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <div>
                    <Link
                        to="/"
                        style={{ textDecoration: "none", color: ui.colors.brand }}>← Inbox</Link>
                    <h2 style={{ marginTop: 8, marginBottom: 0 }}>Admin: Live Monitor</h2>
                    <div style={ui.text.subtitle}>
                        All open chats (unassigned + assigned). Take over or reassign as needed.
                    </div>
                </div>

                <button
                    onClick={load}
                    disabled={loading}
                    style={{
                        padding: "8px 12px",
                        borderRadius: ui.radius.md,
                        border: `1px solid ${ui.colors.border}`,
                        background: ui.colors.cardBg,
                        cursor: loading ? "not-allowed" : "pointer",
                        fontWeight: 800,
                        color: ui.colors.text,
                    }}
                >
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {error && (
                <div
                    style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.35)",
                    }}
                >
                    {error}
                </div>
            )}

            {/* Filters (match Insights) */}
            <div
                style={{
                    marginTop: 14,
                    padding: 12,
                    border: `1px solid ${ui.colors.border}`,
                    borderRadius: 12,
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "end",
                }}
            >
                <label style={{ fontSize: 13 }}>
                    Site
                    <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} style={inputStyle}>
                        <option value="all">All</option>

                        {sites.map((s) => {
                            const count = siteCounts[s.id] || 0;
                            const disabled = count === 0;

                            return (
                                <option key={s.id} value={s.id} disabled={disabled}>
                                    {s.name || s.id} {disabled ? "(0)" : `(${count})`}
                                </option>
                            );
                        })}
                    </select>
                </label>

                <label style={{ fontSize: 13 }}>
                    Assignee
                    <select
                        value={assigneeFilter}
                        onChange={(e) => setAssigneeFilter(e.target.value)}
                        style={inputStyle}
                    >
                        <option value="all">All</option>
                        <option value="unassigned">
                            Unassigned ({rows.filter((r) => !r.assigned_to).length})
                        </option>

                        {staff
                            .filter((s) => s.is_active)
                            .sort((a, b) =>
                                (a.display_name || a.username).localeCompare(b.display_name || b.username)
                            )
                            .map((s) => {
                                const count = staffCounts[s.user_id] || 0;
                                const disabled = count === 0;

                                return (
                                    <option key={s.user_id} value={s.user_id} disabled={disabled}>
                                        {(s.display_name || s.username)} {disabled ? "(0)" : `(${count})`}
                                    </option>
                                );
                            })}
                    </select>
                </label>

                <div style={{ fontSize: 13, opacity: 0.8, alignSelf: "center" }}>
                    Showing <b>{filtered.length}</b> of <b>{rows.length}</b> open chats
                </div>
            </div>

            {/* Table (match Insights) */}
            <div style={{ marginTop: 16, border: `1px solid ${ui.colors.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 0.8fr 1fr 1fr 1.4fr",
                        background: "rgba(2, 6, 23, 0.03)",
                        borderBottom: `1px solid ${ui.colors.border}`,
                    }}
                >
                    <div style={th}>Customer</div>
                    <div style={th}>Site</div>
                    <div style={th}>Assigned</div>
                    <div style={th}>Last activity</div>
                    <div style={th}>Actions</div>
                </div>

                {loading ? (
                    <div style={{ padding: 12 }}>Loading…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: 12, opacity: 0.8 }}>No open chats match your filters.</div>
                ) : (
                    sorted.map((c) => {
                        const assigned = c.assigned_to ? staffMap[c.assigned_to] : null;
                        const assignedLabel = c.assigned_to
                            ? (assigned?.display_name || assigned?.username || "Assigned")
                            : "Unassigned";

                        const isBusy = !!assigning[c.id];
                        const mins = Math.max(0, Math.floor((now - new Date(c.last_message_at || c.created_at).getTime()) / 60000));
                        const ts = new Date(c.last_message_at || c.created_at);
                        const ac = activityColors(c);

                        return (
                            <div
                                key={c.id}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1.2fr 0.8fr 1fr 1fr 1.4fr",
                                    borderBottom: `1px solid ${ui.colors.border}`,
                                }}
                            >
                                <div style={{ padding: 10 }}>
                                    <div style={{ fontWeight: 800, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        {c.customer_name}
                                        {!c.assigned_to ? (
                                            <Badge bg="rgba(245,158,11,0.14)" border="rgba(245,158,11,0.35)">New</Badge>
                                        ) : null}
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.75 }}>{c.id}</div>
                                </div>

                                <div style={{ padding: 10 }}>{c.site_id || "-"}</div>

                                <div style={{ padding: 10 }}>
                                    {!c.assigned_to ? (
                                        <Badge bg="rgba(245,158,11,0.14)" border="rgba(245,158,11,0.35)">Unassigned</Badge>
                                    ) : (
                                        <Badge bg="rgba(59,130,246,0.14)" border="rgba(59,130,246,0.35)">
                                            Assigned to {assignedLabel}
                                        </Badge>
                                    )}
                                    {c.assigned_to && assigned?.role === "admin" ? (
                                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>Admin</div>
                                    ) : null}
                                </div>

                                <div style={{ padding: 10 }}>
                                    <div style={{ fontSize: 13, opacity: 0.9 }}>{ts.toLocaleString()}</div>
                                    <div style={{ marginTop: 6 }}>
                                        <Badge bg={ac.bg} border={ac.border}>
                                            {c.assigned_to ? `Active ${mins}m` : `Waiting ${mins}m`}
                                        </Badge>
                                    </div>
                                </div>

                                <div style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <Link
                                        to={`/chat/${c.id}`}
                                        style={{
                                            padding: "8px 10px",
                                            border: `1px solid ${ui.colors.border}`,
                                            borderRadius: ui.radius.md,
                                            textDecoration: "none",
                                            color: ui.colors.text,
                                            fontWeight: 800,
                                            background: ui.colors.cardBg,
                                        }}
                                    >
                                        View
                                    </Link>

                                    <button
                                        onClick={() => takeOver(c.id)}
                                        disabled={isBusy}
                                        style={{
                                            padding: "8px 10px",
                                            borderRadius: ui.radius.md,
                                            border: `1px solid ${ui.colors.border}`,
                                            background: ui.colors.cardBg,
                                            cursor: isBusy ? "not-allowed" : "pointer",
                                            fontWeight: 800,
                                            color: ui.colors.text,
                                        }}
                                        title="Assign this chat to yourself"
                                    >
                                        {isBusy ? "Working…" : "Take over"}
                                    </button>

                                    <select
                                        value={reassignChoice[c.id] || ""}
                                        onChange={(e) => setReassignChoice((p) => ({ ...p, [c.id]: e.target.value }))}
                                        style={{ ...inputStyle, marginTop: 0, padding: "8px 10px" }}
                                        disabled={isBusy}
                                    >
                                        <option value="">Reassign…</option>
                                        {staff
                                            .filter((s) => s.is_active)
                                            .sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username))
                                            .map((s) => (
                                                <option key={s.user_id} value={s.user_id}>
                                                    {s.display_name || s.username}
                                                </option>
                                            ))}
                                    </select>

                                    <button
                                        onClick={() => reassign(c.id)}
                                        disabled={isBusy}
                                        style={{
                                            padding: "8px 10px",
                                            borderRadius: ui.radius.md,
                                            border: `1px solid rgba(168,85,247,0.35)`,
                                            background: ui.colors.brandSoft,
                                            cursor: isBusy ? "not-allowed" : "pointer",
                                            fontWeight: 900,
                                            color: ui.colors.text,
                                        }}
                                    >
                                        Assign
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
