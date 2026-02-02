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

import Shell from "./components/Shell";

/* -------------------- AUTH GUARD -------------------- */
function RequireAuth({ children }) {
  const [ready, setReady] = React.useState(false);
  const [session, setSession] = React.useState(null);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

/* -------------------- APP ROUTES -------------------- */
export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected app */}
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        {/* Core */}
        <Route path="/" element={<Inbox />} />
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/change-pin" element={<ChangePin />} />

        {/* Admin */}
        <Route path="/admin/canned" element={<CannedRepliesAdmin />} />
        <Route path="/admin/users" element={<UsersAdmin />} />
        <Route path="/admin/live" element={<AdminLive />} />
        <Route path="/admin/insights" element={<AdminInsights />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
