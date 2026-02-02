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
    const [displayName, setDisplayName] = React.useState("");

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

                if (prof?.role) setRole(String(prof.role).toLowerCase());

                const emailPrefix = user?.email ? user.email.split("@")[0] : "";
                const bestName =
                    (prof?.display_name && prof.display_name.trim()) ||
                    (prof?.username && prof.username.trim()) ||
                    emailPrefix;

                setDisplayName(bestName);
            }

            setLoading(false);
        })();
    }, [loc.pathname]);

    return (
        <div
            style={{
                display: "flex",
                minHeight: "100vh",
                width: "100%",
                fontFamily: ui.font.ui,
                background: ui.colors.pageBg, // fallback behind everything
            }}
        >
            <Sidebar role={role} />

            <main
                style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    background: ui.colors.pageBg, // ✅ paints the whole right side
                }}
            >
                {/* Top bar */}
                <div
                    style={{
                        height: 64,
                        flex: "0 0 auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 18px",
                        background: ui.colors.cardBg,
                        borderBottom: `1px solid ${ui.colors.border}`,
                        width: "100%", // ✅ ensure full width
                        boxSizing: "border-box",
                    }}
                >
                    <div style={{ color: ui.colors.text, fontWeight: 800 }}>
                        {role === "admin" ? "Admin Portal" : "Agent Console"}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: ui.colors.text }}>
                            {loading ? "Loading…" : displayName || me?.email || "—"}
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
                                color: ui.colors.text,
                            }}
                        >
                            Sign out
                        </button>
                    </div>
                </div>

                {/* Page content */}
                <div
                    style={{
                        flex: 1, // ✅ fills remaining height
                        background: ui.colors.pageBg, // ✅ paints full remainder
                        padding: 18,
                        boxSizing: "border-box",
                    }}
                >
                    <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
                        <div
                            style={{
                                background: ui.colors.cardBg,
                                border: `1px solid ${ui.colors.border}`,
                                borderRadius: ui.radius.lg,
                                boxShadow: ui.shadow.card,
                                padding: 16,
                                boxSizing: "border-box",
                                minHeight: "100%", // ✅ fills the grey area height
                                width: "100%",     // ✅ fills the container width
                            }}
                        >
                            <Outlet />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
