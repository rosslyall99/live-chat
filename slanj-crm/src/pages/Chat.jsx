import React from "react";
import { supabase } from "../supabaseClient";
import { useParams, Link } from "react-router-dom";

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
        await loadCanned(c.site_id);

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

    async function loadCanned(siteId) {
        // global (site_id is null) OR matching site_id
        const { data, error } = await supabase
            .from("canned_replies")
            .select("id, title, body, site_id, sort_order")
            .or(`site_id.is.null,site_id.eq.${siteId}`)
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
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
                () => load()
            )
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
            // 1) Atomic claim via RPC: returns [] if someone else claimed first
            const { data: claimRows, error: claimErr } = await supabase.rpc(
                "claim_conversation",
                { p_conversation_id: id }
            );

            if (claimErr) {
                setError(claimErr.message);
                return;
            }

            if (!claimRows || claimRows.length === 0) {
                setError("Already claimed by someone else.");
                await load();
                return;
            }

            // 2) Notify Teams (JWT ON function) - invoke adds headers automatically
            const { error: notifyErr } = await supabase.functions.invoke(
                "staff_notify_claimed",
                { body: { conversation_id: id } }
            );

            if (notifyErr) {
                console.error("staff_notify_claimed failed", notifyErr);
                // Don't block UX if Teams notification fails
            }

            await load();
        } finally {
            setClaiming(false);
        }
    }


    async function send() {
        setError("");
        const msg = text.trim();
        if (!msg) return;
        if (!me) return;

        // Only allow sending if:
        // - chat is unassigned (any staff can reply), OR
        // - assigned_to is you
        const assignedTo = convo?.assigned_to;
        const canSend = !assignedTo || assignedTo === me.id;

        if (!canSend) {
            setError("This chat is assigned to someone else.");
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
        if (!me) return;

        const assignedTo = convo?.assigned_to;
        const canClose = convo?.status === "open" && (!assignedTo || assignedTo === me?.id);

        if (!canClose) {
            setError("This chat is assigned to someone else.");
            return;
        }

        // 1) Update conversation
        const { error: updErr } = await supabase
            .from("conversations")
            .update({
                status: "closed",
                closed_at: new Date().toISOString(),
            })
            .eq("id", id);

        if (updErr) {
            setError(updErr.message);
            return;
        }

        // 2) Notify Teams (don’t block UX if it fails)
        const { error: notifyErr } = await supabase.functions.invoke(
            "staff_notify_closed",
            { body: { conversation_id: id } }
        );

        if (notifyErr) {
            console.error("staff_notify_closed failed", notifyErr);
        }

        setText("");
        await load();
    }

    if (error) return <div style={{ padding: 16 }}>Error: {error}</div>;
    if (!convo) return <div style={{ padding: 16 }}>Loading…</div>;

    const isMine = convo.assigned_to && convo.assigned_to === me?.id;
    const isUnassigned = !convo.assigned_to;
    const canSend = convo.status === "open" && isMine;

    return (
        <div style={{ maxWidth: 1100, margin: "20px auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                    <Link to="/">← Inbox</Link>
                    <h2 style={{ marginTop: 8 }}>{convo.customer_name}</h2>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Site: {convo.site_id} • Status: {convo.status} •{" "}
                        {convo.assigned_to ? (isMine ? "Assigned to you" : "Assigned") : "Unassigned"}
                    </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
                    <button
                        onClick={claimChat}
                        disabled={!!convo.assigned_to || convo.status !== "open" || claiming}
                        title={convo.assigned_to ? "Already assigned" : "Claim this chat"}
                    >
                        {claiming ? "Claiming…" : "Claim"}
                    </button>

                    <button onClick={closeChat} disabled={convo.status !== "open" || (!isUnassigned && !isMine)}>
                        Close
                    </button>
                </div>
            </div>

            {!canSend && convo.status === "open" && !isUnassigned && !isMine && (
                <div
                    style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "#fff3cd",
                        border: "1px solid #ffeeba",
                        color: "#111",
                    }}
                >
                    This chat is assigned to someone else. You can view it, but only the assigned staff member can reply.
                </div>
            )}

            {convo.status === "closed" && (
                <div
                    style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "#e9ecef",
                        border: "1px solid #ced4da",
                        color: "#111",
                    }}
                >
                    This chat is closed.
                </div>
            )}

            {isUnassigned && convo.status === "open" && (
                <div
                    style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 10,
                        background: "#e7f3ff",
                        border: "1px solid #b6daff",
                        color: "#111",
                    }}
                >
                    Claim this chat to reply to the customer.
                </div>
            )}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 300px",
                    gap: 12,
                    marginTop: 16,
                }}
            >
                {/* Left: messages + input */}
                <div>
                    <div
                        style={{
                            border: "1px solid #ddd",
                            borderRadius: 10,
                            padding: 12,
                            height: 420,
                            overflow: "auto",
                            background: "#fafafa",
                            color: "#111",
                        }}
                    >
                        {msgs.map((m) => (
                            <div key={m.id} style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 12, opacity: 0.6 }}>
                                    {m.sender_type} • {new Date(m.created_at).toLocaleString()}
                                </div>
                                <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <input
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder={canSend ? "Type reply…" : "You can’t reply to this chat"}
                            style={{ flex: 1, padding: 10 }}
                            disabled={!canSend || sending}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") send();
                            }}
                        />
                        <button onClick={send} disabled={!canSend || sending}>
                            {sending ? "Sending…" : "Send"}
                        </button>
                    </div>
                </div>

                {/* Right: canned replies */}
                <div
                    style={{
                        border: "1px solid #ddd",
                        borderRadius: 10,
                        padding: 12,
                        background: "#fff",
                        height: 420 + 12 + 42, // roughly match left area height
                        overflow: "auto",
                        color: "#111",
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Canned replies</div>

                    {canned.length === 0 ? (
                        <div style={{ fontSize: 13, opacity: 0.7 }}>No canned replies yet.</div>
                    ) : (
                        <div style={{ display: "grid", gap: 8 }}>
                            {canned.map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => setText(r.body)}
                                    style={{
                                        textAlign: "left",
                                        padding: 10,
                                        borderRadius: 10,
                                        border: "1px solid #eee",
                                        background: "#fafafa",
                                        cursor: "pointer",
                                        color: "#111",
                                    }}
                                    title={r.body}
                                    disabled={!canSend}
                                >
                                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.title}</div>
                                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                                        {r.site_id ? `Site: ${r.site_id}` : "Global"}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
