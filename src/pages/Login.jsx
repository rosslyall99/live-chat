import React from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";
import PhilLogo from "../images/logoTransparent.png";
import { invokeAuthed } from "../lib/invokeAuthed";
import "./Login.css";

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
const LOGIN_QUOTE_FALLBACK = {
  quote: "Measure twice, promise once.",
  author: "Slanj HUB",
  source: "fallback",
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
  const [quote, setQuote] = React.useState(LOGIN_QUOTE_FALLBACK.quote);
  const fullText = `> "${quote}"`;
  const [typedText, setTypedText] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    async function loadDailyQuote() {
      try {
        const { data, error } = await supabase.functions.invoke(
          "get-daily-login-quote",
          { body: {} },
        );

        if (error) throw error;

        const nextQuote = String(data?.quote || "").trim();
        if (!cancelled && nextQuote) {
          setQuote(nextQuote);
        }
      } catch (error) {
        console.warn("[auth][login] daily quote fallback", error);
        if (!cancelled) {
          setQuote(LOGIN_QUOTE_FALLBACK.quote);
        }
      }
    }

    loadDailyQuote();

    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <div className="hub-login-page">
      <LoginQuoteTerminal />

      <div className="hub-login-panel">
        <img
          src={PhilLogo}
          alt="Slanj"
          className="hub-login-logo"
          draggable={false}
        />

        {checkingSession || loadingStaff ? (
          <div className="hub-login-loading-line">
            {checkingSession ? "Checking session..." : "Loading staff list..."}
          </div>
        ) : (
          <form
            id="hub-login-form"
            onSubmit={onSubmit}
            className="hub-login-form"
          >
            {currentStep === "branch" ? (
              <div className="hub-login-step">
                <div className="hub-login-choice-list">
                  {BRANCHES.map((branch) => (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => selectBranch(branch)}
                      className="hub-login-choice-button"
                    >
                      <span>{branch}</span>
                      <ChevronIcon />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {currentStep === "staff" ? (
              <div className="hub-login-step">
                {/* Temporary fallback: username prefixes are used only if staff_login_list does not expose populated site_id/login_branch yet. */}
                <div className="hub-staff-grid">
                  {filteredStaff.map((s) => {
                    const displayName = s.display_name || s.username;

                    return (
                      <button
                        key={s.username}
                        type="button"
                        onClick={() => selectStaff(s.username)}
                        className="hub-staff-card"
                      >
                        <span className="hub-login-avatar">
                          {getInitials(displayName)}
                        </span>
                        <span className="hub-login-staff-name">
                          {displayName}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={changeBranch}
                  className="hub-login-back-button hub-login-back-button--bottom"
                >
                  ← Back
                </button>
              </div>
            ) : null}

            {currentStep === "pin" ? (
              <div className="hub-login-step">
                <div className="hub-login-selected-summary">
                  <span className="hub-login-avatar">
                    {getInitials(
                      selectedStaff?.display_name || selectedUsername,
                    )}
                  </span>
                  <span className="hub-login-staff-name">
                    {selectedStaff?.display_name || selectedUsername}
                  </span>
                </div>

                <label className="hub-login-label">
                  PIN
                  <div className="hub-login-field-wrap">
                    <input
                      ref={pinInputRef}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      type={showPin ? "text" : "password"}
                      placeholder="PIN"
                      className="hub-login-input"
                      disabled={loadingLogin}
                      autoComplete="new-password"
                      name="hub-pin-entry"
                      inputMode="numeric"
                    />

                    {pin ? (
                      <button
                        type="button"
                        aria-label={showPin ? "Hide PIN" : "Show PIN"}
                        onClick={() => setShowPin((s) => !s)}
                        className="hub-login-eye-button"
                        disabled={loadingLogin}
                      >
                        {showPin ? <EyeOpenIcon /> : <EyeClosedIcon />}
                      </button>
                    ) : null}
                  </div>
                </label>

                <button
                  type="submit"
                  className="hub-login-submit-button"
                  disabled={loadingLogin}
                >
                  Sign in
                </button>

                <div className="hub-login-pin-footer">
                  <button
                    type="button"
                    onClick={() => setSelectedUsername("")}
                    className="hub-login-back-button"
                  >
                    ← Back
                  </button>
                </div>
              </div>
            ) : null}

            {error ? <div className="hub-login-error">{error}</div> : null}
            {loadingLogin ? (
              <div className="hub-login-loading-line">Signing in...</div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
