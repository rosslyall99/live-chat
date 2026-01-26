import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

export default function Inbox() {
    const [tab, setTab] = React.useState("unassigned"); // unassigned | mine
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [me, setMe] = React.useState(null);

    async function load() {
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        setMe(user);

        let q = supabase
            .from("conversations")
            .select("id, site_id, customer_name, status, assigned_to, last_message_at")
            .eq("status", "open")
            .order("last_message_at", { ascending: false });

        if (tab === "unassigned") q = q.is("assigned_to", null);
        if (tab === "mine") q = q.eq("assigned_to", user.id);

        const { data, error } = await q;

        if (error) {
            console.error(error);
            setRows([]);
        } else {
            setRows(data || []);
        }

        setLoading(false);
    }

    React.useEffect(() => {
        load();

        // Realtime refresh on new messages or conversation updates
        const channel = supabase
            .channel("inbox-realtime")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "messages" },
                () => load()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "conversations" },
                () => load()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    async function signOut() {
        await supabase.auth.signOut();
        window.location.href = "/login";
    }

    return (
        <div style={{ maxWidth: 900, margin: "20px auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <h2>Live Chat Inbox</h2>
                <button onClick={signOut}>Sign out</button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button
                    onClick={() => setTab("unassigned")}
                    style={{ fontWeight: tab === "unassigned" ? "700" : "400" }}
                >
                    Unassigned
                </button>
                <button
                    onClick={() => setTab("mine")}
                    style={{ fontWeight: tab === "mine" ? "700" : "400" }}
                >
                    Mine
                </button>
            </div>

            {loading ? (
                <div>Loading…</div>
            ) : rows.length === 0 ? (
                <div>No chats here right now.</div>
            ) : (
                <div style={{ display: "grid", gap: 10 }}>
                    {rows.map((c) => (
                        <Link
                            key={c.id}
                            to={`/chat/${c.id}`}
                            style={{
                                textDecoration: "none",
                                border: "1px solid #ddd",
                                borderRadius: 10,
                                padding: 12,
                                color: "inherit",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <div>
                                    <div style={{ fontWeight: 700 }}>{c.customer_name}</div>
                                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                                        Site: {c.site_id} • Status: {c.status}
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                    {new Date(c.last_message_at).toLocaleString()}
                                </div>
                            </div>
                            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
                                {c.assigned_to
                                    ? c.assigned_to === me?.id
                                        ? "Assigned to you"
                                        : "Assigned"
                                    : "Unassigned"}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
