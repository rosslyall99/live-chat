import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

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
            // Extract useful body if possible
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

            // Ignore stale results if another load started after this one
            if (seq !== loadSeq.current) return;

            console.log("admin_list_staff returned", staffRes);
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

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event) => {
            // Only reload when auth actually changes
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
                site_id: s, // must match sites.id
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

    return (
        <div style={{ color: "#111" }}>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 12,
                    marginBottom: 14,
                }}
            >
                <div>
                    <h2 style={{ margin: 0 }}>Staff Users</h2>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        Create staff accounts, reset PINs, and deactivate leavers.
                    </div>
                </div>

                <Link to="/" style={{ fontSize: 13 }}>
                    ← Back to Inbox
                </Link>
            </div>

            {/* Error */}
            {error && (
                <div
                    style={{
                        marginBottom: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "#ffe6e6",
                        border: "1px solid #ffb3b3",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {error}
                </div>
            )}

            {/* Create user */}
            <div
                style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                    background: "#fafafa",
                }}
            >
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Create Staff User</div>

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
                            style={{
                                width: "100%",
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid #ccc",
                            }}
                            autoComplete="off"
                        />

                        <input
                            placeholder="display name (optional)"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            style={{
                                width: "100%",
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid #ccc",
                            }}
                            autoComplete="off"
                        />

                        <select
                            value={siteId}
                            onChange={(e) => setSiteId(e.target.value)}
                            required
                            style={{
                                width: "100%",
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid #ccc",
                                background: "#fff",
                            }}
                        >
                            <option value="">Select a site…</option>
                            {sites.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name ? `${s.name} (${s.id})` : s.id}
                                </option>
                            ))}
                        </select>

                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            style={{
                                width: "100%",
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid #ccc",
                                background: "#fff",
                            }}
                        >
                            <option value="agent">Agent</option>
                            <option value="admin">Admin</option>
                        </select>

                        <input
                            placeholder="PIN / password"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            required
                            type="password"
                            style={{
                                width: "100%",
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid #ccc",
                                gridColumn: "1 / -1",
                            }}
                            autoComplete="new-password"
                        />
                    </div>

                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                        <button
                            disabled={creating || !siteId}
                            style={{
                                padding: "10px 14px",
                                borderRadius: 12,
                                border: "1px solid #111",
                                background: "#111",
                                color: "#fff",
                                fontWeight: 800,
                                cursor: creating || !siteId ? "not-allowed" : "pointer",
                                opacity: creating || !siteId ? 0.6 : 1,
                            }}
                        >
                            {creating ? "Creating…" : "Create User"}
                        </button>
                    </div>
                </form>
            </div>

            {/* List */}
            <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 1.2fr 0.8fr 0.8fr 0.6fr 1fr",
                        gap: 0,
                        background: "#f6f6f6",
                        borderBottom: "1px solid #ddd",
                        fontWeight: 800,
                        fontSize: 13,
                    }}
                >
                    <div style={{ padding: 10 }}>Username</div>
                    <div style={{ padding: 10 }}>Name</div>
                    <div style={{ padding: 10 }}>Role</div>
                    <div style={{ padding: 10 }}>Site</div>
                    <div style={{ padding: 10 }}>Active</div>
                    <div style={{ padding: 10, textAlign: "right" }}>Actions</div>
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
                                borderBottom: "1px solid #eee",
                                alignItems: "center",
                                fontSize: 13,
                            }}
                        >
                            <div style={{ padding: 10, fontWeight: 800 }}>{u.username}</div>
                            <div style={{ padding: 10 }}>{u.display_name || "—"}</div>
                            <div style={{ padding: 10 }}>{u.role}</div>
                            <div style={{ padding: 10 }}>{u.site_id || "—"}</div>
                            <div style={{ padding: 10 }}>{u.is_active ? "Yes" : "No"}</div>

                            <div style={{ padding: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                                <button
                                    onClick={() => resetPin(u.user_id)}
                                    style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        border: "1px solid #ccc",
                                        background: "#fff",
                                        cursor: "pointer",
                                        fontWeight: 700,
                                    }}
                                >
                                    Reset PIN
                                </button>

                                <button
                                    onClick={() => deactivate(u.user_id)}
                                    style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        border: "1px solid #ffb3b3",
                                        background: "#ffe6e6",
                                        cursor: "pointer",
                                        fontWeight: 800,
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
