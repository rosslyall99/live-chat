import React from "react";
import { supabase } from "../supabaseClient";
import { prettySiteName, siteIdToAppointmentBranch } from "../lib/branches";
import "./Dashboard.css";

const CALENDAR_BRANCHES = [
  { branch: "DUK", siteId: "duke", label: "Duke Street" },
  { branch: "STE", siteId: "sten", label: "St Enoch" },
];

const dashboardElements = [
  {
    title: "Who is working today",
    signal: "Rota",
    value: "Placeholder",
    lines: ["Branch staffing snapshot", "Shift coverage indicators"],
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

function todayInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftInputDateValue(dateValue, dayOffset) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  date.setDate(date.getDate() + dayOffset);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inputDateValueFromIso(isoValue) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDivider(isoValue) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "Date pending";

  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatSummaryDate(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Today";

  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatTime(startAt) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return "Time pending";

  return start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function appointmentTypeLabel(item) {
  return item?.appointment_type_name || item?.type_name || "Calendar booking";
}

function appointmentAreaLabel(item) {
  return item?.area_name || item?.appointment_area_name || item?.area || "";
}

function sortAppointmentsByTime(a, b) {
  return (
    new Date(a?.start_at || 0).getTime() - new Date(b?.start_at || 0).getTime()
  );
}

function pluralizeAppointmentType(label, count) {
  const value = label || "Calendar booking";
  if (count === 1 || /s$/i.test(value)) return value;
  return `${value}s`;
}

function effectiveCalendarBranch(siteId) {
  return siteIdToAppointmentBranch(siteId) === "STE" ? "STE" : "DUK";
}

function orderedCalendarBranches(effectiveBranch) {
  if (effectiveBranch === "STE") {
    return [CALENDAR_BRANCHES[1], CALENDAR_BRANCHES[0]];
  }
  return CALENDAR_BRANCHES;
}

function groupCountsByType(appointments) {
  const counts = new Map();

  for (const item of appointments || []) {
    const label = appointmentTypeLabel(item);
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

async function loadCalendarDay(branch, day) {
  const { data, error } = await supabase.rpc("get_calendar_day_agent", {
    p_branch: branch,
    p_day: day,
  });

  if (error) throw error;
  return (data || []).filter((item) => item?.status !== "cancelled");
}

function useDashboardCalendarData() {
  const [state, setState] = React.useState({
    loading: true,
    error: "",
    effectiveBranch: "DUK",
    todayByBranch: {},
    upcoming: [],
  });

  React.useEffect(() => {
    let cancelled = false;

    async function loadCalendarElements() {
      setState((prev) => ({ ...prev, loading: true, error: "" }));

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error("No active session.");

        const { data: profile, error: profileError } = await supabase
          .from("staff_profiles")
          .select("site_id, is_active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile?.is_active) {
          throw new Error("Staff profile is inactive or missing.");
        }

        const nextEffectiveBranch = effectiveCalendarBranch(profile.site_id);
        const today = todayInputValue();
        const now = new Date();
        const todayEntries = await Promise.all(
          CALENDAR_BRANCHES.map(async (site) => [
            site.branch,
            await loadCalendarDay(site.branch, today),
          ]),
        );

        const todayByBranch = Object.fromEntries(todayEntries);
        const upcoming = [];

        for (let offset = 0; offset < 45 && upcoming.length < 10; offset += 1) {
          const day = shiftInputDateValue(today, offset);
          const dayAppointments = await loadCalendarDay(
            nextEffectiveBranch,
            day,
          );
          const futureAppointments = dayAppointments
            .filter((item) => new Date(item.start_at).getTime() > now.getTime())
            .sort(sortAppointmentsByTime);

          upcoming.push(...futureAppointments);
        }

        if (cancelled) return;

        setState({
          loading: false,
          error: "",
          effectiveBranch: nextEffectiveBranch,
          todayByBranch,
          upcoming: upcoming.slice(0, 10),
        });
      } catch (err) {
        console.error("dashboard: calendar elements failed", err);
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Calendar data could not be loaded.",
          }));
        }
      }
    }

    loadCalendarElements();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function CalendarSkeleton() {
  return (
    <div
      className="hub-dashboard-calendar-list"
      aria-label="Loading Calendar data"
    >
      <div className="hub-dashboard-calendar-skeleton" />
      <div className="hub-dashboard-calendar-skeleton hub-dashboard-calendar-skeleton--short" />
    </div>
  );
}

function TodayCalendarSummaryElement({ calendarState }) {
  const branchOrder = orderedCalendarBranches(calendarState.effectiveBranch);
  const total = Object.values(calendarState.todayByBranch).reduce(
    (sum, appointments) => sum + (appointments?.length || 0),
    0,
  );

  return (
    <article className="hub-dashboard-element hub-dashboard-element--calendar">
      <div className="hub-dashboard-element__header">
        <span>Calendar</span>
        <small>Both sites</small>
      </div>
      <h3>{`Today - ${formatSummaryDate(todayInputValue())}`}</h3>
      <div className="hub-dashboard-element__value">
        {calendarState.loading ? "Loading" : `${total} scheduled`}
      </div>

      {calendarState.loading ? (
        <CalendarSkeleton />
      ) : calendarState.error ? (
        <p className="hub-dashboard-calendar-message">{calendarState.error}</p>
      ) : (
        <div className="hub-dashboard-calendar-summary">
          {branchOrder.map((site) => {
            const groups = groupCountsByType(
              calendarState.todayByBranch[site.branch] || [],
            );

            return (
              <section
                className="hub-dashboard-calendar-site"
                key={site.branch}
              >
                <div className="hub-dashboard-calendar-site__title">
                  {site.label}
                </div>
                {groups.length === 0 ? (
                  <p>No appointments today</p>
                ) : (
                  <ul>
                    {groups.map((group) => (
                      <li key={group.label}>
                        <span>{group.count}</span>
                        {pluralizeAppointmentType(group.label, group.count)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}

function UpcomingCalendarElement({ calendarState }) {
  let lastDate = "";
  const effectiveSite =
    CALENDAR_BRANCHES.find(
      (site) => site.branch === calendarState.effectiveBranch,
    ) || CALENDAR_BRANCHES[0];

  return (
    <article className="hub-dashboard-element hub-dashboard-element--calendar hub-dashboard-element--upcoming">
      <div className="hub-dashboard-element__header">
        <span>Forward view</span>
        <small>{prettySiteName(effectiveSite.siteId)}</small>
      </div>
      <h3>Upcoming appointments</h3>
      <div className="hub-dashboard-element__value">
        {calendarState.loading
          ? "Loading"
          : `${calendarState.upcoming.length} queued`}
      </div>

      {calendarState.loading ? (
        <CalendarSkeleton />
      ) : calendarState.error ? (
        <p className="hub-dashboard-calendar-message">{calendarState.error}</p>
      ) : calendarState.upcoming.length === 0 ? (
        <p className="hub-dashboard-calendar-message">
          No upcoming appointments
        </p>
      ) : (
        <div className="hub-dashboard-calendar-list">
          {calendarState.upcoming.map((item) => {
            const areaLabel = appointmentAreaLabel(item);
            const dateValue = inputDateValueFromIso(item.start_at);
            const showDivider = dateValue !== lastDate;
            lastDate = dateValue;

            return (
              <React.Fragment key={item.id}>
                {showDivider ? (
                  <div className="hub-dashboard-calendar-date">
                    {formatDateDivider(item.start_at)}
                  </div>
                ) : null}
                <div className="hub-dashboard-calendar-item">
                  <div className="hub-dashboard-calendar-item__time">
                    {formatTime(item.start_at)}
                  </div>
                  <div className="hub-dashboard-calendar-item__main">
                    <strong>{item.customer_name || "Unnamed customer"}</strong>
                    <span>
                      {appointmentTypeLabel(item)}
                      {areaLabel ? ` / ${areaLabel}` : ""}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </article>
  );
}

function StaticDashboardElement({ element }) {
  return (
    <article className="hub-dashboard-element">
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
  );
}

export default function Dashboard() {
  const calendarState = useDashboardCalendarData();

  return (
    <div className="hub-dashboard">
      <section className="hub-dashboard-hero">
        <div>
          <span className="hub-dashboard-hero__kicker">
            Operational landing
          </span>
          <h2>Dashboard</h2>
        </div>
        <div className="hub-dashboard-hero__status">
          <span />
          Stage 13A shell online
        </div>
      </section>

      <section className="hub-dashboard-grid" aria-label="Dashboard Elements">
        <div className="hub-dashboard-calendar-column">
          <TodayCalendarSummaryElement calendarState={calendarState} />
          <UpcomingCalendarElement calendarState={calendarState} />
        </div>
        {dashboardElements.map((element) => (
          <StaticDashboardElement element={element} key={element.title} />
        ))}
      </section>
    </div>
  );
}
