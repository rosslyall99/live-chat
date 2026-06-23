import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { prettySiteName, siteIdToAppointmentBranch } from "../lib/branches";
import "./Dashboard.css";

const CALENDAR_BRANCHES = [
  { branch: "DUK", siteId: "duke", label: "Duke Street" },
  { branch: "STE", siteId: "sten", label: "St Enoch" },
];

const dashboardElements = [
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

function startOfDayLocal(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addLocalDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function ymdLocal(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function overlapsRotaDate(absence, date) {
  const day = ymdLocal(date);
  return absence?.start_date <= day && absence?.end_date >= day;
}

function normName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normBranch(branch) {
  const value = String(branch || "").trim().toLowerCase();
  if (value.includes("st enoch") || value.includes("stenoch") || value === "se")
    return "stenoch";
  if (value.includes("duke")) return "duke";
  if (value.includes("hire")) return "hire";
  if (value.includes("office")) return "office";
  return null;
}

function initialsFor(name) {
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

function dedupePeople(items) {
  const seen = new Set();
  const output = [];

  for (const item of items || []) {
    const key = normName(item.sageName || item.displayName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function profileForRotaName(name, profiles) {
  const key = normName(name);
  return (
    profiles.find((profile) => normName(profile.rota_match_name) === key) ||
    profiles.find((profile) => normName(profile.display_name) === key) ||
    profiles.find((profile) => normName(profile.name) === key) ||
    profiles.find((profile) => normName(profile.username) === key) ||
    null
  );
}

function visibleProfileName(profile, fallback) {
  return (
    profile?.display_name?.trim?.() ||
    profile?.name?.trim?.() ||
    profile?.username?.trim?.() ||
    fallback
  );
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

async function getLatestCompletedRotaRunId() {
  const { data, error } = await supabase
    .from("rota_sync_runs")
    .select("id")
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return data.id;
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

function useDashboardRotaData() {
  const [state, setState] = React.useState({
    loading: true,
    error: "",
    today: startOfDayLocal(new Date()),
    groups: {
      stenoch: [],
      duke: [],
      hire: [],
      office: [],
      holiday: [],
      sick: [],
    },
  });

  React.useEffect(() => {
    let cancelled = false;

    async function loadRotaElement() {
      const today = startOfDayLocal(new Date());
      const tomorrow = addLocalDays(today, 1);
      const todayYmd = ymdLocal(today);

      setState((prev) => ({ ...prev, loading: true, error: "" }));

      try {
        const runId = await getLatestCompletedRotaRunId();

        const shiftsQuery = supabase
          .from("rota_shifts")
          .select("staff_name, branch, label, start_at, end_at")
          .eq("sync_run_id", runId)
          .gte("start_at", today.toISOString())
          .lt("start_at", tomorrow.toISOString())
          .order("staff_name", { ascending: true })
          .order("start_at", { ascending: true });

        const absencesQuery = supabase
          .from("rota_absences")
          .select("staff_name, absence_type, absence_label, start_date, end_date, is_partial")
          .eq("sync_run_id", runId)
          .lte("start_date", todayYmd)
          .gte("end_date", todayYmd)
          .order("staff_name", { ascending: true });

        const profilesQuery = supabase
          .from("staff_profiles")
          .select("user_id, username, display_name, rota_match_name, is_active")
          .eq("is_active", true);

        const nameMapQuery = supabase.rpc("get_rota_name_map");

        const [
          { data: shifts, error: shiftsError },
          { data: absences, error: absencesError },
          { data: profiles, error: profilesError },
          { data: nameMapRows, error: nameMapError },
        ] = await Promise.all([
          shiftsQuery,
          absencesQuery,
          profilesQuery,
          nameMapQuery,
        ]);

        if (shiftsError) throw shiftsError;
        if (absencesError) throw absencesError;
        if (profilesError) {
          console.warn("dashboard: staff profile matching unavailable", profilesError);
        }
        if (nameMapError) {
          console.warn("dashboard: rota name map unavailable", nameMapError);
        }

        const safeProfiles = [
          ...(nameMapError ? [] : nameMapRows || []),
          ...(profilesError ? [] : profiles || []),
        ];
        const offToday = new Set(
          (absences || [])
            .filter((absence) => overlapsRotaDate(absence, today))
            .map((absence) => normName(absence.staff_name)),
        );

        const groups = {
          stenoch: [],
          duke: [],
          hire: [],
          office: [],
          holiday: [],
          sick: [],
        };

        for (const shift of shifts || []) {
          const start = new Date(shift.start_at);
          if (!sameLocalDay(start, today)) continue;
          if (offToday.has(normName(shift.staff_name))) continue;

          const groupKey = normBranch(shift.branch);
          if (!groupKey) continue;

          const profile = profileForRotaName(shift.staff_name, safeProfiles);
          const displayName = visibleProfileName(profile, shift.staff_name);

          groups[groupKey].push({
            sageName: shift.staff_name,
            displayName,
            profile,
          });
        }

        for (const absence of absences || []) {
          if (!overlapsRotaDate(absence, today)) continue;

          const absenceType = String(absence.absence_type || "").toUpperCase();
          const groupKey =
            absenceType === "HOL"
              ? "holiday"
              : absenceType === "SICK"
                ? "sick"
                : "";
          if (!groupKey) continue;

          const profile = profileForRotaName(absence.staff_name, safeProfiles);
          const displayName = visibleProfileName(profile, absence.staff_name);

          groups[groupKey].push({
            sageName: absence.staff_name,
            displayName,
            profile,
          });
        }

        const nextGroups = Object.fromEntries(
          Object.entries(groups).map(([key, value]) => [key, dedupePeople(value)]),
        );

        if (!cancelled) {
          setState({
            loading: false,
            error: "",
            today,
            groups: nextGroups,
          });
        }
      } catch (err) {
        console.error("dashboard: rota element failed", err);
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Rota data could not be loaded.",
          }));
        }
      }
    }

    loadRotaElement();

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

function RotaSkeleton() {
  return (
    <div className="hub-dashboard-rota-groups" aria-label="Loading rota data">
      <div className="hub-dashboard-calendar-skeleton" />
      <div className="hub-dashboard-calendar-skeleton hub-dashboard-calendar-skeleton--short" />
    </div>
  );
}

function StaffChip({ person, status, onOpen }) {
  const initials = initialsFor(person.displayName);

  return (
    <button
      type="button"
      className={`hub-dashboard-staff-chip hub-dashboard-staff-chip--${status}`}
      onClick={() => onOpen(person.sageName)}
      title={`Open ${person.displayName} on today's rota`}
    >
      <span className="hub-dashboard-staff-chip__avatar">{initials}</span>
      <span className="hub-dashboard-staff-chip__copy">
        <strong>{person.displayName}</strong>
      </span>
    </button>
  );
}

function RotaGroup({ title, items, status, onOpen }) {
  return (
    <section className={`hub-dashboard-rota-group hub-dashboard-rota-group--${status}`}>
      <div className="hub-dashboard-rota-group__title">
        <span>{title}</span>
        <small>{items.length}</small>
      </div>
      {items.length === 0 ? (
        <p className="hub-dashboard-rota-empty">No entries</p>
      ) : (
        <div className="hub-dashboard-staff-list">
          {items.map((person) => (
            <StaffChip
              key={`${status}:${person.sageName}`}
              person={person}
              status={status}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function WorkingTodayElement({ rotaState }) {
  const navigate = useNavigate();
  const workingCount =
    rotaState.groups.stenoch.length +
    rotaState.groups.duke.length +
    rotaState.groups.hire.length +
    rotaState.groups.office.length;
  const absenceCount =
    rotaState.groups.holiday.length + rotaState.groups.sick.length;

  function openRotaStaff(name) {
    navigate(`/rota?date=today&staff=${encodeURIComponent(name)}`);
  }

  return (
    <article className="hub-dashboard-element hub-dashboard-element--rota">
      <div className="hub-dashboard-element__header">
        <span>Rota</span>
        <small>{formatSummaryDate(ymdLocal(rotaState.today))}</small>
      </div>
      <h3>Who is working today</h3>
      <div className="hub-dashboard-element__value">
        {rotaState.loading ? "Loading" : `${workingCount} active`}
      </div>

      {rotaState.loading ? (
        <RotaSkeleton />
      ) : rotaState.error ? (
        <p className="hub-dashboard-calendar-message">{rotaState.error}</p>
      ) : (
        <div className="hub-dashboard-rota-panel">
          <div className="hub-dashboard-rota-groups">
            <RotaGroup
              title="STE / St Enoch"
              items={rotaState.groups.stenoch}
              status="stenoch"
              onOpen={openRotaStaff}
            />
            <RotaGroup
              title="DUK / Duke Street"
              items={rotaState.groups.duke}
              status="duke"
              onOpen={openRotaStaff}
            />
            <RotaGroup
              title="Hire"
              items={rotaState.groups.hire}
              status="hire"
              onOpen={openRotaStaff}
            />
            <RotaGroup
              title="Office"
              items={rotaState.groups.office}
              status="office"
              onOpen={openRotaStaff}
            />
          </div>

          {absenceCount ? (
            <div className="hub-dashboard-rota-absences">
              <RotaGroup
                title="Holiday"
                items={rotaState.groups.holiday}
                status="holiday"
                onOpen={openRotaStaff}
              />
              <RotaGroup
                title="Sick"
                items={rotaState.groups.sick}
                status="sick"
                onOpen={openRotaStaff}
              />
            </div>
          ) : null}
        </div>
      )}
    </article>
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
  const rotaState = useDashboardRotaData();

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
        <WorkingTodayElement rotaState={rotaState} />
        {dashboardElements.map((element) => (
          <StaticDashboardElement element={element} key={element.title} />
        ))}
      </section>
    </div>
  );
}
