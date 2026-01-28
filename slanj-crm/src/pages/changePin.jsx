import React from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";

function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@staff.slanj`;
}

export default function ChangePin() {
    const nav = useNavigate();
    const [currentPin, setCurrentPin] = React.useState("");
    const [newPin, setNewPin] = React.useState("");
    const [confirm, setConfirm] = React.useState("");
    const [error, setError] = React.useState("");
    const [ok, setOk] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        setOk("");

        if (!newPin || newPin.length < 4) return setError("New PIN must be at least 4 characters.");
        if (newPin !== confirm) return setError("New PIN and confirmation do not match.");

        setSaving(true);
        try {
            // Get current user + derive their login email from staff_profiles.username
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

            // Re-auth (prove current PIN)
            const { error: reauthErr } = await supabase.auth.signInWithPassword({
                email,
                password: currentPin,
            });

            if (reauthErr) throw new Error("Current PIN is incorrect.");

            // Update password
            const { error: updErr } = await supabase.auth.updateUser({ password: newPin });
            if (updErr) throw new Error(updErr.message);

            setOk("PIN updated.");
            setCurrentPin("");
            setNewPin("");
            setConfirm("");

            // Optional: send them back to inbox
            setTimeout(() => nav("/"), 600);
        } catch (e) {
            setError(String(e.message || e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{ maxWidth: 520, margin: "20px auto", padding: 16, color: "#111" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h2>Change PIN</h2>
                <Link to="/">← Inbox</Link>
            </div>

            <form onSubmit={onSubmit} autoComplete="off">
                <label style={{ display: "block", marginTop: 12 }}>
                    Current PIN
                    <input
                        value={currentPin}
                        onChange={(e) => setCurrentPin(e.target.value)}
                        type="password"
                        autoComplete="current-password"
                        style={{ width: "100%", padding: 10, marginTop: 6 }}
                    />
                </label>

                <label style={{ display: "block", marginTop: 12 }}>
                    New PIN
                    <input
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        type="password"
                        autoComplete="new-password"
                        style={{ width: "100%", padding: 10, marginTop: 6 }}
                    />
                </label>

                <label style={{ display: "block", marginTop: 12 }}>
                    Confirm new PIN
                    <input
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        type="password"
                        autoComplete="new-password"
                        style={{ width: "100%", padding: 10, marginTop: 6 }}
                    />
                </label>

                {error && <div style={{ marginTop: 12, color: "crimson" }}>{error}</div>}
                {ok && <div style={{ marginTop: 12, color: "green" }}>{ok}</div>}

                <button disabled={saving} style={{ marginTop: 16, padding: 10, width: "100%" }}>
                    {saving ? "Updating…" : "Update PIN"}
                </button>
            </form>
        </div>
    );
}
