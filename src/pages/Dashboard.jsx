import React from "react";
import "./Dashboard.css";

const dashboardElements = [
  {
    title: "Who is working today",
    signal: "Rota",
    value: "Placeholder",
    lines: ["Branch staffing snapshot", "Shift coverage indicators"],
  },
  {
    title: "Today's appointments",
    signal: "Appointments",
    value: "Standby",
    lines: ["Daily fittings and bookings", "No live query connected"],
  },
  {
    title: "Upcoming appointments",
    signal: "Forward view",
    value: "Queued",
    lines: ["Next scheduled customer visits", "Static element for Stage 13A"],
  },
  {
    title: "Outstanding live chats",
    signal: "Live chat",
    value: "Monitor",
    lines: ["Open conversations", "Escalations and waiting customers"],
  },
  {
    title: "Staff notices",
    signal: "Ops",
    value: "Broadcast",
    lines: ["Internal updates", "Branch-wide announcements"],
  },
  {
    title: "Price changes",
    signal: "Stock",
    value: "Review",
    lines: ["Pending price updates", "Approval status placeholder"],
  },
];

export default function Dashboard() {
  return (
    <div className="hub-dashboard">
      <section className="hub-dashboard-hero">
        <div>
          <span className="hub-dashboard-hero__kicker">Operational landing</span>
          <h2>Dashboard</h2>
        </div>
        <div className="hub-dashboard-hero__status">
          <span />
          Stage 13A shell online
        </div>
      </section>

      <section className="hub-dashboard-grid" aria-label="Dashboard Elements">
        {dashboardElements.map((element) => (
          <article className="hub-dashboard-element" key={element.title}>
            <div className="hub-dashboard-element__header">
              <span>{element.signal}</span>
              <small>Element</small>
            </div>
            <h3>{element.title}</h3>
            <div className="hub-dashboard-element__value">{element.value}</div>
            <div className="hub-dashboard-element__lines">
              {element.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
