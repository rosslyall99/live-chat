import React from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@staff.slanj`;
}

export default function Login() {
    const nav = useNavigate();

    const [staff, setStaff] = React.useState([]);
    const [selectedUsername, setSelectedUsername] = React.useState("");
    const [pin, setPin] = React.useState("");
    const [error, setError] = React.useState("");
    const [loadingStaff, setLoadingStaff] = React.useState(true);
    const [loadingLogin, setLoadingLogin] = React.useState(false);

    // Load active staff profiles (correct place: useEffect inside component)
    React.useEffect(() => {
        (async () => {
            setError("");
            setLoadingStaff(true);

            const { data, error } = await supabase
                .from("staff_login_list")
                .select("username, display_name")
                .order("display_name", { ascending: true });

            if (error) {
                console.error(error);
                setError("Could not load staff list.");
                setStaff([]);
            } else {
                setStaff(data || []);
            }

            setLoadingStaff(false);
        })();
    }, []);

    async function onSubmit(e) {
        e.preventDefault();
        setError("");
        setLoadingLogin(true);

        if (!selectedUsername) {
            setError("Please select your name.");
            setLoadingLogin(false);
            return;
        }

        const email = usernameToEmail(selectedUsername);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: pin,
        });

        setLoadingLogin(false);

        if (error) {
            setError("Invalid PIN or password.");
            return;
        }

        nav("/");
    }

    return (
        <div style={{ maxWidth: 420, margin: "40px auto", padding: 16, color: "#111" }}>
            <h2>Slanj Staff Login</h2>

            {loadingStaff ? (
                <div style={{ marginTop: 12, opacity: 0.8 }}>Loading staff list…</div>
            ) : (
                <form onSubmit={onSubmit}>
                    <label style={{ display: "block", marginTop: 12 }}>
                        Your name
                        <select
                            value={selectedUsername}
                            onChange={(e) => setSelectedUsername(e.target.value)}
                            style={{ width: "100%", padding: 10, marginTop: 6 }}
                        >
                            <option value="">Select…</option>
                            {staff.map((s) => (
                                <option key={s.username} value={s.username}>
                                    {s.display_name || s.username}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label style={{ display: "block", marginTop: 12 }}>
                        PIN / Password
                        <input
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            type="password"
                            placeholder="••••••"
                            style={{ width: "100%", padding: 10, marginTop: 6 }}
                            autoComplete="current-password"
                        />
                    </label>

                    {error && <div style={{ marginTop: 12, color: "crimson" }}>{error}</div>}

                    <button
                        disabled={loadingLogin}
                        style={{ marginTop: 16, padding: 10, width: "100%" }}
                    >
                        {loadingLogin ? "Signing in…" : "Sign in"}
                    </button>
                </form>
            )}
        </div>
    );
}
