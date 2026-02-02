import React from "react";
import { supabase } from "../supabaseClient";
import { useParams, Link } from "react-router-dom";
import { ui } from "../ui/tokens";

export default function Chat() {
    const { id } = useParams();

    const [convo, setConvo] = React.useState(null);
    const [msgs, setMsgs] = React.useState([]);
    const [me, setMe] = React.useState(null);

    const [text, setText] = React.useState("");
    const [error, setError] = React.useState("");

    const [claiming, setClaiming] = React.useState(false);
    const [sending, setSending] = React.useState(false);

    const [canned, setCanned] = React.useState([]);

    const [layoutNarrow, setLayoutNarrow] = React.useState(false);

    // scroll handling
    const messagesRef = React.useRef(null);
    const bottomRef = React.useRef(null);
    const shouldStickRef = React.useRef(true); // auto-scroll only when near bottom

    const S = {
        page: { width: "100%", color: ui.colors.text, fontFamily: ui.font.ui },
        header: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
        },
        link: {
            color: ui.colors.brand,
            fontWeight: 700,
            textDecoration: "underline",
            textUnderlineOffset: 2,
        },
        h2: { marginTop: 8, marginBottom: 0, fontWeight: 900 },
        subtitle: { fontSize: 13, opacity: 0.75, marginTop: 6, lineHeight: 1.4 },
        toolbar: { display: "flex", gap: 8, alignItems: "start", flexWrap: "wrap" },

        btn: {
            padding: "8px 12px",
            borderRadius: ui.radius.md,
            border: `1px solid ${ui.colors.border}`,
            background: ui.colors.cardBg,
            cursor: "pointer",
            fontWeight: 800,
            color: ui.colors.text,
        },
        btnPrimary: {
            padding: "8px 12px",
            borderRadius: ui.radius.md,
            border: "1px solid rgba(168,85,247,0.35)",
            background: ui.colors.brandSoft,
            cursor: "pointer",
            fontWeight: 900,
            color: ui.colors.text,
        },
        btnDanger: {
            padding: "8px 12px",
            borderRadius: ui.radius.md,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            cursor: "pointer",
            fontWeight: 900,
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
        alertInfo: {
            marginTop: 12,
            padding: 10,
            borderRadius: ui.radius.md,
            background: "rgba(59,130,246,0.10)",
            border: "1px solid rgba(59,130,246,0.25)",
            color: ui.colors.text,
        },
        alertNeutral: {
            marginTop: 12,
            padding: 10,
            borderRadius: ui.radius.md,
            background: "rgba(2, 6, 23, 0.03)",
            border: `1px solid ${ui.colors.border}`,
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

        grid: {
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 12,
            marginTop: 16,
        },

        leftCard: {
            border: `1px solid ${ui.colors.border}`,
            borderRadius: ui.radius.lg,
            background: "rgba(2, 6, 23, 0.02)",
            overflow: "hidden",
        },
        rightCard: {
            border: `1px solid ${ui.colors.border}`,
            borderRadius: ui.radius.lg,
            background: ui.colors.cardBg,
            overflow: "hidden",
        },
        cardHeader: {
            padding: 12,
            borderBottom: `1px solid ${ui.colors.border}`,
            background: "rgba(2, 6, 23, 0.03)",
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
        },
        headerHint: { fontSize: 12, color: ui.colors.muted, fontWeight: 800 },

        messages: {
            padding: 12,
            height: 420,
            overflow: "auto",
        },

        // message bubble layout
        msgRow: { display: "flex", marginBottom: 10 },
        bubble: {
            maxWidth: "82%",
            padding: "10px 12px",
            borderRadius: ui.radius.md,
            border: "1px solid rgba(2, 6, 23, 0.06)",
            background: ui.colors.cardBg,
        },
        bubbleMe: {
            background: ui.colors.brandSoft,
            border: "1px solid rgba(168,85,247,0.25)",
        },
        bubbleCustomer: {
            background: ui.colors.cardBg,
        },
        bubbleSystem: {
            background: "rgba(2, 6, 23, 0.03)",
            border: "1px solid rgba(2, 6, 23, 0.08)",
        },
        msgMeta: { fontSize: 12, color: ui.colors.muted, fontWeight: 800, marginBottom: 6 },
        system: { whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.85, fontStyle: "italic" },
        body: { whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.45 },

        composer: {
            borderTop: `1px solid ${ui.colors.border}`,
            padding: 12,
            background: ui.colors.cardBg,
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
        },
        input: {
            flex: 1,
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

        cannedList: {
            padding: 12,
            display: "grid",
            gap: 8,
            maxHeight: 420 + 52,
            overflow: "auto",
        },
        cannedBtn: {
            textAlign: "left",
            padding: 10,
            borderRadius: ui.radius.md,
            border: "1px solid rgba(2, 6, 23, 0.06)",
            background: "rgba(2, 6, 23, 0.02)",
            cursor: "pointer",
            color: ui.colors.text,
        },
        cannedTitle: { fontWeight: 900, fontSize: 13 },
        cannedSub: { fontSize: 12, color: ui.colors.muted, fontWeight: 700, marginTop: 4 },
    };

    React.useEffect(() => {
        function onResize() {
            setLayoutNarrow(window.innerWidth < 980);
        }
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    function markScrollStickiness() {
        const el = messagesRef.current;
        if (!el) return;

        // if within 60px of bottom, we stick
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        shouldStickRef.current = distanceFromBottom < 60;
    }

    React.useEffect(() => {
        if (!shouldStickRef.current) return;
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs.length]);

    async function load() {
        setError("");

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
            setError(userErr.message);
            return;
        }
        setMe(userData?.user ?? null);

        const { data: c, error: cErr } = await supabase
            .from("conversations")
            .select("id, site_id, customer_name, status, assigned_to")
            .eq("id", id)
            .single();

        if (cErr) {
            setError(cErr.message);
            return;
        }
        setConvo(c);

        await loadCanned(); // global-only

        const { data: m, error: mErr } = await supabase
            .from("messages")
            .select("id, sender_type, body, created_at")
            .eq("conversation_id", id)
            .order("created_at", { ascending: true });

        if (mErr) {
            setError(mErr.message);
            return;
        }
        setMsgs(m || []);
    }

    async function loadCanned() {
        const { data, error } = await supabase
            .from("canned_replies")
            .select("id, title, body, sort_order, is_active")
            .eq("is_active", true)
            .order("sort_order", { ascending: true });

        if (error) {
            console.error("canned_replies load failed", error);
            setCanned([]);
            return;
        }
        setCanned(data || []);
    }

    React.useEffect(() => {
        load();

        const channel = supabase
            .channel(`chat-${id}`)

            // ✅ incremental: append messages on insert (no full reload)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
                (payload) => {
                    const row = payload?.new;
                    if (!row) return;

                    // keep list stable, avoid duplicates if reconnect delivers same insert
                    setMsgs((prev) => {
                        if (prev.some((x) => x.id === row.id)) return prev;
                        return [...prev, row];
                    });
                }
            )

            // ✅ conversations changes still reload (assignment/status changes)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "conversations", filter: `id=eq.${id}` },
                () => load()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    async function claimChat() {
        if (!me) return;
        setError("");
        setClaiming(true);

        try {
            const { data: claimRows, error: claimErr } = await supabase.rpc("claim_conversation", {
                p_conversation_id: id,
            });

            if (claimErr) {
                setError(claimErr.message);
                return;
            }

            if (!claimRows || claimRows.length === 0) {
                setError("Already claimed by someone else.");
                await load();
                return;
            }

            const { error: notifyErr } = await supabase.functions.invoke("staff_notify_claimed", {
                body: { conversation_id: id },
            });

            if (notifyErr) console.error("staff_notify_claimed failed", notifyErr);

            await load();
        } finally {
            setClaiming(false);
        }
    }

    async function send() {
        setError("");
        if (sending) return;

        const msg = text.trim();
        if (!msg) return;
        if (!me || !convo) return;

        const assignedTo = convo?.assigned_to;
        const canSendLocal = convo?.status === "open" && assignedTo === me.id; // ✅ must be yours

        if (!canSendLocal) {
            setError("You must claim this chat before replying.");
            return;
        }

        setSending(true);
        try {
            const { error: insErr } = await supabase.from("messages").insert({
                conversation_id: id,
                sender_type: "staff",
                sender_user_id: me.id,
                body: msg,
            });

            if (insErr) {
                setError(insErr.message);
                return;
            }

            setText("");
        } finally {
            setSending(false);
        }
    }

    async function closeChat() {
        setError("");
        if (!me || !convo) return;

        const assignedTo = convo?.assigned_to;
        const canClose = convo?.status === "open" && (!assignedTo || assignedTo === me?.id);

        if (!canClose) {
            setError("This chat is assigned to someone else.");
            return;
        }

        let myDisplay = "Staff";
        const { data: prof, error: profErr } = await supabase
            .from("staff_profiles")
            .select("display_name, username")
            .eq("user_id", me.id)
            .maybeSingle();

        if (profErr) console.error("closeChat profile lookup failed", profErr);
        myDisplay = prof?.display_name || prof?.username || "Staff";

        const { error: updErr } = await supabase
            .from("conversations")
            .update({
                status: "closed",
                assigned_to: null,
                handled_by: me.id,
                handled_by_name: myDisplay,
                closed_at: new Date().toISOString(),
            })
            .eq("id", id);

        if (updErr) {
            setError(updErr.message);
            return;
        }

        const { error: notifyErr } = await supabase.functions.invoke("staff_notify_closed", {
            body: { conversation_id: id },
        });

        if (notifyErr) console.error("staff_notify_closed failed", notifyErr);

        setText("");
        await load();
    }

    if (error) return <div style={S.alertErr}>Error: {error}</div>;
    if (!convo) return <div style={{ ...S.page, padding: 12, color: ui.colors.muted, fontWeight: 800 }}>Loading…</div>;

    const isMine = convo.assigned_to && convo.assigned_to === me?.id;
    const isUnassigned = !convo.assigned_to;
    const canSend = convo.status === "open" && isMine;

    return (
        <div style={S.page}>
            <div style={S.header}>
                <div>
                    {/* (Per your request: not changing #4) */}
                    <Link to="/" style={{ textDecoration: "none", color: ui.colors.brand }}>
                        ← Inbox
                    </Link>

                    <h2 style={S.h2}>{convo.customer_name}</h2>

                    <div style={S.subtitle}>
                        Site: <b>{convo.site_id || "—"}</b> • Status: <b>{convo.status}</b> •{" "}
                        {convo.assigned_to ? (isMine ? "Assigned to you" : "Assigned") : "Unassigned"}
                    </div>
                </div>

                <div style={S.toolbar}>
                    {/* ✅ Only show Claim when relevant */}
                    {convo.status === "open" && isUnassigned && (
                        <button
                            onClick={claimChat}
                            disabled={claiming}
                            title="Claim this chat"
                            style={{
                                ...S.btnPrimary,
                                opacity: claiming ? 0.6 : 1,
                                cursor: claiming ? "not-allowed" : "pointer",
                            }}
                        >
                            {claiming ? "Claiming…" : "Claim"}
                        </button>
                    )}

                    {/* ✅ Only show Close when it can do something */}
                    {convo.status === "open" && (isUnassigned || isMine) && (
                        <button
                            onClick={closeChat}
                            style={{
                                ...S.btnDanger,
                            }}
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>

            {!canSend && convo.status === "open" && !isUnassigned && !isMine && (
                <div style={S.alertWarn}>
                    This chat is assigned to someone else. You can view it, but only the assigned staff member can reply.
                </div>
            )}

            {convo.status === "closed" && <div style={S.alertNeutral}>This chat is closed.</div>}

            {isUnassigned && convo.status === "open" && <div style={S.alertInfo}>Claim this chat to reply to the customer.</div>}

            <div
                style={{
                    ...S.grid,
                    gridTemplateColumns: layoutNarrow ? "1fr" : S.grid.gridTemplateColumns,
                }}
            >
                {/* Left */}
                <div style={S.leftCard}>
                    <div style={S.cardHeader}>
                        <span>Conversation</span>
                        <span style={S.headerHint}>
                            {canSend ? "Ctrl/Cmd + Enter to send" : "Read only"}
                        </span>
                    </div>

                    <div
                        style={S.messages}
                        ref={messagesRef}
                        onScroll={markScrollStickiness}
                    >
                        {msgs.length === 0 ? (
                            <div style={{ color: ui.colors.muted, fontWeight: 700 }}>No messages yet.</div>
                        ) : (
                            msgs.map((m) => {
                                const isSystem = (m.body || "").startsWith("SYSTEM:");
                                const fromStaff = m.sender_type === "staff";
                                const alignRight = fromStaff && !isSystem; // staff bubbles right

                                const meta = `${m.sender_type}${m.created_at ? ` • ${new Date(m.created_at).toLocaleString()}` : ""}`;

                                const bubbleStyle = {
                                    ...S.bubble,
                                    ...(isSystem ? S.bubbleSystem : fromStaff ? S.bubbleMe : S.bubbleCustomer),
                                };

                                return (
                                    <div
                                        key={m.id}
                                        style={{
                                            ...S.msgRow,
                                            justifyContent: alignRight ? "flex-end" : "flex-start",
                                        }}
                                    >
                                        <div style={bubbleStyle}>
                                            <div style={S.msgMeta}>{meta}</div>

                                            {isSystem ? (
                                                <div style={S.system}>{(m.body || "").replace(/^SYSTEM:\s*/, "")}</div>
                                            ) : (
                                                <div style={S.body}>{m.body}</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <div style={S.composer}>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={canSend ? "Type reply… (Ctrl/Cmd+Enter to send)" : "Claim this chat to reply"}
                            style={{ ...S.input, height: 90, resize: "vertical" }}
                            disabled={!canSend || sending}
                            onKeyDown={(e) => {
                                if (sending) return;
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    send();
                                }
                            }}
                        />

                        <button
                            onClick={send}
                            disabled={!canSend || sending}
                            style={{
                                ...S.btnPrimary,
                                opacity: !canSend || sending ? 0.6 : 1,
                                cursor: !canSend || sending ? "not-allowed" : "pointer",
                                flex: "0 0 auto",
                                height: 42,
                            }}
                            title={canSend ? "Send" : "Claim this chat first"}
                        >
                            {sending ? "Sending…" : "Send"}
                        </button>
                    </div>
                </div>

                {/* Right */}
                <div style={S.rightCard}>
                    <div style={S.cardHeader}>
                        <span>Canned replies</span>
                        {!canSend ? <span style={S.headerHint}>Claim to use</span> : null}
                    </div>

                    <div style={S.cannedList}>
                        {canned.length === 0 ? (
                            <div style={{ fontSize: 13, color: ui.colors.muted, fontWeight: 700 }}>
                                No canned replies yet.
                            </div>
                        ) : (
                            canned.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setText(r.body)}
                                    style={{
                                        ...S.cannedBtn,
                                        opacity: canSend ? 1 : 0.45,
                                        cursor: canSend ? "pointer" : "not-allowed",
                                    }}
                                    title={r.body}
                                    disabled={!canSend}
                                >
                                    <div style={S.cannedTitle}>{r.title}</div>
                                    <div style={S.cannedSub}>Click to insert</div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
