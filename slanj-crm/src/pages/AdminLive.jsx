import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

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
        // Try to surface response body if present
        const msg =
            error?.context?.status
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

    // for filters / name mapping
    const [staff, setStaff] = React.useState([]); // staff_profiles
    const [staffMap, setStaffMap] = React.useState({});
    const [siteFilter, setSiteFilter] = React.useState("all");
    const [assigneeFilter, setAssigneeFilter] = React.useState("all"); // all | unassigned | <user_id>

    // for per-row reassignment
    const [assigning, setAssigning] = React.useState({}); // { [convoId]: boolean }
    const [reassignChoice, setReassignChoice] = React.useState({}); // { [convoId]: user_id }

    async function load() {
        setError("");
        setLoading(true);

        try {
            const { data: userData, error: userErr } = await supabase.auth.getUser();
            if (userErr) throw new Error(userErr.message);
            setMe(userData?.user ?? null);

            // Pull staff list via admin function (bypasses any staff_profiles RLS complexities)
            const staffRes = await invokeAdmin("admin_list_staff", {});
            const staffList = staffRes?.staff || [];
            setStaff(staffList);

            const map = {};
            for (const s of staffList) map[s.user_id] = s;
            setStaffMap(map);

            // Load open conversations
            let q = supabase
                .from("conversations")
                .select("id, site_id, customer_name, status, assigned_to, last_message_at, created_at")
                .eq("status", "open")
                .order("last_message_at", { ascending: false });

            const { data, error: qErr } = await q;
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
        load();

        const channel = supabase
            .channel("admin-live")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "conversations" },
                () => load()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "messages" },
                () => load()
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
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

            // Optional: notify Teams using your existing function
            // await supabase.functions.invoke("staff_notify_claimed", { body: { conversation_id } });

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

            // Optional: notify Teams (we can make a dedicated "reassigned" notification later)
            // await supabase.functions.invoke("staff_notify_claimed", { body: { conversation_id } });

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

    return (
        <div style={{ maxWidth: 1100, margin: "20px auto", padding: 16, color: "#111" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                    <Link to="/">← Inbox</Link>
                    <h2 style={{ marginTop: 8 }}>Admin: Live Monitor</h2>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                        All open chats (unassigned + assigned). Take over or reassign as needed.
                    </div>
                </div>

                <button onClick={load} disabled={loading}>
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {error && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "#ffe6e6", border: "1px solid #ffb3b3" }}>
                    {error}
                </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <label style={{ fontSize: 13 }}>
                    Site{" "}
                    <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} style={{ marginLeft: 6, padding: 6 }}>
                        <option value="all">All</option>
                        {siteOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </label>

                <label style={{ fontSize: 13 }}>
                    Assignee{" "}
                    <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={{ marginLeft: 6, padding: 6 }}>
                        <option value="all">All</option>
                        <option value="unassigned">Unassigned</option>
                        {staff
                            .filter((s) => s.is_active)
                            .sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username))
                            .map((s) => (
                                <option key={s.user_id} value={s.user_id}>
                                    {s.display_name || s.username}
                                </option>
                            ))}
                    </select>
                </label>

                <div style={{ fontSize: 13, opacity: 0.8, alignSelf: "center" }}>
                    Showing <b>{filtered.length}</b> of <b>{rows.length}</b> open chats
                </div>
            </div>

            {loading ? (
                <div style={{ marginTop: 16 }}>Loading…</div>
            ) : filtered.length === 0 ? (
                <div style={{ marginTop: 16, opacity: 0.8 }}>No open chats match your filters.</div>
            ) : (
                <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1fr 0.9fr 1.4fr", gap: 0, background: "#f6f6f6", borderBottom: "1px solid #ddd" }}>
                        <div style={{ padding: 10, fontWeight: 700 }}>Customer</div>
                        <div style={{ padding: 10, fontWeight: 700 }}>Site</div>
                        <div style={{ padding: 10, fontWeight: 700 }}>Assigned</div>
                        <div style={{ padding: 10, fontWeight: 700 }}>Last activity</div>
                        <div style={{ padding: 10, fontWeight: 700 }}>Actions</div>
                    </div>

                    {filtered.map((c) => {
                        const assigned = c.assigned_to ? staffMap[c.assigned_to] : null;
                        const assignedLabel = c.assigned_to
                            ? (assigned?.display_name || assigned?.username || "Assigned")
                            : "Unassigned";

                        const isBusy = !!assigning[c.id];

                        return (
                            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1fr 0.9fr 1.4fr", borderBottom: "1px solid #eee" }}>
                                <div style={{ padding: 10 }}>
                                    <div style={{ fontWeight: 700 }}>{c.customer_name}</div>
                                    <div style={{ fontSize: 12, opacity: 0.75 }}>{c.id}</div>
                                </div>

                                <div style={{ padding: 10 }}>{c.site_id || "-"}</div>

                                <div style={{ padding: 10 }}>
                                    <div>{assignedLabel}</div>
                                    {c.assigned_to && assigned?.role === "admin" && (
                                        <div style={{ fontSize: 12, opacity: 0.7 }}>Admin</div>
                                    )}
                                </div>

                                <div style={{ padding: 10, fontSize: 13, opacity: 0.85 }}>
                                    {c.last_message_at
                                        ? new Date(c.last_message_at).toLocaleString()
                                        : new Date(c.created_at).toLocaleString()}
                                </div>

                                <div style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <Link to={`/chat/${c.id}`} style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, textDecoration: "none", color: "#111" }}>
                                        View
                                    </Link>

                                    <button
                                        onClick={() => takeOver(c.id)}
                                        disabled={isBusy}
                                        style={{ padding: "6px 10px" }}
                                        title="Assign this chat to yourself"
                                    >
                                        {isBusy ? "Working…" : "Take over"}
                                    </button>

                                    <select
                                        value={reassignChoice[c.id] || ""}
                                        onChange={(e) => setReassignChoice((p) => ({ ...p, [c.id]: e.target.value }))}
                                        style={{ padding: 6 }}
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

                                    <button onClick={() => reassign(c.id)} disabled={isBusy} style={{ padding: "6px 10px" }}>
                                        Assign
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
