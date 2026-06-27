import React from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { supabase } from "./supabaseClient";

import Login from "./pages/Login.jsx";
import Inbox from "./pages/Inbox.jsx";
import Chat from "./pages/Chat.jsx";
import CannedRepliesAdmin from "./pages/CannedRepliesAdmin";
import UsersAdmin from "./pages/UsersAdmin";
import ChangePin from "./pages/ChangePin.jsx";
import AdminLive from "./pages/AdminLive";
import AdminInsights from "./pages/AdminInsights";
import HubRota from "./pages/HubRota.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Prices from "./pages/Prices.jsx";
import PricesAdmin from "./pages/PricesAdmin.jsx";
import Appointments from "./pages/Appointments.jsx";
import AppointmentEmailTemplates from "./pages/AppointmentEmailTemplates.jsx";
import AppointmentCustomersAdmin from "./pages/AppointmentCustomersAdmin.jsx";
import AppointmentHoursAdmin from "./pages/AppointmentHoursAdmin.jsx";
import AppointmentTypesAdmin from "./pages/AppointmentTypesAdmin.jsx";
import Shell from "./components/Shell";
import StaffView from "./pages/StaffView.jsx";

function logAuthGuard(step, details) {
  console.debug(`[auth][guard] ${step}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

/* -------------------- AUTH GUARD -------------------- */
function RequireAuth({ children }) {
  const [ready, setReady] = React.useState(false);
  const [session, setSession] = React.useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    let mounted = true;
    let initialEventSeen = false;
    const hydratedRef = { current: false };
    logAuthGuard("mount");

    const finishHydration = (nextSession, source) => {
      if (!mounted || hydratedRef.current) return;
      hydratedRef.current = true;
      logAuthGuard("hydrated", {
        source,
        hasSession: !!nextSession,
        userId: nextSession?.user?.id,
        email: nextSession?.user?.email,
      });
      setSession(nextSession);
      setReady(true);
    };

    const applySessionUpdate = (nextSession, source) => {
      if (!mounted) return;
      logAuthGuard("session-update", {
        source,
        hasSession: !!nextSession,
        userId: nextSession?.user?.id,
        email: nextSession?.user?.email,
      });
      setSession(nextSession);
      setReady(true);
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      logAuthGuard("onAuthStateChange", {
        event,
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
      });

      if (event === "INITIAL_SESSION") {
        initialEventSeen = true;
        finishHydration(session, "INITIAL_SESSION");
        return;
      }

      if (!hydratedRef.current) {
        finishHydration(session, event);
        return;
      }

      applySessionUpdate(session, event);
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      logAuthGuard("getSession:resolved", {
        hasSession: !!data.session,
        userId: data.session?.user?.id,
        email: data.session?.user?.email,
      });

      if (data.session) {
        finishHydration(data.session, "getSession");
        return;
      }

      setTimeout(() => {
        if (!mounted || hydratedRef.current || initialEventSeen) return;
        finishHydration(null, "getSession:null-fallback");
      }, 0);
    })();

    return () => {
      mounted = false;
      logAuthGuard("unmount");
      data.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!ready || !session) return;

    try {
      if (sessionStorage.getItem("hub_just_logged_in") !== "1") return;
      sessionStorage.removeItem("hub_just_logged_in");
    } catch {
      return;
    }

    if (location.pathname !== "/dashboard") {
      logAuthGuard("fresh-login:dashboard", { from: location.pathname });
      navigate("/dashboard", { replace: true });
    }
  }, [location.pathname, navigate, ready, session]);

  if (!ready) return <div style={{ padding: 16 }}>Loading...</div>;
  if (!session) {
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    logAuthGuard("redirect:login", { redirect });
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
        replace
      />
    );
  }
  try {
    if (
      sessionStorage.getItem("hub_just_logged_in") === "1" &&
      location.pathname !== "/dashboard"
    ) {
      logAuthGuard("fresh-login:dashboard-render", {
        from: location.pathname,
      });
      return <Navigate to="/dashboard" replace />;
    }
  } catch {}
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
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);

    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}

/* -------------------- MOBILE APP -------------------- */
/** Mobile keeps public rota links available; authenticated HUB rota opens without the desktop Shell. */
function MobileApp() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/today-rota" element={<StaffView />} />
      <Route path="/staff-view" element={<StaffView />} />

      {/* Protected */}
      <Route
        path="/rota"
        element={
          <RequireAuth>
            <HubRota />
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
      <Route path="/today-rota" element={<StaffView />} />
      <Route path="/staff-view" element={<StaffView />} />

      {/* Protected app (with Shell) */}
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        {/* Core */}
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="prices" element={<Prices />} />
        <Route path="rota" element={<HubRota />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="chat/:id" element={<Chat />} />
        <Route path="change-pin" element={<ChangePin />} />

        {/* Admin */}
        <Route path="admin/prices" element={<PricesAdmin />} />
        <Route path="admin/canned" element={<CannedRepliesAdmin />} />
        <Route path="admin/users" element={<UsersAdmin />} />
        <Route path="admin/live" element={<AdminLive />} />
        <Route path="admin/insights" element={<AdminInsights />} />
        <Route
          path="admin/appointment-customers"
          element={<AppointmentCustomersAdmin />}
        />
        <Route
          path="admin/appointment-emails"
          element={<AppointmentEmailTemplates />}
        />
        <Route
          path="admin/appointment-hours"
          element={<AppointmentHoursAdmin />}
        />
        <Route
          path="admin/appointment-types"
          element={<AppointmentTypesAdmin />}
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

/* -------------------- APP ROOT -------------------- */
export default function App() {
  const location = useLocation();
  const isMobile = useIsMobile(900);
  const pathname = location.pathname || "/";
  const requiresDesktopShell =
    pathname === "/inbox" ||
    pathname === "/prices" ||
    pathname === "/appointments" ||
    pathname.startsWith("/chat/") ||
    pathname.startsWith("/admin/") ||
    pathname === "/change-pin";

  return isMobile && !requiresDesktopShell ? <MobileApp /> : <DesktopApp />;
}
