import React from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhilLogo from "../images/logoTransparent.png";
import { invokeAuthed } from "../lib/invokeAuthed";

const LOGIN_BACKGROUND_URL = "/backgrounds/hub-login-bg.png";
const LAST_BRANCH_KEY = "hub:lastBranch";
const BRANCHES = ["St Enoch", "Duke Street", "Hire", "Office"];
const BRANCH_FIELDS = [
  "login_branch",
  "site",
  "site_id",
  "site_name",
  "branch",
  "location",
  "default_site",
  "rota_branch",
];
const BRANCH_ALIASES = {
  "St Enoch": ["sten", "ste", "stenoch", "stenochs", "st enoch", "st enochs"],
  "Duke Street": ["duke", "duk", "duke street"],
  Hire: ["hire"],
  Office: ["office", "off"],
};

function logLogin(step, details) {
  console.debug(`[auth][login] ${step}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@staff.slanj`;
}

function getSafeRedirectTarget(rawValue) {
  const fallback = "/rota";
  if (!rawValue) return fallback;

  const value = String(rawValue).trim();
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;

  return value;
}

function normaliseText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getStaffBranchValue(row) {
  for (const field of BRANCH_FIELDS) {
    if (row?.[field]) return row[field];
  }

  return "";
}

function branchMatchesStaffValue(branch, value) {
  const normalizedValue = normaliseText(value);
  const aliases = BRANCH_ALIASES[branch] || [branch];

  return aliases.some((alias) => normaliseText(alias) === normalizedValue);
}

function getUsernamePrefixBranchValue(row) {
  const username = String(row?.username || "")
    .trim()
    .toLowerCase();
  if (!username) return "";

  // Temporary compatibility fallback only. Login grouping should come from
  // staff_login_list.site_id/login_branch once the deployed view exposes it.
  if (username.startsWith("stenoch-") || username.startsWith("sten-"))
    return "sten";
  if (username.startsWith("duke-")) return "duke";
  if (username.startsWith("hire-")) return "hire";
  if (username.startsWith("office-") || username.startsWith("off-"))
    return "office";

  return "";
}

function getStaffBranchValueWithFallback(row) {
  return getStaffBranchValue(row) || getUsernamePrefixBranchValue(row);
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function EyeOpenIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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

function ChevronIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackspaceIcon({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 5H9l-6 7 6 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m12 9 6 6m0-6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoginQuoteTerminal() {
  const quote = "Measure twice, promise once.";
  const fullText = `> "${quote}"`;
  const [typedText, setTypedText] = React.useState("");

  React.useEffect(() => {
    setTypedText("");
    let index = 0;

    const timer = window.setInterval(() => {
      index += 1;
      setTypedText(fullText.slice(0, index));

      if (index >= fullText.length) {
        window.clearInterval(timer);
      }
    }, 34);

    return () => window.clearInterval(timer);
  }, [fullText]);

  return (
    <section className="hub-quote-terminal" aria-label="Daily quote">
      <div className="hub-quote-terminal__text">
        <span>
          {typedText}
          <span className="hub-quote-terminal__cursor">█</span>
        </span>
      </div>
    </section>
  );
}

export default function Login() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = React.useMemo(
    () => getSafeRedirectTarget(searchParams.get("redirect")),
    [searchParams],
  );

  const [staff, setStaff] = React.useState([]);
  const [selectedBranch, setSelectedBranch] = React.useState(() => {
    try {
      return localStorage.getItem(LAST_BRANCH_KEY) || "";
    } catch {
      return "";
    }
  });
  const [selectedUsername, setSelectedUsername] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [showPin, setShowPin] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loadingStaff, setLoadingStaff] = React.useState(true);
  const [loadingLogin, setLoadingLogin] = React.useState(false);
  const [checkingSession, setCheckingSession] = React.useState(true);
  const pinInputRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setError("");
      setLoadingStaff(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionData?.session) {
        logLogin("mount:session-present", {
          userId: sessionData.session.user?.id,
          email: sessionData.session.user?.email,
          redirectTarget,
        });
        nav(redirectTarget, { replace: true });
        return;
      }

      setCheckingSession(false);
      logLogin("mount:load-staff-list");

      const { data, error } = await supabase
        .from("staff_login_list")
        .select("*")
        .order("display_name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error(error);
        setError("Could not load staff list.");
        setStaff([]);
      } else {
        setStaff(data || []);
      }

      setLoadingStaff(false);
    })();

    return () => {
      cancelled = true;
      logLogin("unmount");
    };
  }, [nav, redirectTarget]);

  React.useEffect(() => {
    if (selectedBranch && selectedUsername) {
      pinInputRef.current?.focus();
    }
  }, [selectedBranch, selectedUsername]);

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
    logLogin("submit:start", { selectedUsername, email });

    try {
      // Supabase stores auth state under these keys (project-specific key may vary)
      // Clearing it fixes "403 /auth/v1/user" after login due to corrupted persisted state.
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("sb-") && k.includes("-auth-token"))
          localStorage.removeItem(k);
      }
      localStorage.removeItem("crm:session_nonce");
    } catch {}

    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });

    if (error) {
      logLogin("submit:error", { selectedUsername, message: error.message });
      setLoadingLogin(false);
      setError("Invalid PIN or password.");
      return;
    }

    const sessionResult = await supabase.auth.getSession();
    const signedInSession =
      signInData?.session ?? sessionResult.data.session ?? null;

    logLogin("submit:signed-in", {
      selectedUsername,
      hasSession: !!signedInSession,
      userId: signedInSession?.user?.id,
      email: signedInSession?.user?.email,
    });

    if (!signedInSession) {
      setLoadingLogin(false);
      setError(
        "Login completed but no session was available. Please try again.",
      );
      return;
    }

    try {
      const now = Date.now();
      localStorage.setItem("crm:lastActivityAt", String(now));
      localStorage.setItem("crm:lastClosedAt", String(now));
      sessionStorage.setItem("crm:startupChecked", "1");
    } catch {}

    // NEW: stamp this as the newest active session
    try {
      const { data: touchData } = await invokeAuthed("auth_touch_session", {});
      if (touchData?.session_nonce) {
        localStorage.setItem("crm:session_nonce", touchData.session_nonce);
      }
      logLogin("submit:session-touched", {
        selectedUsername,
        hasNonce: !!touchData?.session_nonce,
      });
    } catch (touchErr) {
      logLogin("submit:session-touch-failed", {
        selectedUsername,
        message: touchErr?.message || String(touchErr),
      });
      // non-fatal: if this fails, login still succeeds
    }

    setLoadingLogin(false);
    logLogin("submit:navigate", { to: redirectTarget, selectedUsername });
    nav(redirectTarget, { replace: true });
  }

  function selectBranch(branch) {
    setSelectedBranch(branch);
    setSelectedUsername("");
    setPin("");
    setError("");

    try {
      localStorage.setItem(LAST_BRANCH_KEY, branch);
    } catch {}
  }

  function changeBranch() {
    setSelectedBranch("");
    setSelectedUsername("");
    setPin("");
    setError("");
  }

  function selectStaff(username) {
    setSelectedUsername(username);
    setPin("");
    setError("");
  }

  function appendPinDigit(digit) {
    if (loadingLogin) return;
    setPin((current) => `${current}${digit}`);
  }

  function removePinDigit() {
    if (loadingLogin) return;
    setPin((current) => current.slice(0, -1));
  }

  function submitPin() {
    const form = document.getElementById("hub-login-form");
    if (form?.requestSubmit) {
      form.requestSubmit();
    }
  }

  function choiceHover(disabled = false) {
    return {
      onMouseEnter: (e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.background = "rgba(255,255,255,0.13)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.24)";
      },
      onMouseLeave: (e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.background = "rgba(255,255,255,0.08)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
      },
    };
  }

  function cardHover(disabled = false) {
    return {
      onMouseEnter: (e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.background = "rgba(255,255,255,0.1)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
        e.currentTarget.style.boxShadow = "0 12px 28px rgba(0,0,0,0.16)";
      },
      onMouseLeave: (e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        e.currentTarget.style.boxShadow = "none";
      },
    };
  }

  const hasDatabaseBranchField = staff.some((row) => getStaffBranchValue(row));
  const hasKnownDatabaseBranchMatch = staff.some((row) =>
    BRANCHES.some((branch) =>
      branchMatchesStaffValue(branch, getStaffBranchValue(row)),
    ),
  );
  const hasKnownBranchMatch = staff.some((row) =>
    BRANCHES.some((branch) =>
      branchMatchesStaffValue(branch, getStaffBranchValueWithFallback(row)),
    ),
  );
  const filteredStaff =
    selectedBranch && hasKnownBranchMatch
      ? staff.filter((row) =>
          branchMatchesStaffValue(
            selectedBranch,
            getStaffBranchValueWithFallback(row),
          ),
        )
      : staff;
  const selectedStaff = staff.find((s) => s.username === selectedUsername);
  const currentStep = !selectedBranch
    ? "branch"
    : selectedUsername
      ? "pin"
      : "staff";
  const focusRing = "0 0 0 3px rgba(48,199,204,0.22)";

  React.useEffect(() => {
    if (!loadingStaff && staff.length && !hasKnownBranchMatch) {
      console.warn(
        hasDatabaseBranchField
          ? "[auth][login] staff_login_list branch/site values do not match known HUB branches; showing all staff."
          : "[auth][login] staff_login_list is missing usable branch/site values and no username-prefix fallback matched; showing all staff until the view exposes site_id/login_branch.",
      );
    }
  }, [hasDatabaseBranchField, hasKnownBranchMatch, loadingStaff, staff.length]);

  React.useEffect(() => {
    if (!loadingStaff && staff.length && !hasKnownDatabaseBranchMatch) {
      console.warn(
        "[auth][login] Using temporary username-prefix fallback for branch grouping. staff_login_list should expose real site_id/login_branch.",
      );
    }
  }, [hasKnownDatabaseBranchMatch, loadingStaff, staff.length]);

  const S = {
    page: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: 16,
      boxSizing: "border-box",
      backgroundColor: "#05070d",
      backgroundImage: `linear-gradient(90deg, rgba(5,7,13,0.34), rgba(5,7,13,0.74)), url("${LOGIN_BACKGROUND_URL}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      color: "#f8fafc",
    },
    panel: {
      width: "100%",
      maxWidth: 460,
      height: "calc(100vh - 32px)",
      overflowY: "auto",
      background: "rgba(5, 10, 20, 0.82)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 28,
      boxShadow: "0 26px 80px rgba(0,0,0,0.34)",
      backdropFilter: "blur(18px)",
      WebkitBackdropFilter: "blur(18px)",
      padding: "34px 30px",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: 24,
    },
    logo: {
      display: "block",
      width: 220,
      maxWidth: "72%",
      height: "auto",
      margin: "2px auto 14px",
      userSelect: "none",
      WebkitUserSelect: "none",
    },
    form: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 20,
      flex: 1,
    },
    label: {
      display: "block",
      fontSize: 12,
      fontWeight: 400,
      color: "rgba(226,232,240,0.78)",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    },
    fieldWrap: {
      width: "100%",
      marginTop: 8,
      position: "relative",
    },
    inputBase: {
      width: "100%",
      boxSizing: "border-box",
      padding: "15px 48px 15px 16px",
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.08)",
      color: "#f8fafc",
      outline: "none",
      fontSize: 20,
      fontWeight: 400,
      lineHeight: "26px",
      transition: "border-color 140ms ease, box-shadow 140ms ease",
    },
    stepContent: {
      display: "flex",
      flexDirection: "column",
      gap: 16,
      flex: 1,
      minHeight: 0,
      animation: "hubStepIn 220ms ease both",
    },
    choiceList: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
    },
    choiceButton: {
      width: "100%",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 24,
      padding: "22px 20px",
      fontWeight: 400,
      fontSize: 17,
      cursor: loadingLogin ? "not-allowed" : "pointer",
      background: "rgba(255,255,255,0.08)",
      color: "#f8fafc",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      textAlign: "left",
      transition:
        "transform 120ms ease, border-color 120ms ease, background 120ms ease",
      opacity: loadingLogin ? 0.8 : 1,
    },
    staffGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 12,
    },
    staffCard: {
      minWidth: 0,
      minHeight: 112,
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 20,
      padding: "13px 10px",
      background: "rgba(255,255,255,0.06)",
      color: "#f8fafc",
      cursor: loadingLogin ? "not-allowed" : "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      transition:
        "transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease",
    },
    staffButtonMain: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      minWidth: 0,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: "20%",
      flex: "0 0 auto",
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(135deg, #30c7cc, #7c3aed)",
      color: "#ffffff",
      fontSize: 14,
      fontWeight: 400,
      boxShadow: "0 10px 22px rgba(48,199,204,0.18)",
    },
    staffName: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "normal",
      textAlign: "center",
      fontSize: 14,
      lineHeight: 1.25,
      fontWeight: 400,
    },
    backButton: {
      alignSelf: "flex-start",
      border: "1px solid rgba(48,199,204,0.36)",
      borderRadius: 8,
      padding: "9px 13px",
      background: "rgba(5, 12, 24, 0.76)",
      color: "rgba(210,245,248,0.88)",
      fontSize: 12,
      fontWeight: 400,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      cursor: "pointer",
      boxShadow: "0 0 18px rgba(48,199,204,0.08)",
      transition:
        "transform 120ms ease, border-color 120ms ease, background 120ms ease, color 120ms ease",
    },
    submitButton: {
      width: "100%",
      border: "1px solid rgba(48,199,204,0.45)",
      borderRadius: 10,
      padding: "14px 16px",
      background:
        "linear-gradient(135deg, rgba(48,199,204,0.26), rgba(124,58,237,0.22))",
      color: "#ffffff",
      fontSize: 13,
      fontWeight: 400,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      cursor: loadingLogin ? "not-allowed" : "pointer",
      boxShadow: "0 18px 40px rgba(48,199,204,0.14)",
      opacity: loadingLogin ? 0.72 : 1,
      transition:
        "transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease",
    },
    pinFooterRow: {
      display: "flex",
      justifyContent: "flex-start",
      marginTop: "auto",
    },
    selectedSummary: {
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 20,
      padding: "13px 14px",
      background: "rgba(255,255,255,0.06)",
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
    numberPad: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 14,
      justifyItems: "center",
    },
    padButton: {
      width: "clamp(62px, 17vw, 76px)",
      height: "clamp(62px, 17vw, 76px)",
      borderRadius: "50%",
      border: "1px solid rgba(255,255,255,0.1)",
      background: "rgba(255,255,255,0.06)",
      color: "#ffffff",
      fontSize: 23,
      fontWeight: 400,
      cursor: loadingLogin ? "not-allowed" : "pointer",
      display: "grid",
      placeItems: "center",
      transition:
        "transform 120ms ease, background 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
    },
    submitPadButton: {
      background: "rgba(48,199,204,0.24)",
      borderColor: "rgba(48,199,204,0.34)",
      boxShadow: "0 14px 32px rgba(48,199,204,0.16)",
    },
    eyeBtn: {
      position: "absolute",
      right: 10,
      top: "50%",
      transform: "translateY(-50%)",
      border: "none",
      background: "transparent",
      padding: 6,
      borderRadius: 10,
      cursor: "pointer",
      color: "rgba(226,232,240,0.64)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 120ms ease, color 120ms ease",
    },
    loadingLine: {
      fontSize: 13,
      fontWeight: 400,
      color: "rgba(226,232,240,0.72)",
      textAlign: "center",
      width: "100%",
    },
    error: {
      borderRadius: 18,
      border: "1px solid rgba(239,68,68,0.35)",
      background: "rgba(239,68,68,0.12)",
      color: "#fee2e2",
      padding: "10px 12px",
      fontSize: 13,
      fontWeight: 400,
      lineHeight: 1.35,
    },
  };

  return (
    <div className="hub-login-page" style={S.page}>
      <style>{`
        @keyframes hubStepIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

.hub-quote-terminal {
  position: fixed;
  left: clamp(24px, 6vw, 104px);
  right: calc(clamp(24px, 6vw, 104px) + 430px);
  bottom: clamp(22px, 5vh, 58px);
  width: auto;
  min-height: 118px;

  border: 1px solid rgba(56, 189, 248, 0.34);
  background: rgba(4, 12, 24, 0.38);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow:
    inset 0 0 26px rgba(56, 189, 248, 0.06),
    0 0 34px rgba(56, 189, 248, 0.12);
  overflow: hidden;
  pointer-events: none;
}

.hub-quote-terminal::before {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    180deg,
    rgba(56, 189, 248, 0.04) 0,
    rgba(56, 189, 248, 0.04) 1px,
    transparent 1px,
    transparent 5px
  );
  opacity: 0.72;
  pointer-events: none;
}

