// src/pages/ChangePin.jsx (or wherever it lives)
import React from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import { ui } from "../ui/tokens";

function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@staff.slanj`;
}

function EyeIcon({ size = 18 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function EyeOffIcon({ size = 18 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.77 21.77 0 0 1 5.06-5.94" />
            <path d="M1 1l22 22" />
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a21.77 21.77 0 0 1-4.87 5.79" />
            <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
        </svg>
    );
}

function PinInput({ id, value, onChange, show, setShow, autoComplete, ui }) {
    return (
        <div style={{ position: "relative", marginTop: 6 }}>
            <input
                id={id}
                value={value}
                onChange={onChange}
                type={show ? "text" : "password"}
                autoComplete={autoComplete}
                style={{
                    width: "100%",
                    padding: "10px 42px 10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${ui.colors.border}`,
                    background: ui.colors.cardBg,
                    color: ui.colors.text,
                    boxSizing: "border-box",
                    outline: "none",
                    opacity: 0.6,
                    transition: "opacity 120ms ease",
                }}
            />

            {value && (
                <button
                    type="button"
                    aria-label={show ? "Hide PIN" : "Show PIN"}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => setShow((s) => !s)}
                    style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: ui.colors.muted,
                        padding: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.65,
                    }}
                >
                    {show ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            )}
        </div>
    );
}

export default function ChangePin() {
    const nav = useNavigate();
    const [currentPin, setCurrentPin] = React.useState("");
    const [newPin, setNewPin] = React.useState("");
    const [confirm, setConfirm] = React.useState("");
    const [error, setError] = React.useState("");
    const [ok, setOk] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [showCurrent, setShowCurrent] = React.useState(false);
    const [showNew, setShowNew] = React.useState(false);
    const [showConfirm, setShowConfirm] = React.useState(false);

    const inputStyle = {
        width: "100%",
        padding: "10px 12px",
        marginTop: 6,
        borderRadius: 12,
        border: `1px solid ${ui.colors.border}`,
        background: ui.colors.cardBg,
        color: ui.colors.text,
        outline: "none",
        boxSizing: "border-box",
    };

    const labelStyle = {
        display: "block",
        marginTop: 12,
        fontSize: 13,
        fontWeight: 700,
        color: ui.colors.text,
    };

    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        setOk("");

        if (!newPin || newPin.length < 4) return setError("New PIN must be at least 4 characters.");
        if (newPin !== confirm) return setError("New PIN and confirmation do not match.");

        setSaving(true);
        try {
            const { data: userData, error: userErr } = await supabase.auth.getUser();
            if (userErr || !userData?.user) throw new Error("Not signed in.");

            const userId = userData.user.id;

            const { data: prof, error: profErr } = await supabase
                .from("staff_profiles")
                .select("username")
                .eq("user_id", userId)
                .single();

            if (profErr || !prof?.username) throw new Error("Could not find your staff profile username.");

            const email = usernameToEmail(prof.username);

            const { error: reauthErr } = await supabase.auth.signInWithPassword({
                email,
                password: currentPin,
            });
            if (reauthErr) throw new Error("Current PIN is incorrect.");

            const { error: updErr } = await supabase.auth.updateUser({ password: newPin });
            if (updErr) throw new Error(updErr.message);

            setOk("PIN updated.");
            setCurrentPin("");
            setNewPin("");
            setConfirm("");

            setTimeout(() => nav("/"), 600);
        } catch (e2) {
            setError(String(e2.message || e2));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <div>
                    <h2 style={{ margin: 0 }}>Change PIN</h2>
                    <div style={{ marginTop: 6, fontSize: 12, color: ui.colors.muted }}>
                        Update your login PIN for the staff chat system.
                    </div>
                </div>

                <Link to="/" style={{ fontSize: 13, color: ui.colors.muted, textDecoration: "none" }}>
                    ← Inbox
                </Link>
            </div>

            {(error || ok) && (
                <div
                    style={{
                        marginTop: 14,
                        padding: 12,
                        borderRadius: 12,
                        border: `1px solid ${ui.colors.border}`,
                        background: error ? "#ffe6e6" : "#e9f8ee",
                        color: ui.colors.text,
                    }}
                >
                    <div style={{ fontWeight: 800, color: error ? ui.colors.danger : "#166534" }}>
                        {error ? "Couldn’t update PIN" : "Success"}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
                        {error || ok}
                    </div>
                </div>
            )}

            <form onSubmit={onSubmit} autoComplete="off" style={{ marginTop: 14, maxWidth: 520 }}>
                <label htmlFor="currentPin" style={labelStyle}>Current PIN</label>
                <PinInput
                    ui={ui}
                    id="currentPin"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value)}
                    show={showCurrent}
                    setShow={setShowCurrent}
                    autoComplete="current-password"
                />

                <label htmlFor="newPin" style={labelStyle}>New PIN</label>
                <PinInput
                    ui={ui}
                    id="newPin"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    show={showNew}
                    setShow={setShowNew}
                    autoComplete="new-password"
                />

                <label htmlFor="confirmPin" style={labelStyle}>Confirm new PIN</label>
                <PinInput
                    ui={ui}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    show={showConfirm}
                    setShow={setShowConfirm}
                    autoComplete="new-password"
                />

                <button
                    disabled={saving}
                    style={{
                        marginTop: 16,
                        padding: "10px 12px",
                        width: "100%",
                        borderRadius: 12,
                        border: `1px solid ${ui.colors.border}`,
                        background: ui.colors.cardBg,
                        cursor: saving ? "not-allowed" : "pointer",
                        fontWeight: 800,
                        color: ui.colors.text,
                    }}
                >
                    {saving ? "Updating…" : "Update PIN"}
                </button>

                <div style={{ marginTop: 10, fontSize: 12, color: ui.colors.muted }}>
                    Tip: use at least 4 characters. Longer is better.
                </div>
            </form>
        </div>
    );
}
