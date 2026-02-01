import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
import { ui } from "../ui/tokens";

export default function CannedRepliesAdmin() {
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState("");
    const [role, setRole] = React.useState(null);
    const [title, setTitle] = React.useState("");
    const [body, setBody] = React.useState("");
    const [isActive, setIsActive] = React.useState(true);
    const [originalBodies, setOriginalBodies] = React.useState({});
    const sort = (rows.length + 1) * 10;

    async function load() {
        setError("");
        setLoading(true);

        const { data, error } = await supabase
            .from("canned_replies")
            .select("id, title, body, sort_order, is_active, created_at")
            .order("sort_order", { ascending: true })
            .order("title", { ascending: true })

        if (error) setError(error.message);

        setRows(data || []);

        const map = {};
        for (const r of data || []) map[r.id] = r.body || "";
        setOriginalBodies(map);

        setLoading(false);
    }

    React.useEffect(() => {
        (async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

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

        const sort = nextSortOrder(rows);

        const { error: insErr } = await supabase.from("canned_replies").insert({
            site_id: null,
            title: t,
            body: b,
            sort_order: sort,
            is_active: !!isActive,
        });

        if (insErr) {
            setError(insErr.message);
            return;
        }

        setTitle("");
        setBody("");
        setSortOrder(100);
        setIsActive(true);
        await load();
    }

    async function updateRow(id, patch, { silent = false } = {}) {
        setError("");

        const { error: updErr } = await supabase
            .from("canned_replies")
            .update(patch)
            .eq("id", id);

        if (updErr) {
            console.error("canned_replies update error:", updErr, { id, patch });
            setError(
                [
                    updErr.message,
                    updErr.code ? `code: ${updErr.code}` : null,
                    updErr.details ? `details: ${updErr.details}` : null,
                    updErr.hint ? `hint: ${updErr.hint}` : null,
                ]
                    .filter(Boolean)
                    .join(" • ")
            );
            return false;
        }

        if (!silent) {
            await load();
        }

        return true;
    }

    async function deleteRow(id) {
        if (!window.confirm("Delete this canned reply?")) return;
        setError("");

        const { data, error: delErr } = await supabase
            .from("canned_replies")
            .delete()
            .eq("id", id)
            .select("id")
            .maybeSingle();

        if (delErr) {
            console.error("canned_replies delete error:", delErr, { id });
            setError(
                [
                    delErr.message,
                    delErr.code ? `code: ${delErr.code}` : null,
                    delErr.details ? `details: ${delErr.details}` : null,
                    delErr.hint ? `hint: ${delErr.hint}` : null,
                ]
                    .filter(Boolean)
                    .join(" • ")
            );
            return;
        }

        if (!data) {
            setError("Delete did not affect any rows. This is usually an RLS policy issue.");
            return;
        }

        await load();
    }

    function nextSortOrder(list) {
        const nums = (list || [])
            .map((r) => Number(r.sort_order))
            .filter((n) => Number.isFinite(n));

        if (nums.length === 0) return 100;
        return Math.max(...nums) + 10; // keeps gaps for future inserts
    }

    function normalizeSort(list) {
        return list.map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));
    }

    async function moveUp(id) {
        const idx = rows.findIndex((x) => x.id === id);
        if (idx <= 0) return;

        // 1) swap in UI
        const swapped = [...rows];
        [swapped[idx - 1], swapped[idx]] = [swapped[idx], swapped[idx - 1]];

        // 2) normalize so sort_order is unique + stable
        const normalized = normalizeSort(swapped);

        // 3) optimistically render
        setRows(normalized);

        // 4) persist only the two rows that changed
        const a = normalized[idx - 1]; // now at idx-1
        const b = normalized[idx];     // now at idx

        const ok = await Promise.all([
            updateRow(a.id, { sort_order: a.sort_order }, { silent: true }),
            updateRow(b.id, { sort_order: b.sort_order }, { silent: true }),
        ]);

        if (ok.some((x) => !x)) {
            await load(); // revert to DB truth if any write failed
        }
    }

    async function moveDown(id) {
        const idx = rows.findIndex((x) => x.id === id);
        if (idx === -1 || idx >= rows.length - 1) return;

        const swapped = [...rows];
        [swapped[idx], swapped[idx + 1]] = [swapped[idx + 1], swapped[idx]];

        const normalized = normalizeSort(swapped);
        setRows(normalized);

        const a = normalized[idx];
        const b = normalized[idx + 1];

        const ok = await Promise.all([
            updateRow(a.id, { sort_order: a.sort_order }, { silent: true }),
            updateRow(b.id, { sort_order: b.sort_order }, { silent: true }),
        ]);

        if (ok.some((x) => !x)) {
            await load();
        }
    }

    const S = {
        page: { width: "100%", color: ui.colors.text, fontFamily: ui.font.ui },
        header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
        link: {
            color: ui.colors.brand,
            fontWeight: 700,
            textDecoration: "underline",
            textUnderlineOffset: 2,
        },
        title: { marginTop: 8, marginBottom: 0 },
        subtitle: ui.text.subtitle,
        refresh: {
            padding: "8px 12px",
            borderRadius: ui.radius.md,
            border: `1px solid ${ui.colors.border}`,
            background: ui.colors.cardBg,
            cursor: "pointer",
            fontWeight: 800,
            color: ui.colors.text,
        },
        alertWarn: {
            marginTop: 12,
            padding: 10,
            borderRadius: ui.radius.md,
            background: "rgba(245,158,11,0.14)",
            border: "1px solid rgba(245,158,11,0.35)",
            color: ui.colors.text,
        },
        alertErr: {
            marginTop: 12,
            padding: 10,
            borderRadius: ui.radius.md,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: ui.colors.text,
            whiteSpace: "pre-wrap",
        },
        block: {
            marginTop: 14,
            padding: 12,
            border: `1px solid ${ui.colors.border}`,
            borderRadius: 12,
            background: "rgba(2, 6, 23, 0.02)",
        },
        blockTitle: { fontWeight: 900, marginBottom: 10 },
        input: {
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
        },
        textarea: {
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
            resize: "vertical",
        },
        row: { display: "grid", gap: 10 },
        btn: {
            padding: "8px 10px",
            borderRadius: ui.radius.md,
            border: `1px solid ${ui.colors.border}`,
            background: ui.colors.cardBg,
            cursor: "pointer",
            fontWeight: 800,
            color: ui.colors.text,
        },
        btnPrimary: {
            padding: "8px 10px",
            borderRadius: ui.radius.md,
            border: `1px solid rgba(168,85,247,0.35)`,
            background: ui.colors.brandSoft,
            cursor: "pointer",
            fontWeight: 900,
            color: ui.colors.text,
        },
        btnDanger: {
            padding: "8px 10px",
            borderRadius: ui.radius.md,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            cursor: "pointer",
            fontWeight: 900,
            color: ui.colors.text,
        },
        list: {
            marginTop: 16,
            border: `1px solid ${ui.colors.border}`,
            borderRadius: 12,
            overflow: "hidden",
            background: ui.colors.cardBg,
        },
        listHeader: {
            padding: 12,
            borderBottom: `1px solid ${ui.colors.border}`,
            background: "rgba(2, 6, 23, 0.03)",
            fontWeight: 900,
        },
        replyCard: {
            borderBottom: "1px solid rgba(2, 6, 23, 0.06)",
            padding: 12,
        },
        replyTop: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" },
        meta: { fontSize: 12, color: ui.colors.muted, marginTop: 4, fontWeight: 700 },
        titleText: { fontWeight: 900 },
        toolRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
        smallIconBtn: {
            width: 34,
            height: 34,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: ui.radius.md,
            border: `1px solid ${ui.colors.border}`,
            background: ui.colors.cardBg,
            cursor: "pointer",
            fontWeight: 900,
            color: ui.colors.text,
        },
        checkboxRow: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, color: ui.colors.text },
    };

    if (loading) return <div style={S.page}>Loading…</div>;

    if (role !== "admin") {
        return (
            <div style={S.page}>
                <Link to="/" style={S.link}>← Inbox</Link>
                <h2 style={{ marginTop: 8 }}>Admins only</h2>
                <div style={{ opacity: 0.8 }}>You don’t have permission to manage canned replies.</div>
            </div>
        );
    }

    return (
        <div style={S.page}>
            <div style={S.header}>
                <div>
                    <Link
                        to="/"
                        style={{ textDecoration: "none", color: ui.colors.brand }}>← Inbox</Link>
                    <h2 style={S.title}>Admin: Canned Replies</h2>
                    <div style={S.subtitle}>Create, edit, reorder, enable/disable canned replies.</div>
                </div>

                <button onClick={load} disabled={loading} style={{ ...S.refresh, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {error ? <div style={S.alertWarn}>{error}</div> : null}

            {/* Create form */}
            <form onSubmit={createReply} style={S.block}>
                <div style={S.blockTitle}>New reply</div>

                <label style={{ fontSize: 13, fontWeight: 800 }}>
                    Title
                    <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...S.input, marginTop: 6 }} />
                </label>

                <label style={{ fontSize: 13, fontWeight: 800 }}>
                    Body
                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={4}
                        style={{ ...S.textarea, marginTop: 6 }}
                    />
                </label>

                <label style={S.checkboxRow}>
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    Active (visible to staff)
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" style={S.btnPrimary}>
                        Create
                    </button>
                </div>
            </form>

            {/* List */}
            <div style={S.list}>
                <div style={S.listHeader}>Existing replies</div>

                {loading ? (
                    <div style={{ padding: 12, color: ui.colors.muted, fontWeight: 700 }}>
                        Loading…
                    </div>
                ) : rows.length === 0 ? (
                    <div style={{ padding: 12, color: ui.colors.muted, fontWeight: 700 }}>
                        No replies yet.
                    </div>
                ) : (
                    rows.map((r, index) => {
                        const bodyChanged =
                            (r.body ?? "") !== (originalBodies[r.id] ?? "");

                        const isFirst = index === 0;
                        const isLast = index === rows.length - 1;

                        return (
                            <div key={r.id} style={S.replyCard}>
                                <div style={S.replyTop}>
                                    <div style={{ minWidth: 260, flex: 1 }}>
                                        <div style={S.titleText}>{r.title}</div>
                                        <div style={S.meta}>
                                            {r.is_active ? "Active" : "Disabled"}
                                        </div>
                                    </div>

                                    <div style={S.toolRow}>
                                        <button
                                            type="button"
                                            disabled={isFirst}
                                            onClick={() => moveUp(r.id)}
                                            title={isFirst ? "Already at top" : "Move up"}
                                            style={{
                                                ...S.smallIconBtn,
                                                opacity: isFirst ? 0.35 : 1,
                                                cursor: isFirst ? "not-allowed" : "pointer",
                                            }}
                                        >
                                            ↑
                                        </button>

                                        <button
                                            type="button"
                                            disabled={isLast}
                                            onClick={() => moveDown(r.id)}
                                            title={isLast ? "Already at bottom" : "Move down"}
                                            style={{
                                                ...S.smallIconBtn,
                                                opacity: isLast ? 0.35 : 1,
                                                cursor: isLast ? "not-allowed" : "pointer",
                                            }}
                                        >
                                            ↓
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => updateRow(r.id, { is_active: !r.is_active })}
                                            style={S.btn}
                                        >
                                            {r.is_active ? "Disable" : "Enable"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => deleteRow(r.id)}
                                            style={S.btnDanger}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>

                                <textarea
                                    value={r.body}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setRows((prev) =>
                                            prev.map((x) =>
                                                x.id === r.id
                                                    ? { ...x, body: v }
                                                    : x
                                            )
                                        );
                                    }}
                                    rows={3}
                                    style={{ ...S.textarea, marginTop: 10 }}
                                />

                                <div
                                    style={{
                                        marginTop: 10,
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <button
                                        type="button"
                                        disabled={!bodyChanged}
                                        onClick={() =>
                                            updateRow(r.id, { body: r.body })
                                        }
                                        style={{
                                            ...S.btnPrimary,
                                            opacity: bodyChanged ? 1 : 0.4,
                                            cursor: bodyChanged
                                                ? "pointer"
                                                : "not-allowed",
                                        }}
                                    >
                                        Save body
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newTitle = prompt(
                                                "Edit title:",
                                                r.title
                                            );
                                            if (newTitle && newTitle.trim()) {
                                                updateRow(r.id, {
                                                    title: newTitle.trim(),
                                                });
                                            }
                                        }}
                                        style={S.btn}
                                    >
                                        Edit title
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
