import React from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { ui } from "../ui/tokens";
import PhilLogo from "../images/PHiL2.png";


function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@staff.slanj`;
}

export default function Login() {
    const nav = useNavigate();

    const [staff, setStaff] = React.useState([]);
    const [selectedUsername, setSelectedUsername] = React.useState("");
    const [pin, setPin] = React.useState("");
    const [showPin, setShowPin] = React.useState(false);
    const [error, setError] = React.useState("");
    const [loadingStaff, setLoadingStaff] = React.useState(true);
    const [loadingLogin, setLoadingLogin] = React.useState(false);

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

        if (!pin) {
            setError("Please enter your PIN.");
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

    const S = {
        page: {
            minHeight: "90vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: ui.colors.pageBg,
            fontFamily: ui.font.ui,
            color: ui.colors.text,
        },
        card: {
            width: "100%",
            maxWidth: 420,
            background: ui.colors.cardBg,
            border: `1px solid ${ui.colors.border}`,
            borderRadius: ui.radius.lg,
            boxShadow: ui.shadow.card,
            padding: 36,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
        },
        logo: {
            display: "block",
            width: 300,
            maxWidth: "70%",
            height: "auto",
            marginTop: 2,
            marginBottom: 2,
            userSelect: "none",
            WebkitUserSelect: "none",
        },
        title: {
            margin: 0,
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "-0.01em",
            textAlign: "center",
        },
        subtitle: {
            margin: 0,
            marginTop: -8,
            fontSize: 13,
            color: ui.colors.muted,
            textAlign: "center",
            lineHeight: 1.35,
        },
        form: {
            width: "100%",
            marginTop: 6,
        },
        label: {
            display: "block",
            marginTop: 12,
            fontSize: 12,
            fontWeight: 700,
            color: ui.colors.text,
        },
        fieldWrap: {
            width: "100%",
            marginTop: 6,
            position: "relative",
        },
        inputBase: {
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            borderRadius: ui.radius.md,
            border: `1px solid ${ui.colors.border}`,
            background: "#fff",
            color: ui.colors.text,
            outline: "none",
            fontSize: 14,
            lineHeight: "20px",
            transition: "border-color 140ms ease, box-shadow 140ms ease",
        },
        inputWithIcon: {
            paddingRight: 44,
        },
        helpRow: {
            marginTop: 8,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            fontSize: 12,
            color: ui.colors.muted,
        },
        error: {
            marginTop: 12,
            borderRadius: ui.radius.md,
            border: `1px solid rgba(239,68,68,0.35)`,
            background: "rgba(239,68,68,0.08)",
            color: ui.colors.text,
            padding: "10px 12px",
            fontSize: 13,
            lineHeight: 1.35,
        },
        buttonRow: {
            marginTop: 16,
        },
        button: {
            width: "100%",
            border: "none",
            borderRadius: ui.radius.md,
            padding: "14px 14px",
            marginBottom: "24px",
            fontWeight: 800,
            fontSize: 14,
            cursor: loadingLogin ? "not-allowed" : "pointer",
            background: ui.colors.brand,
            color: "#fff",
            boxShadow: "0 10px 22px rgba(168,85,247,0.25)",
            transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
            opacity: loadingLogin ? 0.8 : 1,
        },
        eyeBtn: {
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "transparent",
            padding: 6,
            borderRadius: ui.radius.sm,
            cursor: "pointer",
            color: ui.colors.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 120ms ease, color 120ms ease",
        },
        loadingLine: {
            marginTop: 8,
            fontSize: 13,
            color: ui.colors.muted,
            textAlign: "center",
            width: "100%",
        },
    };

    function EyeOpenIcon({ size = 18 }) {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                    d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                />
                <path
                    d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                />
            </svg>
        );
    }

    function EyeClosedIcon({ size = 18 }) {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                    d="M3 12s3.5-7 9-7c2.1 0 4 .7 5.6 1.8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                />
                <path
                    d="M21 12s-3.5 7-9 7c-2.1 0-4-.7-5.6-1.8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                />
                <path
                    d="M9.9 9.9a3.5 3.5 0 0 0 4.2 4.2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                />
                <path
                    d="M4 20 20 4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                />
            </svg>
        );
    }

    const focusRing = `0 0 0 3px ${ui.colors.brandSoft}`;

    return (
        <div style={S.page}>
            <div style={S.card}>
                <img
                    src={PhilLogo}
                    alt="Slanj"
                    style={S.logo}
                    draggable={false}
                />

                {loadingStaff ? (
                    <div style={S.loadingLine}>Loading staff list…</div>
                ) : (
                    <form onSubmit={onSubmit} style={S.form}>
                        <label style={S.label}>
                            Select User
                            <div style={S.fieldWrap}>
                                <select
                                    value={selectedUsername}
                                    onChange={(e) => setSelectedUsername(e.target.value)}
                                    disabled={loadingLogin}
                                    style={S.inputBase}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = ui.colors.brand;
                                        e.currentTarget.style.boxShadow = focusRing;
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = ui.colors.border;
                                        e.currentTarget.style.boxShadow = "none";
                                    }}
                                >
                                    <option value="">Select…</option>
                                    {staff.map((s) => (
                                        <option key={s.username} value={s.username}>
                                            {s.display_name || s.username}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </label>

                        <label style={S.label}>
                            PIN
                            <div style={S.fieldWrap}>
                                <input
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    type={showPin ? "text" : "password"}
                                    placeholder="••••••"
                                    style={{
                                        ...S.inputBase,
                                        ...(pin ? S.inputWithIcon : null),
                                    }}
                                    disabled={loadingLogin}
                                    autoComplete="current-password"
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = ui.colors.brand;
                                        e.currentTarget.style.boxShadow = focusRing;
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = ui.colors.border;
                                        e.currentTarget.style.boxShadow = "none";
                                    }}
                                />

                                {pin ? (
                                    <button
                                        type="button"
                                        aria-label={showPin ? "Hide PIN" : "Show PIN"}
                                        onClick={() => setShowPin((s) => !s)}
                                        style={S.eyeBtn}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.color = ui.colors.text;
                                            e.currentTarget.style.background = "rgba(2, 6, 23, 0.05)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.color = ui.colors.muted;
                                            e.currentTarget.style.background = "transparent";
                                        }}
                                        disabled={loadingLogin}
                                    >
                                        {showPin ? <EyeOpenIcon /> : <EyeClosedIcon />}
                                    </button>
                                ) : null}
                            </div>
                        </label>

                        {error ? <div style={S.error}>{error}</div> : null}

                        <div style={S.buttonRow}>
                            <button
                                disabled={loadingLogin}
                                style={S.button}
                                onMouseEnter={(e) => {
                                    if (loadingLogin) return;
                                    e.currentTarget.style.transform = "translateY(-1px)";
                                    e.currentTarget.style.boxShadow = "0 14px 28px rgba(168,85,247,0.28)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "translateY(0)";
                                    e.currentTarget.style.boxShadow = "0 10px 22px rgba(168,85,247,0.25)";
                                }}
                            >
                                {loadingLogin ? "Signing in…" : "Sign in"}
                            </button>
                        </div>

                        <div style={S.helpRow}>
                            <span>Having trouble?</span>
                            <span>Ask an admin to reset your PIN.</span>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
