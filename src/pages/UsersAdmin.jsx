import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import { ui } from "../ui/tokens";

export default function UsersAdmin() {
    const [rows, setRows] = React.useState([]);
    const [sites, setSites] = React.useState([]);

    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState("");

    const [username, setUsername] = React.useState("");
    const [displayName, setDisplayName] = React.useState("");
    const [siteId, setSiteId] = React.useState(""); // REQUIRED
    const [role, setRole] = React.useState("agent");
    const [pin, setPin] = React.useState("");

    const [creating, setCreating] = React.useState(false);

    const loadSeq = React.useRef(0);

    async function invokeAdmin(fn, body) {
        const { data, error } = await supabase.functions.invoke(fn, {
            body: body || {},
        });

        if (error) {
            if (error.context instanceof Response) {
                const t = await error.context.text();
                throw new Error(`HTTP ${error.context.status}: ${t}`);
            }
            throw new Error(error.message || "Edge Function error");
        }

        return data;
    }

    async function loadAll() {
        const seq = ++loadSeq.current;

        setLoading(true);
        setError("");

        try {
            const sitesRes = await invokeAdmin("admin_list_sites", {});
            const staffRes = await invokeAdmin("admin_list_staff", {});

            if (seq !== loadSeq.current) return;

            setSites(sitesRes?.sites || []);
            setRows(staffRes?.staff || []);
        } catch (e) {
            console.error(e);
            if (seq !== loadSeq.current) return;

            setError(String(e.message || e));
            setSites([]);
            setRows([]);
        } finally {
            if (seq === loadSeq.current) setLoading(false);
        }
    }

    React.useEffect(() => {
        loadAll();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event) => {
            loadAll();
        });

        return () => subscription.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function createUser(e) {
        e.preventDefault();
        setError("");

        const u = username.trim();
        const dn = displayName.trim() || u;
        const s = siteId.trim();
        const p = pin.trim();

        if (!u) return setError("Username is required.");
        if (!s) return setError("Please select a site.");
        if (!p) return setError("PIN is required.");

        setCreating(true);
        try {
            await invokeAdmin("admin_create_staff", {
                username: u,
                display_name: dn,
                site_id: s,
                role,
                pin: p,
            });

            setUsername("");
            setDisplayName("");
            setSiteId("");
            setRole("agent");
            setPin("");

            await new Promise((r) => setTimeout(r, 250));
            await loadAll();
        } catch (e) {
            console.error(e);
            setError(String(e.message || e));
        } finally {
            setCreating(false);
        }
    }

    async function resetPin(user_id) {
        const newPin = window.prompt("Enter a new PIN (min 6 chars):");
        if (!newPin) return;

        try {
            await invokeAdmin("admin_reset_pin", { user_id, new_pin: newPin });
            alert("PIN reset successfully.");
        } catch (e) {
            console.error(e);
            alert(String(e.message || e));
        }
    }

    async function deactivate(user_id) {
        if (!window.confirm("Deactivate this user?")) return;

        try {
            await invokeAdmin("admin_deactivate_staff", { user_id });
            await loadAll();
        } catch (e) {
            console.error(e);
            alert(String(e.message || e));
        }
    }

    const inputStyle = {
        width: "100%",
        padding: "10px 12px",
        borderRadius: ui.radius.md,
        border: `1px solid ${ui.colors.border}`,
        background: ui.colors.cardBg,
        color: ui.colors.text,
        outline: "none",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        fontFamily: ui.font.ui,
        boxSizing: "border-box",
    };

    const th = {
        padding: 10,
        fontWeight: 800,
        color: ui.colors.text,
        fontSize: 13,
    };

    return (
        <div style={{ width: "100%", color: ui.colors.text, fontFamily: ui.font.ui }}>
            {/* Header (match Insights/Live) */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <div>
                    <Link
                        to="/"
                        style={{ textDecoration: "none", color: ui.colors.brand }}>← Inbox</Link>
                    <h2 style={{ marginTop: 8, marginBottom: 0 }}>Admin: Users</h2>
                    <div style={ui.text.subtitle}>
                        Create staff accounts, reset PINs, and deactivate leavers.
                    </div>
                </div>

                <button
                    onClick={loadAll}
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

            {/* Error */}
            {error ? (
                <div
                    style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.35)",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {error}
                </div>
            ) : null}

            {/* Create user (styled like Insights filter block) */}
            <div
                style={{
                    marginTop: 14,
                    padding: 12,
                    border: `1px solid ${ui.colors.border}`,
                    borderRadius: 12,
                    background: "rgba(2, 6, 23, 0.02)",
                }}
            >
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Create Staff User</div>

                <form onSubmit={createUser}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 10,
                        }}
                    >
                        <input
                            placeholder="username (e.g. duke-amy)"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            style={inputStyle}
                            autoComplete="off"
                        />

                        <input
                            placeholder="display name (optional)"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            style={inputStyle}
                            autoComplete="off"
                        />

                        <select
                            value={siteId}
                            onChange={(e) => setSiteId(e.target.value)}
                            required
                            style={inputStyle}
                        >
                            <option value="">Select a site…</option>
                            {sites.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name ? `${s.name} (${s.id})` : s.id}
                                </option>
                            ))}
                        </select>

                        <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
                            <option value="agent">Agent</option>
                            <option value="admin">Admin</option>
                        </select>

                        <input
                            placeholder="PIN (min 6 chars)"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            required
                            type="password"
                            style={{ ...inputStyle, gridColumn: "1 / -1" }}
                            autoComplete="new-password"
                        />
                    </div>

                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                        <button
                            type="submit"
                            disabled={creating || !siteId}
                            style={{
                                padding: "9px 12px",
                                borderRadius: ui.radius.md,
                                border: `1px solid rgba(168,85,247,0.35)`,
                                background: ui.colors.brandSoft,
                                cursor: creating || !siteId ? "not-allowed" : "pointer",
                                fontWeight: 900,
                                color: ui.colors.text,
                                opacity: creating || !siteId ? 0.6 : 1,
                            }}
                        >
                            {creating ? "Creating…" : "Create User"}
                        </button>
                    </div>
                </form>
            </div>

            {/* List */}
            <div style={{ marginTop: 16, border: `1px solid ${ui.colors.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 1.2fr 0.8fr 0.8fr 0.6fr 1fr",
                        gap: 0,
                        background: "rgba(2, 6, 23, 0.03)",
                        borderBottom: `1px solid ${ui.colors.border}`,
                        fontWeight: 800,
                        fontSize: 13,
                    }}
                >
                    <div style={th}>Username</div>
                    <div style={th}>Name</div>
                    <div style={th}>Role</div>
                    <div style={th}>Site</div>
                    <div style={th}>Active</div>
                    <div style={{ ...th, textAlign: "right" }}>Actions</div>
                </div>

                {loading ? (
                    <div style={{ padding: 12 }}>Loading…</div>
                ) : rows.length === 0 ? (
                    <div style={{ padding: 12, opacity: 0.8 }}>No staff users.</div>
                ) : (
                    rows.map((u) => (
                        <div
                            key={u.user_id}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1.2fr 1.2fr 0.8fr 0.8fr 0.6fr 1fr",
                                borderBottom: `1px solid ${ui.colors.border}`,
                                alignItems: "center",
                                fontSize: 13,
                            }}
                        >
                            <div style={{ padding: 10, fontWeight: 900 }}>{u.username}</div>
                            <div style={{ padding: 10 }}>{u.display_name || "—"}</div>
                            <div style={{ padding: 10, textTransform: "capitalize" }}>{u.role}</div>
                            <div style={{ padding: 10 }}>{u.site_id || "—"}</div>
                            <div style={{ padding: 10, fontWeight: 800 }}>
                                {u.is_active ? "Yes" : "No"}
                            </div>

                            <div style={{ padding: 10, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                                <button
                                    onClick={() => resetPin(u.user_id)}
                                    style={{
                                        padding: "8px 10px",
                                        borderRadius: ui.radius.md,
                                        border: `1px solid ${ui.colors.border}`,
                                        background: ui.colors.cardBg,
                                        cursor: "pointer",
                                        fontWeight: 800,
                                        color: ui.colors.text,
                                    }}
                                >
                                    Reset PIN
                                </button>

                                <button
                                    onClick={() => deactivate(u.user_id)}
                                    style={{
                                        padding: "8px 10px",
                                        borderRadius: ui.radius.md,
                                        border: "1px solid rgba(239,68,68,0.35)",
                                        background: "rgba(239,68,68,0.08)",
                                        cursor: "pointer",
                                        fontWeight: 900,
                                        color: ui.colors.text,
                                    }}
                                >
                                    Deactivate
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
