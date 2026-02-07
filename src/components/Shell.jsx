// src/components/Shell.jsx
import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Sidebar from "./Sidebar";
import { ui } from "../ui/tokens";
import Lion from "../images/lion.png";

function siteLetter(siteId) {
    if (!siteId) return "?";
    const map = { duke: "D", sten: "S", off: "O" };
    return map[siteId] || String(siteId).slice(0, 1).toUpperCase();
}

function prettySite(siteId) {
    if (!siteId) return "—";
    const map = { duke: "Duke Street", off: "Office", sten: "St Enoch" };
    return map[siteId] || siteId;
}

export default function Shell() {
    const [me, setMe] = React.useState(null);
    const [role, setRole] = React.useState("agent");
    const [loading, setLoading] = React.useState(true);
    const loc = useLocation();
    const [displayName, setDisplayName] = React.useState("");

    // Kill switch state
    const [siteId, setSiteId] = React.useState(null);
    const [branchEnabled, setBranchEnabled] = React.useState(true);
    const [globalEnabled, setGlobalEnabled] = React.useState(true);
    const [switchLoading, setSwitchLoading] = React.useState(false);
    const [switchError, setSwitchError] = React.useState("");

    const onBg = "rgba(22, 163, 74, 0.12)";
    const onBorder = "rgba(22, 163, 74, 0.28)";
    const onText = "rgb(22, 163, 74)";

    const offBg = "rgba(220, 38, 38, 0.10)";
    const offBorder = "rgba(220, 38, 38, 0.26)";
    const offText = "rgb(220, 38, 38)";

    function iconToggleStyle(isOn, disabled) {
        return {
            width: 38,
            height: 34,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            border: `1px solid ${isOn ? onBorder : offBorder}`,
            background: isOn ? onBg : offBg,
            color: "#111",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.55 : 1,
            boxSizing: "border-box",
            transition: "transform 120ms ease, opacity 120ms ease",
            padding: 0,
            overflow: "hidden",
        };
    }

    async function refreshMeAndSettings() {
        setLoading(true);
        setSwitchError("");

        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user ?? null;
        setMe(user);

        if (user?.id) {
            const { data: prof } = await supabase
                .from("staff_profiles")
                .select("role, display_name, username, site_id")
                .eq("user_id", user.id)
                .maybeSingle();

            const nextRole = prof?.role ? String(prof.role).toLowerCase() : "agent";
            setRole(nextRole);

            const emailPrefix = user?.email ? user.email.split("@")[0] : "";
            const bestName =
                (prof?.display_name && prof.display_name.trim()) ||
                (prof?.username && prof.username.trim()) ||
                emailPrefix;
            setDisplayName(bestName);

            const nextSiteId = prof?.site_id || null;
            setSiteId(nextSiteId);

            if (nextSiteId) {
                const { data: cs } = await supabase
                    .from("chat_settings")
                    .select("enabled, global_enabled")
                    .eq("site_id", nextSiteId)
                    .maybeSingle();

                if (cs) {
                    setBranchEnabled(cs.enabled !== false);
                    setGlobalEnabled(cs.global_enabled !== false);
                }
            }
        }

        setLoading(false);
    }

    React.useEffect(() => {
        refreshMeAndSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loc.pathname]);

    async function toggleBranch(next) {
        setSwitchError("");
        setSwitchLoading(true);

        const prev = branchEnabled;
        setBranchEnabled(next);

        const { data, error } = await supabase.functions.invoke("toggle_branch_chat", {
            body: { enabled: next },
        });

        if (error || !data?.ok) {
            setBranchEnabled(prev);
            setSwitchError(data?.error || error?.message || "Failed to update branch switch");
        } else {
            if (data?.updated?.enabled !== undefined) setBranchEnabled(!!data.updated.enabled);
        }

        setSwitchLoading(false);
    }

    async function toggleGlobal(next) {
        setSwitchError("");
        setSwitchLoading(true);

        const prev = globalEnabled;
        setGlobalEnabled(next);

        const { data, error } = await supabase.functions.invoke("toggle_global_chat", {
            body: { global_enabled: next },
        });

        if (error || !data?.ok) {
            setGlobalEnabled(prev);
            setSwitchError(data?.error || error?.message || "Failed to update global switch");
        } else {
            setGlobalEnabled(!!data.global_enabled);
            await refreshMeAndSettings();
        }

        setSwitchLoading(false);
    }

    const isAdmin = role === "admin";
    const isManager = role === "manager";

    // anyone logged-in with a site can toggle branch
    const canToggleBranch = !!siteId && !loading && !switchLoading;

    // only admin + manager can toggle global
    const canToggleGlobal = (isAdmin || isManager) && !loading && !switchLoading;

    const effectiveLive = globalEnabled && branchEnabled;

    // Optional polish: tiny "press" effect without affecting layout focus
    function pressDown(e) {
        e.preventDefault();
        e.currentTarget.style.transform = "translateY(1px)";
    }
    function pressUp(e) {
        e.currentTarget.style.transform = "translateY(0px)";
    }

    return (
        <div
            style={{
                display: "flex",
                minHeight: "100vh",
                width: "100%",
                fontFamily: ui.font.ui,
                background: ui.colors.pageBg,
            }}
        >
            <Sidebar role={role} />

            <main
                style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    background: ui.colors.pageBg,
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
                        width: "100%",
                        boxSizing: "border-box",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ color: ui.colors.text, fontWeight: 800 }}>
                            {role === "admin" ? "Admin Portal" : role === "manager" ? "Manager Console" : "Agent Console"}
                        </div>

                        {/* Kill switch buttons */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {/* Branch toggle */}
                            <button
                                disabled={!canToggleBranch}
                                onClick={() => toggleBranch(!branchEnabled)}
                                title={`Branch: ${prettySite(siteId)} (${branchEnabled ? "Online" : "Offline"})`}
                                style={iconToggleStyle(branchEnabled, !canToggleBranch)}
                                onMouseDown={pressDown}
                                onMouseUp={pressUp}
                                onMouseLeave={pressUp}
                            >
                                <span style={{ fontSize: 13, fontWeight: 950, letterSpacing: "0.02em", fontFamily: ui.font.ui }}>
                                    {siteLetter(siteId)}
                                </span>
                            </button>

                            {/* Global toggle (admin/manager only) */}
                            {(isAdmin || isManager) && (
                                <button
                                    disabled={!canToggleGlobal}
                                    onClick={() => toggleGlobal(!globalEnabled)}
                                    title={`Global (${globalEnabled ? "Online" : "Offline"})`}
                                    style={iconToggleStyle(globalEnabled, !canToggleGlobal)}
                                    onMouseDown={pressDown}
                                    onMouseUp={pressUp}
                                    onMouseLeave={pressUp}
                                >
                                    <img
                                        src={Lion}
                                        alt=""
                                        style={{
                                            width: 18,
                                            height: 18,
                                            objectFit: "contain",
                                            display: "block",
                                            filter: "grayscale(100%) contrast(120%)",
                                            opacity: 0.9,
                                        }}
                                    />
                                </button>
                            )}

                            {/* Quiet status text */}
                            <span
                                style={{
                                    marginLeft: 6,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: ui.colors.muted,
                                }}
                                title="Effective status = Global AND Branch"
                            >
                                {effectiveLive ? "Online" : "Offline"}
                            </span>

                            {!!switchError && (
                                <span style={{ fontSize: 12, fontWeight: 800, color: "#B42318", marginLeft: 10 }}>
                                    {switchError}
                                </span>
                            )}
                        </div>
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
                        flex: 1,
                        background: ui.colors.pageBg,
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
                                minHeight: "100%",
                                width: "100%",
                            }}
                        >
                            <Outlet />
                        </div>
                    </div>
                </div>
            </main >
        </div >
    );
}
