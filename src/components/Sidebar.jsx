// src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { ui } from "../ui/tokens";

function SectionTitle({ children }) {
    return (
        <div
            style={{
                marginTop: 14,
                marginBottom: 8,
                padding: "0 14px",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: ui.colors.sidebarMuted,
                opacity: 0.9,
            }}
        >
            {children}
        </div>
    );
}

function Item({ to, label }) {
    return (
        <NavLink
            to={to}
            style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                margin: "2px 10px",
                borderRadius: 12,
                textDecoration: "none",
                color: ui.colors.sidebarText,
                background: isActive ? ui.colors.sidebarActiveBg : "transparent",
                position: "relative",
                fontWeight: isActive ? 700 : 500,
            })}
        >
            {({ isActive }) => (
                <>
                    <span
                        style={{
                            width: 6,
                            height: 18,
                            borderRadius: 999,
                            background: isActive ? ui.colors.brand : "transparent",
                            boxShadow: isActive ? `0 0 0 4px ${ui.colors.brandSoft}` : "none",
                            flex: "0 0 auto",
                        }}
                    />
                    <span>{label}</span>
                </>
            )}
        </NavLink>
    );
}

export default function Sidebar({ role = "agent" }) {
    const isAdmin = String(role).toLowerCase() === "admin";

    return (
        <aside
            style={{
                width: 260,
                minWidth: 260,
                height: "100vh",
                position: "sticky",
                top: 0,
                background: `linear-gradient(180deg, ${ui.colors.sidebarBg} 0%, ${ui.colors.sidebarBg2} 100%)`,
                borderRight: `1px solid ${ui.colors.sidebarBorder}`,
                color: ui.colors.sidebarText,
                fontFamily: ui.font.ui,
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Brand */}
            <div
                style={{
                    padding: "18px 16px 14px 16px",
                    borderBottom: `1px solid ${ui.colors.sidebarBorder}`,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                        style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background: ui.colors.brand,
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 900,
                            color: "white",
                        }}
                    >
                        S
                    </div>

                    <div style={{ lineHeight: 1.1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>Slanj</div>
                        <div style={{ fontSize: 12, color: ui.colors.sidebarMuted }}>
                            Live Chat
                        </div>
                    </div>

                    {/* ✅ removed Agent/Admin pill from header */}
                </div>
            </div>

            {/* Nav */}
            <div style={{ paddingTop: 10, overflow: "auto" }}>
                <SectionTitle>Apps</SectionTitle>
                <Item to="/" label="Inbox" />

                <SectionTitle>User</SectionTitle>
                <Item to="/change-pin" label="Change PIN" />

                {isAdmin && (
                    <>
                        <SectionTitle>Admin</SectionTitle>
                        <Item to="/admin/live" label="Active Chats" />
                        <Item to="/admin/insights" label="Insights" />
                        <Item to="/admin/users" label="Users" />
                        <Item to="/admin/canned" label="Canned Replies" />
                    </>
                )}
            </div>

            {/* Bottom */}
            <div
                style={{
                    marginTop: "auto",
                    padding: 14,
                    borderTop: `1px solid ${ui.colors.sidebarBorder}`,
                    color: ui.colors.sidebarMuted,
                    fontSize: 12,
                }}
            >
                <div style={{ opacity: 0.9 }}>
                    Ross Lyall © {new Date().getFullYear()}
                </div>
            </div>
        </aside>
    );
}
