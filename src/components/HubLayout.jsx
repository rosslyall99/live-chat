import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./HubLayout.css";

export default function HubLayout({
  role,
  displayName,
  email,
  branchName,
  liveStatus,
  loading,
  topControls,
  userActions,
}) {
  const [consoleCollapsed, setConsoleCollapsed] = React.useState(false);
  const location = useLocation();
  const isAppointmentsRoute = location.pathname === "/appointments";

  return (
    <div
      className={`hub-layout ${consoleCollapsed ? "hub-layout--console-collapsed" : ""} ${
        isAppointmentsRoute ? "hub-layout--appointments" : ""
      }`}
    >
      <Sidebar
        role={role}
        collapsed={consoleCollapsed}
        onToggleCollapsed={() => setConsoleCollapsed((value) => !value)}
        displayName={displayName}
        email={email}
        branchName={branchName}
        liveStatus={liveStatus}
        loading={loading}
        topControls={topControls}
        userActions={userActions}
      />

      <main className="hub-main">
        <section className="hub-content">
          <div className="hub-content__inner">
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  );
}
