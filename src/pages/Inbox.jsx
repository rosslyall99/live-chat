import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import { ui } from "../ui/tokens";

/** Admin-only helper (uses Edge Function) */
/** Admin-only helper (uses Edge Function)
 *  - Never signs out the user
 *  - If token is stale and function returns 401, refreshes once and retries
 *  - Throws with `.code` so callers can decide what to do
 */
async function invokeAdmin(fn, body = {}) {
    // 1) Ensure we have a session
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) {
        const e = new Error(sessErr.message);
        e.code = "SESSION_ERROR";
        throw e;
    }

    let jwt = sessionData?.session?.access_token;
    if (!jwt) {
        const e = new Error("Not signed in.");
        e.code = "NOT_SIGNED_IN";
        throw e;
    }

    // helper to call function with a jwt
    async function callWith(jwtToken) {
        const { data, error } = await supabase.functions.invoke(fn, {
            body,
            headers: { Authorization: `Bearer ${jwtToken}` },
        });

        if (error) {
            const status = error?.context?.status;
            const msg = status ? `HTTP ${status}: ${error.message}` : error.message;
            const e = new Error(msg);
            e.status = status;
            e.raw = error;
            throw e;
        }

        return data;
    }

    try {
        return await callWith(jwt);
    } catch (e) {
        // 2) If unauthorized, try ONE refresh + retry
        const status = e?.status;
        const is401 = status === 401 || String(e.message || "").includes("HTTP 401");

        if (!is401) throw e;

        // refresh session (if possible)
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
            const err = new Error(`Unauthorized and refresh failed: ${refreshErr.message}`);
            err.code = "ADMIN_UNAUTHORIZED";
            err.status = 401;
            throw err;
        }

        const newJwt = refreshData?.session?.access_token;
        if (!newJwt) {
            const err = new Error("Unauthorized (no refreshed token).");
            err.code = "ADMIN_UNAUTHORIZED";
            err.status = 401;
            throw err;
        }

        // retry once
        try {
            return await callWith(newJwt);
        } catch (e2) {
            const status2 = e2?.status;
            const is401_2 = status2 === 401 || String(e2.message || "").includes("HTTP 401");
            if (is401_2) {
                const err = new Error("Not authorised to access this admin function.");
                err.code = "ADMIN_UNAUTHORIZED";
                err.status = 401;
                throw err;
            }
            throw e2;
        }
    }
}

function SegmentedTabs({ value, onChange, items }) {
    const wrap = {
        display: "inline-flex",
        background: "transparent",
        gap: 6,
    };

    const btn = (active) => ({
        appearance: "none",
        border: `1px solid ${ui.colors.border}`,
        background: active ? ui.colors.cardBg : ui.colors.pageBg,
        color: ui.colors.text,
        padding: "10px 14px",
        fontWeight: active ? 900 : 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        lineHeight: 1,
        borderRadius: 12,
        transition: "background 120ms ease, box-shadow 120ms ease, transform 120ms ease",
        outline: "none",
        boxShadow: active ? ui.shadow.card : "none",
    });

    const countPill = (active) => ({
        minWidth: 22,
        height: 20,
        padding: "0 7px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        background: active ? ui.colors.brandSoft : ui.colors.cardBg,
        border: `1px solid ${ui.colors.border}`,
        color: ui.colors.text,
    });

    return (
        <div style={wrap} role="tablist" aria-label="Inbox tabs">
            {items.map((it, idx) => {
                const active = value === it.value;
                return (
                    <button
                        key={it.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(it.value)}
                        style={btn(active)}
                    >
                        <span>{it.label}</span>
                        <span style={countPill(active)}>{it.count ?? 0}</span>
                    </button>
                );
            })}
        </div>
    );
}

function fmtWhen(ts) {
    if (!ts) return "—";
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return String(ts);
    }
}

