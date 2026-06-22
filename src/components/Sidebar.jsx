import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import HubLogo from "../images/iconTransparent.png";
import "./Sidebar.css";

function ConsoleItem({ to, label, code, collapsed }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `hub-console-item ${isActive ? "hub-console-item--active" : ""}`
      }
      title={collapsed ? label : undefined}
    >
      <span className="hub-console-item__glyph">{code}</span>
      <span className="hub-console-item__label">{label}</span>
    </NavLink>
  );
}

function ConsoleGroup({ title, code, items, collapsed, defaultOpen = false }) {
  const location = useLocation();
  const hasActiveItem = items.some((item) => item.to === location.pathname);
  const [isOpen, setIsOpen] = React.useState(defaultOpen || hasActiveItem);

  React.useEffect(() => {
    if (hasActiveItem) setIsOpen(true);
  }, [hasActiveItem]);

  if (!items.length) return null;

  if (collapsed) {
    return (
      <div className="hub-console-group hub-console-group--collapsed">
        {items.map((item) => (
          <ConsoleItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </div>
    );
  }

  return (
    <section className="hub-console-group">
      <button
        type="button"
        className={`hub-console-group__trigger ${hasActiveItem ? "hub-console-group__trigger--active" : ""}`}
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
      >
        <span className="hub-console-group__code">{code}</span>
        <span className="hub-console-group__title">{title}</span>
        <span className="hub-console-group__chevron">{isOpen ? "-" : "+"}</span>
      </button>

      {isOpen ? (
        <div className="hub-console-group__items">
          {items.map((item) => (
            <ConsoleItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function Sidebar({
  role = "agent",
  collapsed = false,
  onToggleCollapsed,
  displayName,
  email,
  branchName,
  liveStatus,
  loading,
  topControls,
  userActions,
}) {
  const normalizedRole = String(role).toLowerCase();
  const isAdmin = normalizedRole === "admin";

  const primaryItems = [
    { to: "/rota", label: "ROTA", code: "RT" },
    { to: "/appointments", label: "CALENDAR", code: "CA" },
    { to: "/inbox", label: "LIVE CHAT", code: "LC" },
  ];

  const groups = isAdmin
    ? [
        {
          title: "Appointments",
          code: "AP",
          items: [
            {
              to: "/admin/appointment-customers",
              label: "Customers",
              code: "CU",
            },
            { to: "/admin/appointment-emails", label: "Emails", code: "EM" },
            { to: "/admin/appointment-types", label: "Types", code: "TY" },
            { to: "/admin/appointment-hours", label: "Hours", code: "HR" },
          ],
        },
        {
          title: "Live Chat Admin",
          code: "LA",
          items: [
            { to: "/admin/live", label: "Chats", code: "CH" },
            { to: "/admin/insights", label: "Insights", code: "IX" },
            { to: "/admin/canned", label: "Canned Replies", code: "CR" },
          ],
        },
        {
          title: "Settings",
          code: "ST",
          items: [
            { to: "/admin/users", label: "Users", code: "US" },
            { to: "/change-pin", label: "Change PIN", code: "PN" },
          ],
        },
      ]
    : [
        {
          title: "Settings",
          code: "ST",
          items: [{ to: "/change-pin", label: "Change PIN", code: "PN" }],
        },
      ];

  return (
    <aside
      className={`hub-console ${collapsed ? "hub-console--collapsed" : ""}`}
      aria-label="Console navigation"
    >
      <div className="hub-console-brand">
        <Link
          to="/dashboard"
          className="hub-console-brand__mark"
          aria-label="Dashboard home"
          title="Dashboard"
        >
          <img src={HubLogo} alt="Hub" draggable={false} />
        </Link>
        <button
          type="button"
          className="hub-console-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand Console" : "Collapse Console"}
          title={collapsed ? "Expand Console" : "Collapse Console"}
        >
          {collapsed ? ">" : "<"}
        </button>
      </div>

      <nav className="hub-console-nav">
        <div className="hub-console-primary">
          {primaryItems.map((item) => (
            <ConsoleItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </div>

        {groups.map((group) => (
          <ConsoleGroup key={group.title} collapsed={collapsed} {...group} />
        ))}
      </nav>

      <div className="hub-console-operator">
        <div className="hub-console-operator__top">
          <div className="hub-console-operator__identity">
            <div className="hub-console-operator__signal" />
            <div className="hub-console-operator__copy">
              <span>
                {loading ? "Loading..." : displayName || email || "Operator"}
              </span>
              <small>{branchName || "Branch pending"}</small>
            </div>
          </div>
          <div className="hub-console-operator__controls">{topControls}</div>
        </div>

        <div className="hub-console-operator__actions">{userActions}</div>
      </div>
    </aside>
  );
}
