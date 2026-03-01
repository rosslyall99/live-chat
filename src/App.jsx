import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

import Login from "./pages/Login.jsx";
import Inbox from "./pages/Inbox.jsx";
import Chat from "./pages/Chat.jsx";
import CannedRepliesAdmin from "./pages/CannedRepliesAdmin";
import UsersAdmin from "./pages/UsersAdmin";
import ChangePin from "./pages/ChangePin.jsx";
import AdminLive from "./pages/AdminLive";
import AdminInsights from "./pages/AdminInsights";
import Rota from "./pages/Rota";
import Shell from "./components/Shell";

/* -------------------- AUTH GUARD -------------------- */
function RequireAuth({ children }) {
  const [ready, setReady] = React.useState(false);
  const [session, setSession] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setReady(true);
    })();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      setSession(session);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

/* -------------------- MOBILE DETECT -------------------- */
function useIsMobile(breakpointPx = 900) {
  const get = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(`(max-width: ${breakpointPx}px)`).matches;

  const [isMobile, setIsMobile] = React.useState(get);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);

    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}

/* -------------------- MOBILE APP -------------------- */
/** Mobile should ONLY ever show /rota (no Shell). Everything else redirects to /rota. */
function MobileApp() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected */}
      <Route
        path="/rota"
        element={
          <RequireAuth>
            <Rota />
          </RequireAuth>
        }
      />

      {/* Mobile lock-down: nothing else reachable */}
      <Route path="*" element={<Navigate to="/rota" replace />} />
    </Routes>
  );
}

/* -------------------- DESKTOP APP -------------------- */
function DesktopApp() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected app (with Shell) */}
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        {/* Core */}
        <Route index element={<Rota />} />
        <Route path="rota" element={<Rota />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="chat/:id" element={<Chat />} />
        <Route path="change-pin" element={<ChangePin />} />

        {/* Admin */}
        <Route path="admin/canned" element={<CannedRepliesAdmin />} />
        <Route path="admin/users" element={<UsersAdmin />} />
        <Route path="admin/live" element={<AdminLive />} />
        <Route path="admin/insights" element={<AdminInsights />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/rota" replace />} />
    </Routes>
  );
}

/* -------------------- APP ROOT -------------------- */
export default function App() {
  const isMobile = useIsMobile(900); // adjust if you want (e.g. 820/780)
  return isMobile ? <MobileApp /> : <DesktopApp />;
}