.hub-quote-terminal__text {
  position: relative;
  z-index: 1;
  height: 118px;
  padding: 20px 24px;
  box-sizing: border-box;
  display: flex;
  align-items: flex-end;
  color: rgba(125, 211, 252, 0.96);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: clamp(15px, 1.25vw, 20px);
  font-weight: 400;
  line-height: 1.55;
  letter-spacing: 0.035em;
  text-shadow: 0 0 14px rgba(56, 189, 248, 0.32);
  white-space: pre-wrap;
}

.hub-quote-terminal__cursor {
  display: inline-block;
  margin-left: 3px;
  color: rgba(96, 165, 250, 0.95);
  animation: hubTerminalCursor 900ms steps(2, start) infinite;
}

@keyframes hubTerminalCursor {
  0%, 42% { opacity: 1; }
  43%, 100% { opacity: 0; }
}

        @media (max-width: 720px) {
          .hub-login-page {
            justify-content: center !important;
            padding: 10px !important;
          }

          .hub-login-panel {
            max-width: none !important;
            height: calc(100vh - 20px) !important;
            padding: 28px 20px !important;
            border-radius: 24px !important;
          }

          .hub-staff-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          .hub-quote-terminal {
  display: none;
}
        }

        .hub-login-panel input::placeholder {
          color: rgba(226,232,240,0.38);
        }

        .hub-pad-button:hover,
        .hub-pad-button:focus-visible {
          background: rgba(255,255,255,0.1) !important;
          border-color: rgba(48,199,204,0.28) !important;
          box-shadow: 0 0 0 3px rgba(48,199,204,0.13) !important;
          transform: translateY(-1px);
        }
      `}</style>
      <LoginQuoteTerminal />

      <div className="hub-login-panel" style={S.panel}>
        <img src={PhilLogo} alt="Slanj" style={S.logo} draggable={false} />

        {checkingSession || loadingStaff ? (
          <div style={S.loadingLine}>
            {checkingSession ? "Checking session..." : "Loading staff list..."}
          </div>
        ) : (
          <form id="hub-login-form" onSubmit={onSubmit} style={S.form}>
            {currentStep === "branch" ? (
              <div style={S.stepContent}>
                <div style={S.choiceList}>
                  {BRANCHES.map((branch) => (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => selectBranch(branch)}
                      style={S.choiceButton}
                      {...choiceHover(false)}
                    >
                      <span>{branch}</span>
                      <ChevronIcon />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {currentStep === "staff" ? (
              <div style={S.stepContent}>
                {/* Temporary fallback: username prefixes are used only if staff_login_list does not expose populated site_id/login_branch yet. */}
                <div className="hub-staff-grid" style={S.staffGrid}>
                  {filteredStaff.map((s) => {
                    const displayName = s.display_name || s.username;

                    return (
                      <button
                        key={s.username}
                        type="button"
                        onClick={() => selectStaff(s.username)}
                        style={S.staffCard}
                        {...cardHover(false)}
                      >
                        <span style={S.avatar}>{getInitials(displayName)}</span>
                        <span style={S.staffName}>{displayName}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={changeBranch}
                  style={{ ...S.backButton, marginTop: "auto" }}
                >
                  ← Back
                </button>
              </div>
            ) : null}

            {currentStep === "pin" ? (
              <div style={S.stepContent}>
                <div style={S.selectedSummary}>
                  <span style={S.avatar}>
                    {getInitials(
                      selectedStaff?.display_name || selectedUsername,
                    )}
                  </span>
                  <span style={S.staffName}>
                    {selectedStaff?.display_name || selectedUsername}
                  </span>
                </div>

                <label style={S.label}>
                  PIN
                  <div style={S.fieldWrap}>
                    <input
                      ref={pinInputRef}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      type={showPin ? "text" : "password"}
                      placeholder="PIN"
                      style={S.inputBase}
                      disabled={loadingLogin}
                      autoComplete="new-password"
                      name="hub-pin-entry"
                      inputMode="numeric"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "#30c7cc";
                        e.currentTarget.style.boxShadow = focusRing;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor =
                          "rgba(255,255,255,0.14)";
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
                          e.currentTarget.style.color = "#ffffff";
                          e.currentTarget.style.background =
                            "rgba(255,255,255,0.08)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color =
                            "rgba(226,232,240,0.64)";
                          e.currentTarget.style.background = "transparent";
                        }}
                        disabled={loadingLogin}
                      >
                        {showPin ? <EyeOpenIcon /> : <EyeClosedIcon />}
                      </button>
                    ) : null}
                  </div>
                </label>

                <button
                  type="submit"
                  style={S.submitButton}
                  disabled={loadingLogin}
                  onMouseEnter={(e) => {
                    if (loadingLogin) return;
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.borderColor = "rgba(132,91,255,0.72)";
                    e.currentTarget.style.boxShadow =
                      "0 18px 42px rgba(124,58,237,0.18)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.borderColor = "rgba(48,199,204,0.45)";
                    e.currentTarget.style.boxShadow =
                      "0 18px 40px rgba(48,199,204,0.14)";
                  }}
                >
                  Sign in
                </button>

                <div style={S.pinFooterRow}>
                  <button
                    type="button"
                    onClick={() => setSelectedUsername("")}
                    style={S.backButton}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.borderColor =
                        "rgba(132,91,255,0.7)";
                      e.currentTarget.style.background = "rgba(22,18,42,0.86)";
                      e.currentTarget.style.color = "#ffffff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor =
                        "rgba(48,199,204,0.36)";
                      e.currentTarget.style.background = "rgba(5,12,24,0.76)";
                      e.currentTarget.style.color = "rgba(210,245,248,0.88)";
                    }}
                  >
                    ← Back
                  </button>
                </div>
              </div>
            ) : null}

            {error ? <div style={S.error}>{error}</div> : null}
            {loadingLogin ? (
              <div style={S.loadingLine}>Signing in...</div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