export default function Inbox() {
    const [tab, setTab] = React.useState("unassigned"); // unassigned | mine | closed
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    const [me, setMe] = React.useState(null);
    const [role, setRole] = React.useState(null);

    const [counts, setCounts] = React.useState({ unassigned: 0, mine: 0, closed: 0 });

    // Map user_id -> display name (admin uses Edge Function list)
    const [staffNameById, setStaffNameById] = React.useState({});

    async function loadMeAndRole() {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;

        const user = userData?.user ?? null;
        setMe(user);

        let r = null;

        if (user?.id) {
            const { data: profile } = await supabase
                .from("staff_profiles")
                .select("role, is_active, display_name, username")
                .eq("user_id", user.id)
                .maybeSingle();

            r = profile?.is_active ? profile?.role : null;
            setRole(r);

            const mineName = profile?.display_name || profile?.username || "You";
            setStaffNameById((m) => ({ ...m, [user.id]: mineName }));
        } else {
            setRole(null);
        }

        return { user, role: r };
    }

    async function loadAdminStaffNamesIfNeeded(r) {
        // Only admins need full mapping for “Closed by X” on ALL closed chats
        if (r !== "admin") return;

        try {
            const res = await invokeAdmin("admin_list_staff", {});
            const list = res?.staff || [];

            const map = {};
            for (const s of list) {
                map[s.user_id] = s.display_name || s.username || s.user_id;
            }
            setStaffNameById((prev) => ({ ...prev, ...map }));
        } catch (e) {
            if (e?.code === "ADMIN_UNAUTHORIZED" || e?.status === 401) {
                // Admin mapping failed — do NOT log out, just continue without it
                console.warn("admin_list_staff not authorised (continuing without full map)");
                return;
            }
            console.error("admin_list_staff failed", e);
        }
    }

    async function loadRows(activeTab = tab) {
        setLoading(true);
        try {
            const authedUser = me ?? (await loadMeAndRole()).user; // ✅ take .user
            if (!authedUser?.id) {
                setRows([]);
                return;
            }

            let q = supabase
                .from("conversations")
                .select("id, site_id, customer_name, status, assigned_to, last_message_at, closed_at, handled_by, handled_by_name");


            if (activeTab === "unassigned") {
                q = q.eq("status", "open").is("assigned_to", null).order("last_message_at", { ascending: false });
            }

            if (activeTab === "mine") {
                q = q.eq("status", "open").eq("assigned_to", authedUser.id).order("last_message_at", { ascending: false });
            }

            if (activeTab === "closed") {
                q = q.eq("status", "closed").order("closed_at", { ascending: false }).order("last_message_at", { ascending: false });
            }

            const { data, error } = await q;
            if (error) {
                console.error(error);
                setRows([]);
            } else {
                setRows(data || []);
            }
        } finally {
            setLoading(false);
        }
    }

    async function loadCounts() {
        try {
            const { user, role: r } = await loadMeAndRole();
            if (!user?.id) return;

            const unassignedReq = supabase
                .from("conversations")
                .select("id", { count: "exact", head: true })
                .eq("status", "open")
                .is("assigned_to", null);

            const mineReq = supabase
                .from("conversations")
                .select("id", { count: "exact", head: true })
                .eq("status", "open")
                .eq("assigned_to", user.id);

            let closedReq = supabase
                .from("conversations")
                .select("id", { count: "exact", head: true })
                .eq("status", "closed");

            // admin sees all closed; agents only their own handled
            if (r !== "admin") {
                closedReq = closedReq.eq("handled_by", user.id);
            }

            const [unassigned, mine, closed] = await Promise.all([
                unassignedReq,
                mineReq,
                closedReq,
            ]);

            setCounts({
                unassigned: unassigned.count || 0,
                mine: mine.count || 0,
                closed: closed.count || 0,
            });
        } catch (e) {
            console.error("loadCounts failed", e);
        }
    }

    // Initial load: identity + role + admin name map only (no data fetch here)
    React.useEffect(() => {
        (async () => {
            const { user, role: r } = await loadMeAndRole();

            // preload admin name map once (admins only)
            await loadAdminStaffNamesIfNeeded(r);

            // ✅ do NOT call loadRows/loadCounts here
            // The tab effect below will handle the first fetch once me is set.
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // On tab change (and first time we know who 'me' is)
    React.useEffect(() => {
        if (!me?.id) return; // wait until we have an authed user
        loadRows(tab);
        loadCounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, me?.id]);

    // Realtime refresh rows + counts
    React.useEffect(() => {
        if (!me?.id) return; // safety guard

        const channel = supabase
            .channel("inbox-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "messages" },
                () => {
                    loadRows(tab);
                    loadCounts();
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "conversations" },
                () => {
                    loadRows(tab);
                    loadCounts();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, me?.id]);

    // Poll counts every 30s
    React.useEffect(() => {
        loadCounts();
        const t = setInterval(() => loadCounts(), 30000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me?.id, role]);

    const pageWrap = {
        width: "100%",
        color: ui.colors.text,
    };

    const hint = {
        fontSize: 12,
        color: ui.colors.muted,
        marginTop: 6,
    };

    const cardBase = {
        textDecoration: "none",
        border: `1px solid ${ui.colors.border}`,
        borderRadius: 12,
        padding: 12,
        color: ui.colors.text,
        background: ui.colors.cardBg,
        transition: "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
        display: "block",
    };

    const [hoverId, setHoverId] = React.useState(null);

    return (
        <div style={pageWrap}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                    <h2 style={{ margin: 0 }}>Inbox</h2>
                    <div style={hint}>Unassigned chats are visible to everyone. Claim to reply.</div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {role === "admin" && (
                        <Link to="/admin/live" style={{ fontSize: 13, color: ui.colors.muted }}>
                            Admin Live
                        </Link>
                    )}
                    <button
                        onClick={() => {
                            loadRows(tab);
                            loadCounts();
                        }}
                        style={{
                            padding: "8px 12px",
                            borderRadius: 12,
                            border: `1px solid ${ui.colors.border}`,
                            background: ui.colors.cardBg,
                            cursor: "pointer",
                            fontWeight: 800,
                            color: ui.colors.text,
                        }}
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div style={{ marginTop: 14, marginBottom: 12 }}>
                <SegmentedTabs
                    value={tab}
                    onChange={setTab}
                    items={[
                        { value: "unassigned", label: "Unassigned", count: counts.unassigned },
                        { value: "mine", label: "Mine", count: counts.mine },
                        { value: "closed", label: "Closed", count: counts.closed },
                    ]}
                />
            </div>

            {loading ? (
                <div style={{ color: ui.colors.muted }}>Loading…</div>
            ) : rows.length === 0 ? (
                <div style={{ color: ui.colors.muted }}>No chats here right now.</div>
            ) : (
                <div style={{ display: "grid", gap: 10 }}>
                    {rows.map((c) => {
                        const when = tab === "closed" ? (c.closed_at || c.last_message_at) : c.last_message_at;

                        const assignedLabel = c.assigned_to
                            ? c.assigned_to === me?.id
                                ? "Assigned to you"
                                : "Assigned"
                            : "Unassigned";

                        const closedBy =
                            tab === "closed"
                                ? (c.closed_by_name || c.handled_by_name || staffNameById[c.closed_by] || staffNameById[c.handled_by] || "Staff")
                                : null;

                        const isHover = hoverId === c.id;

                        return (
                            <Link
                                key={c.id}
                                to={`/chat/${c.id}`}
                                style={{
                                    ...cardBase,
                                    transform: isHover ? "translateY(-1px)" : "none",
                                    boxShadow: isHover ? ui.shadow.card : "none",
                                    borderColor: isHover ? "#cfcfcf" : ui.colors.border,
                                }}
                                onMouseEnter={() => setHoverId(c.id)}
                                onMouseLeave={() => setHoverId(null)}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 800 }}>{c.customer_name}</div>

                                        <div style={{ fontSize: 12, color: ui.colors.muted, marginTop: 4 }}>
                                            Site: <b style={{ color: ui.colors.text }}>{c.site_id}</b> • Status:{" "}
                                            <b style={{ color: ui.colors.text }}>{c.status}</b>
                                            {tab === "closed" && c.closed_at ? ` • Closed: ${fmtWhen(c.closed_at)}` : ""}
                                        </div>

                                        <div style={{ marginTop: 8, fontSize: 13, color: ui.colors.muted }}>
                                            {tab === "closed" ? (
                                                <>
                                                    Closed by <b style={{ color: ui.colors.text }}>{closedBy}</b>
                                                </>
                                            ) : (
                                                assignedLabel
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ fontSize: 12, color: ui.colors.muted, whiteSpace: "nowrap" }}>
                                        {fmtWhen(when)}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
