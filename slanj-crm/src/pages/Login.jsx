import React from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@staff.slanj`;
}

export default function Login() {
    const nav = useNavigate();
    const [username, setUsername] = React.useState("");
    const [pin, setPin] = React.useState("");
    const [error, setError] = React.useState("");
    const [loading, setLoading] = React.useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);

        const email = usernameToEmail(username);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: pin,
        });

        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }

        nav("/");
    }

    return (
        <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
            <h2>Slanj Staff Login</h2>
            <form onSubmit={onSubmit}>
                <label style={{ display: "block", marginTop: 12 }}>
                    Username
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="duke-amy"
                        style={{ width: "100%", padding: 10, marginTop: 6 }}
                    />
                </label>

                <label style={{ display: "block", marginTop: 12 }}>
                    PIN / Password
                    <input
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        type="password"
                        placeholder="••••••"
                        style={{ width: "100%", padding: 10, marginTop: 6 }}
                    />
                </label>

                {error && (
                    <div style={{ marginTop: 12, color: "crimson" }}>{error}</div>
                )}

                <button
                    disabled={loading}
                    style={{ marginTop: 16, padding: 10, width: "100%" }}
                >
                    {loading ? "Signing in…" : "Sign in"}
                </button>
            </form>
        </div>
    );
}
