import React from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

export default function Inbox() {
    const [tab, setTab] = React.useState("unassigned"); // unassigned | mine
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [me, setMe] = React.useState(null);
    const [role, setRole] = React.useState(null);

    async function load() {
        setLoading(true);

        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
            console.error(userErr);
            setRows([]);
            setLoading(false);
            return;
        }
        setMe(user);
        const { data: profile } = await supabase
            .from("staff_profiles")
            .select("role, is_active")
            .eq("user_id", user.id)
            .single();

        setRole(profile?.is_active ? profile?.role : null);


        let q = supabase
            .from("conversations")
            .select("id, site_id, customer_name, status, assigned_to, last_message_at, closed_at");

        if (tab === "unassigned") {
            q = q
                .eq("status", "open")
                .is("assigned_to", null)
                .order("last_message_at", { ascending: false });
        }

        if (tab === "mine") {
            q = q
                .eq("status", "open")
                .eq("assigned_to", user.id)
                .order("last_message_at", { ascending: false });
        }

        if (tab === "closed") {
            q = q
                .eq("status", "closed")
                .order("closed_at", { ascending: false })
                .order("last_message_at", { ascending: false });
        }

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

    const segBtn = (active) => ({
        padding: "10px 12px",
        borderRadius: 12,
        border: active ? "1px solid #bbb" : "1px solid #ddd",
        background: active ? "#fff" : "#f6f6f6",
        fontWeight: active ? 800 : 700,
        cursor: "pointer",
    });

    return (
        <div style={{ maxWidth: 900, margin: "20px auto", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                    <h2 style={{ margin: 0 }}>Inbox</h2>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                        Unassigned chats are visible to everyone. Claim to reply.
                    </div>
                </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 12, }}>
                <button style={segBtn(tab === "unassigned")} onClick={() => setTab("unassigned")}>
                    Unassigned
                </button>

                <button style={segBtn(tab === "mine")} onClick={() => setTab("mine")}>
                    Mine
                </button>

                <button style={segBtn(tab === "closed")} onClick={() => setTab("closed")}>
                    Closed
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
                                        {tab === "closed" && c.closed_at ? ` • Closed: ${new Date(c.closed_at).toLocaleString()}` : ""}
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                    {new Date((tab === "closed" ? (c.closed_at || c.last_message_at) : c.last_message_at)).toLocaleString()}
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
