// src/components/Shell.jsx
import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Sidebar from "./Sidebar";
import { ui } from "../ui/tokens";

export default function Shell() {
    const [me, setMe] = React.useState(null);
    const [role, setRole] = React.useState("agent");
    const [loading, setLoading] = React.useState(true);
    const loc = useLocation();

    React.useEffect(() => {
        (async () => {
            setLoading(true);

            const { data: userData } = await supabase.auth.getUser();
            const user = userData?.user ?? null;
            setMe(user);

            // Best-effort role lookup (works if RLS allows staff to read their own profile)
            if (user?.id) {
                const { data: prof } = await supabase
                    .from("staff_profiles")
                    .select("role, display_name, username")
                    .eq("user_id", user.id)
                    .maybeSingle();

                if (prof?.role) setRole(prof.role);
            }

            setLoading(false);
        })();
    }, [loc.pathname]);

    return (
        <div
            style={{
                display: "flex",
                minHeight: "100vh",
                fontFamily: ui.font.ui,
                background: ui.colors.pageBg,
            }}
        >
            <Sidebar role={role} />

            <main style={{ flex: 1, minWidth: 0 }}>
                {/* Top bar */}
                <div
                    style={{
                        height: 64,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 18px",
                        background: ui.colors.cardBg,
                        borderBottom: `1px solid ${ui.colors.border}`,
                    }}
                >
                    <div style={{ color: ui.colors.text, fontWeight: 800 }}>
                        {role === "admin" ? "Admin Portal" : "Agent Console"}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                            style={{
                                fontSize: 12,
                                color: ui.colors.muted,
                            }}
                        >
                            {loading ? "Loading…" : me?.email || "—"}
                        </span>

                        <span
                            style={{
                                fontSize: 12,
                                fontWeight: 800,
                                padding: "6px 10px",
                                borderRadius: 999,
                                background: ui.colors.brandSoft,
                                border: `1px solid ${ui.colors.border}`,
                                color: ui.colors.text,
                                textTransform: "capitalize",
                            }}
                        >
                            {role}
                        </span>

                        <button
                            onClick={() => supabase.auth.signOut()}
                            style={{
                                padding: "8px 12px",
                                borderRadius: 12,
                                border: `1px solid ${ui.colors.border}`,
                                background: ui.colors.cardBg,
                                cursor: "pointer",
                                fontWeight: 700,
                                color: ui.colors.text
                            }}
                        >
                            Sign out
                        </button>
                    </div>
                </div>

                {/* Page content */}
                <div style={{ padding: 18 }}>
                    <div
                        style={{
                            background: ui.colors.cardBg,
                            border: `1px solid ${ui.colors.border}`,
                            borderRadius: ui.radius.lg,
                            boxShadow: ui.shadow.card,
                            padding: 16,
                            minHeight: "calc(100vh - 64px - 36px)",
                        }}
                    >
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
