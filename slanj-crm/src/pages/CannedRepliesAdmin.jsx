import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

const SITE_OPTIONS = [
    { value: "", label: "Global (all sites)" },
    { value: "duke", label: "Duke Street" },
    { value: "sten", label: "St Enoch" },
    { value: "off", label: "Office" },
];

export default function CannedRepliesAdmin() {
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState("");
    const [role, setRole] = React.useState(null);

    // create form
    const [siteId, setSiteId] = React.useState("");
    const [title, setTitle] = React.useState("");
    const [body, setBody] = React.useState("");
    const [sortOrder, setSortOrder] = React.useState(100);
    const [isActive, setIsActive] = React.useState(true);

    async function load() {
        setError("");
        setLoading(true);

        const { data, error } = await supabase
            .from("canned_replies")
            .select("id, site_id, title, body, sort_order, is_active, created_at")
            .order("site_id", { ascending: true, nullsFirst: true })
            .order("sort_order", { ascending: true })
            .order("title", { ascending: true });

        if (error) setError(error.message);
        setRows(data || []);
        setLoading(false);
    }

    React.useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setRole(null);
                setLoading(false);
                return;
            }

            const { data: profile } = await supabase
                .from("staff_profiles")
                .select("role, is_active")
                .eq("user_id", user.id)
                .single();

            const r = profile?.is_active ? profile?.role : null;
            setRole(r);

            if (r === "admin") {
                await load();
            } else {
                setLoading(false);
            }
        })();
    }, []);

    async function createReply(e) {
        e.preventDefault();
        setError("");

        const t = title.trim();
        const b = body.trim();
        if (!t || !b) {
            setError("Title and body are required.");
            return;
        }

        const { error } = await supabase.from("canned_replies").insert({
            site_id: siteId ? siteId : null,
            title: t,
            body: b,
            sort_order: Number(sortOrder) || 100,
            is_active: !!isActive,
        });

        if (error) {
            setError(error.message);
            return;
        }

        setTitle("");
        setBody("");
        setSortOrder(100);
        setIsActive(true);
        await load();
    }

    async function updateRow(id, patch) {
        setError("");
        const { error } = await supabase.from("canned_replies").update(patch).eq("id", id);
        if (error) setError(error.message);
        await load();
    }

    async function deleteRow(id) {
        if (!confirm("Delete this canned reply?")) return;
        setError("");
        const { error } = await supabase.from("canned_replies").delete().eq("id", id);
        if (error) setError(error.message);
        await load();
    }

    function siteLabel(v) {
        const found = SITE_OPTIONS.find((s) => s.value === (v ?? ""));
        return found ? found.label : v;
    }

    if (loading) return <div style={{ maxWidth: 1100, margin: "20px auto", padding: 16, color: "#111" }}>Loading…</div>;

    if (role !== "admin") {
        return (
            <div style={{ maxWidth: 1100, margin: "20px auto", padding: 16, color: "#111" }}>
                <Link to="/">← Inbox</Link>
                <h2 style={{ marginTop: 8 }}>Admins only</h2>
                <div style={{ opacity: 0.8 }}>You don’t have permission to manage canned replies.</div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1100, margin: "20px auto", padding: 16, color: "#111" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                    <Link to="/">← Inbox</Link>
                    <h2 style={{ marginTop: 8 }}>Admin: Canned Replies</h2>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                        Create, edit, reorder, enable/disable canned replies.
                    </div>
                </div>
                <button onClick={load} disabled={loading} style={{ padding: "8px 12px" }}>
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {error && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "#fff3cd", border: "1px solid #ffeeba" }}>
                    {error}
                </div>
            )}

            {/* Create form */}
            <form
                onSubmit={createReply}
                style={{
                    marginTop: 16,
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fff",
                    display: "grid",
                    gap: 10,
                }}
            >
                <div style={{ fontWeight: 700 }}>New reply</div>

                <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10 }}>
                    <label style={{ fontSize: 13 }}>
                        Site
                        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4 }}>
                            {SITE_OPTIONS.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label style={{ fontSize: 13 }}>
                        Sort order
                        <input
                            type="number"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                            style={{ width: "100%", padding: 8, marginTop: 4 }}
                        />
                    </label>
                </div>

                <label style={{ fontSize: 13 }}>
                    Title
                    <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", padding: 8, marginTop: 4 }} />
                </label>

                <label style={{ fontSize: 13 }}>
                    Body
                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={4}
                        style={{ width: "100%", padding: 8, marginTop: 4, resize: "vertical" }}
                    />
                </label>

                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    Active (visible to staff)
                </label>

                <div>
                    <button type="submit" style={{ padding: "10px 14px" }}>
                        Create
                    </button>
                </div>
            </form>

            {/* List */}
            <div
                style={{
                    marginTop: 16,
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fff",
                }}
            >
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Existing replies</div>

                {loading ? (
                    <div style={{ opacity: 0.75 }}>Loading…</div>
                ) : rows.length === 0 ? (
                    <div style={{ opacity: 0.75 }}>No replies yet.</div>
                ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                        {rows.map((r) => (
                            <div key={r.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fafafa" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                    <div>
                                        <div style={{ fontWeight: 800 }}>{r.title}</div>
                                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                                            {siteLabel(r.site_id)} • sort {r.sort_order} • {r.is_active ? "Active" : "Disabled"}
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
                                        <button
                                            onClick={() => updateRow(r.id, { sort_order: (r.sort_order ?? 100) - 10 })}
                                            title="Move up (lower sort number)"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            onClick={() => updateRow(r.id, { sort_order: (r.sort_order ?? 100) + 10 })}
                                            title="Move down (higher sort number)"
                                        >
                                            ↓
                                        </button>

                                        <button onClick={() => updateRow(r.id, { is_active: !r.is_active })}>
                                            {r.is_active ? "Disable" : "Enable"}
                                        </button>

                                        <button onClick={() => deleteRow(r.id)} style={{ background: "#fff", border: "1px solid #ddd" }}>
                                            Delete
                                        </button>
                                    </div>
                                </div>

                                <textarea
                                    value={r.body}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, body: v } : x)));
                                    }}
                                    rows={3}
                                    style={{ width: "100%", marginTop: 10, padding: 8, borderRadius: 10, border: "1px solid #e6e6e6", resize: "vertical" }}
                                />

                                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                                    <button onClick={() => updateRow(r.id, { body: r.body })}>Save body</button>

                                    <button
                                        onClick={() => {
                                            const newTitle = prompt("Edit title:", r.title);
                                            if (newTitle && newTitle.trim()) updateRow(r.id, { title: newTitle.trim() });
                                        }}
                                    >
                                        Edit title
                                    </button>

                                    <button
                                        onClick={() => {
                                            const newSite = prompt("Site id (blank for global):", r.site_id ?? "");
                                            if (newSite === null) return;
                                            updateRow(r.id, { site_id: newSite.trim() ? newSite.trim() : null });
                                        }}
                                    >
                                        Change site
                                    </button>

                                    <button
                                        onClick={() => {
                                            const n = prompt("Sort order:", String(r.sort_order ?? 100));
                                            if (n === null) return;
                                            const num = Number(n);
                                            if (!Number.isFinite(num)) return;
                                            updateRow(r.id, { sort_order: num });
                                        }}
                                    >
                                        Set sort
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
