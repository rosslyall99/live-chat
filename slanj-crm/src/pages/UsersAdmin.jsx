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
        <div style={{ maxWidth: 900, margin: "20px auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <h2>Admin: Staff Users</h2>
                <Link to="/">← Inbox</Link>
            </div>

            {error && (
                <div style={{ marginBottom: 12, color: "crimson", whiteSpace: "pre-wrap" }}>
                    {error}
                </div>
            )}

            {/* Create user */}
            <form
                onSubmit={createUser}
                style={{
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 20,
                }}
            >
                <h4>Create Staff User</h4>

                <input
                    placeholder="username (e.g. duke-amy)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    style={{ width: "100%", padding: 8, marginBottom: 8 }}
                />

                <input
                    placeholder="display name (optional)"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={{ width: "100%", padding: 8, marginBottom: 8 }}
                />

                <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    required
                    style={{ width: "100%", padding: 8, marginBottom: 8 }}
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
                    style={{ width: "100%", padding: 8, marginBottom: 8 }}
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
                    style={{ width: "100%", padding: 8, marginBottom: 8 }}
                />

                <button disabled={creating || !siteId}>
                    {creating ? "Creating…" : "Create User"}
                </button>
            </form>

            {/* List */}
            {loading ? (
                <div>Loading…</div>
            ) : rows.length === 0 ? (
                <div>No staff users.</div>
            ) : (
                <table width="100%" cellPadding={8}>
                    <thead>
                        <tr>
                            <th align="left">Username</th>
                            <th align="left">Name</th>
                            <th align="left">Role</th>
                            <th align="left">Site</th>
                            <th align="left">Active</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((u) => (
                            <tr key={u.user_id}>
                                <td>{u.username}</td>
                                <td>{u.display_name}</td>
                                <td>{u.role}</td>
                                <td>{u.site_id || "—"}</td>
                                <td>{u.is_active ? "Yes" : "No"}</td>
                                <td style={{ textAlign: "right" }}>
                                    <button onClick={() => resetPin(u.user_id)}>Reset PIN</button>{" "}
                                    <button onClick={() => deactivate(u.user_id)}>Deactivate</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
