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

    async function load() {
        setError("");
        const { data: { user } } = await supabase.auth.getUser();
        setMe(user);

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

        const { data: m, error: mErr } = await supabase
            .from("messages")
            .select("id, sender_type, body, created_at")
            .eq("conversation_id", id)
            .order("created_at", { ascending: true });

        if (mErr) setError(mErr.message);
        setMsgs(m || []);
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

        return () => supabase.removeChannel(channel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    async function send() {
        setError("");
        const msg = text.trim();
        if (!msg) return;

        const { error } = await supabase.from("messages").insert({
            conversation_id: id,
            sender_type: "staff",
            sender_user_id: me.id,
            body: msg,
        });

        if (error) {
            setError(error.message);
            return;
        }

        setText("");
    }

    async function closeChat() {
        const { error } = await supabase
            .from("conversations")
            .update({ status: "closed" })
            .eq("id", id);

        if (error) setError(error.message);
    }

    if (error) return <div style={{ padding: 16 }}>Error: {error}</div>;
    if (!convo) return <div style={{ padding: 16 }}>Loading…</div>;

    const isMine = convo.assigned_to && convo.assigned_to === me?.id;

    return (
        <div style={{ maxWidth: 900, margin: "20px auto", padding: 16 }}>
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
                    {/* Claim button will be replaced with staff_claim_chat function call next */}
                    <button disabled={!!convo.assigned_to}>Claim (next step)</button>
                    <button onClick={closeChat} disabled={convo.status !== "open"}>
                        Close
                    </button>
                </div>
            </div>

            <div
                style={{
                    marginTop: 16,
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    padding: 12,
                    height: 420,
                    overflow: "auto",
                    background: "#fafafa",
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
                    placeholder="Type reply…"
                    style={{ flex: 1, padding: 10 }}
                />
                <button onClick={send} disabled={convo.status !== "open"}>
                    Send
                </button>
            </div>
        </div>
    );
}
