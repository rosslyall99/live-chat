import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import {
  getBookableAppointmentSites,
  getDefaultAppointmentSiteId,
  isBookableAppointmentSite,
  prettySiteName,
  siteIdToAppointmentBranch,
} from "../lib/branches";

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 18;
const HOUR_HEIGHT = 64;

function todayInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTimeRange(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  return `${start.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })} - ${end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildVisibleWindow(appointments, blocks) {
  const times = [...appointments, ...blocks]
    .flatMap((item) => [item.start_at, item.end_at])
    .map((iso) => new Date(iso))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (times.length === 0) {
    return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
  }

  const minHour = Math.min(...times.map((date) => date.getHours()));
  const maxHour = Math.max(
    ...times.map((date) => date.getHours() + (date.getMinutes() > 0 ? 1 : 0))
  );

  return {
    startHour: clamp(minHour - 1, 7, 20),
    endHour: clamp(Math.max(maxHour + 1, DEFAULT_END_HOUR), 8, 22),
  };
}

function toPosition(iso, startHour) {
  const date = new Date(iso);
  return ((date.getHours() - startHour) * 60 + date.getMinutes()) / 60 * HOUR_HEIGHT;
}

function itemHeight(startAt, endAt) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const hours = Math.max((end - start) / 3600000, 0.5);
  return hours * HOUR_HEIGHT;
}

function hourLabel(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function bookedByLabel(item) {
  return (
    item.booked_by_name ||
    item.booked_by_display_name ||
    item.booked_by_username ||
    null
  );
}

function appointmentTypeLabel(item, typesById) {
  return (
    item.appointment_type_name ||
    typesById[item.appointment_type_id]?.name ||
    "Appointment"
  );
}

function TimelineItem({ item, type, startHour, typesById }) {
  const top = toPosition(item.start_at, startHour);
  const height = itemHeight(item.start_at, item.end_at);
  const isBlock = type === "block";
  const bookedBy = bookedByLabel(item);

  return (
    <div
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        top,
        minHeight: height,
        borderRadius: 12,
        border: isBlock
          ? "1px solid rgba(239,68,68,0.35)"
          : "1px solid rgba(59,130,246,0.28)",
        background: isBlock ? "rgba(239,68,68,0.14)" : "rgba(59,130,246,0.14)",
        padding: 8,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
      title={isBlock ? item.reason : item.customer_name}
    >
      <div style={{ fontSize: 11, fontWeight: 900, color: ui.colors.muted }}>
        {formatTimeRange(item.start_at, item.end_at)}
      </div>

      <div style={{ marginTop: 4, fontWeight: 900, color: ui.colors.text }}>
        {isBlock ? item.reason : item.customer_name || "Unnamed customer"}
      </div>

      {!isBlock ? (
        <div style={{ marginTop: 4, fontSize: 12, color: ui.colors.text }}>
          {appointmentTypeLabel(item, typesById)}
        </div>
      ) : null}

      {!isBlock && bookedBy ? (
        <div style={{ marginTop: 4, fontSize: 11, color: ui.colors.muted }}>
          Booked by {bookedBy}
        </div>
      ) : null}
    </div>
  );
}

export default function Appointments() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [blockWarning, setBlockWarning] = React.useState("");
  const [calendarWarning, setCalendarWarning] = React.useState("");

  const [role, setRole] = React.useState("");
  const [profile, setProfile] = React.useState(null);
  const [sites, setSites] = React.useState([]);
  const [selectedSiteId, setSelectedSiteId] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState(todayInputValue);

  const [areas, setAreas] = React.useState([]);
  const [appointments, setAppointments] = React.useState([]);
  const [blocks, setBlocks] = React.useState([]);
  const [typesById, setTypesById] = React.useState({});

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const showSiteSelector = isAdmin || isManager;
  const bookableSites = React.useMemo(() => getBookableAppointmentSites(sites), [sites]);
  const selectedSiteIsBookable = isBookableAppointmentSite(selectedSiteId);

  React.useEffect(() => {
    if (!showSiteSelector) return;
    if (!sites.length) return;
    if (selectedSiteIsBookable) return;

    const fallbackSiteId = getDefaultAppointmentSiteId({
      sites,
      preferredSiteId: profile?.site_id,
      allowFallback: true,
    });

    if (fallbackSiteId) setSelectedSiteId(fallbackSiteId);
  }, [profile?.site_id, selectedSiteId, selectedSiteIsBookable, showSiteSelector, sites]);

  React.useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr) throw userErr;
        if (!user) throw new Error("No active session.");

        const { data: ownProfile, error: profileErr } = await supabase
          .from("staff_profiles")
          .select("user_id, username, display_name, site_id, role, is_active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileErr) throw profileErr;
        if (!ownProfile?.is_active) {
          throw new Error("Your staff profile is inactive or missing.");
        }

        const nextRole = String(ownProfile.role || "").toLowerCase();

        const { data: siteRows, error: sitesErr } = await supabase
          .from("sites")
          .select("id, name")
          .order("name", { ascending: true });

        if (sitesErr) {
          console.error("appointments: sites load failed", sitesErr);
        }

        if (cancelled) return;

        setProfile(ownProfile);
        setRole(nextRole);

        const safeSites = siteRows?.length
          ? siteRows
          : [{ id: ownProfile.site_id, name: prettySiteName(ownProfile.site_id) }];
        const preferredSiteId =
          nextRole === "admin" || nextRole === "manager"
            ? getDefaultAppointmentSiteId({
                sites: safeSites,
                preferredSiteId: ownProfile.site_id,
                allowFallback: true,
              })
            : ownProfile.site_id || "";

        setSites(safeSites);
        setSelectedSiteId((prev) => {
          if (prev) return prev;
          return preferredSiteId;
        });
      } catch (err) {
        console.error("appointments: bootstrap failed", err);
        if (!cancelled) {
          setError(err.message || "Could not load appointment access.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadCalendar() {
      if (!selectedSiteId || !profile?.site_id) return;

      setLoading(true);
      setError("");
      setBlockWarning("");
      setCalendarWarning("");

      const branchCode = siteIdToAppointmentBranch(selectedSiteId);
      if (!branchCode) {
        setAreas([]);
        setAppointments([]);
        setBlocks([]);
        setError(`Appointments are not available for ${prettySiteName(selectedSiteId)}.`);
        setLoading(false);
        return;
      }

      try {
        const areasReq = supabase
          .from("appointment_areas")
          .select("id, branch, name, sort_order, is_active")
          .eq("branch", branchCode)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        const typesReq = supabase
          .from("appointment_types")
          .select("id, name, duration_minutes, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        const calendarReq = supabase.rpc("get_calendar_day_agent", {
          p_branch: branchCode,
          p_day: selectedDate,
        });

        const blocksReq = supabase.rpc("get_blocks_day_agent", {
          p_branch: branchCode,
          p_day: selectedDate,
        });

        const [areasRes, typesRes, calendarRes, blocksRes] = await Promise.allSettled([
          areasReq,
          typesReq,
          calendarReq,
          blocksReq,
        ]);

        if (cancelled) return;

        if (areasRes.status === "fulfilled") {
          if (areasRes.value.error) throw areasRes.value.error;
          setAreas(areasRes.value.data || []);
        } else {
          throw areasRes.reason;
        }

        if (typesRes.status === "fulfilled") {
          if (typesRes.value.error) {
            console.error("appointments: types load failed", typesRes.value.error);
            setTypesById({});
          } else {
            const map = {};
            for (const item of typesRes.value.data || []) {
              map[item.id] = item;
            }
            setTypesById(map);
          }
        } else {
          console.error("appointments: types load failed", typesRes.reason);
          setTypesById({});
        }

        if (calendarRes.status === "fulfilled") {
          if (calendarRes.value.error) {
            console.error("appointments: get_calendar_day_agent failed", calendarRes.value.error);
            setAppointments([]);
            setCalendarWarning(
              "Calendar appointments could not be loaded from the existing appointment RPC."
            );
          } else {
            setAppointments(calendarRes.value.data || []);
          }
        } else {
          console.error("appointments: get_calendar_day_agent crashed", calendarRes.reason);
          setAppointments([]);
          setCalendarWarning(
            "Calendar appointments could not be loaded from the existing appointment RPC."
          );
        }

        if (blocksRes.status === "fulfilled") {
          if (blocksRes.value.error) {
            console.error("appointments: get_blocks_day_agent failed", blocksRes.value.error);
            setBlocks([]);
            setBlockWarning("Blocked-out periods could not be loaded for this date.");
          } else {
            setBlocks(blocksRes.value.data || []);
          }
        } else {
          console.error("appointments: get_blocks_day_agent crashed", blocksRes.reason);
          setBlocks([]);
          setBlockWarning("Blocked-out periods could not be loaded for this date.");
        }
      } catch (err) {
        console.error("appointments: load failed", err);
        if (!cancelled) {
          setAreas([]);
          setAppointments([]);
          setBlocks([]);
          setError(err.message || "Could not load appointment calendar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCalendar();

    return () => {
      cancelled = true;
    };
  }, [profile?.site_id, selectedDate, selectedSiteId]);

  const visibleSiteName = React.useMemo(
    () => prettySiteName(selectedSiteId || profile?.site_id),
    [profile?.site_id, selectedSiteId]
  );

  const areasById = React.useMemo(() => {
    const map = {};
    for (const area of areas) map[area.id] = area;
    return map;
  }, [areas]);

  const timeline = React.useMemo(
    () => buildVisibleWindow(appointments, blocks),
    [appointments, blocks]
  );

  const totalHours = Math.max(timeline.endHour - timeline.startHour, 1);
  const timelineHeight = totalHours * HOUR_HEIGHT;

  const hourTicks = React.useMemo(() => {
    const items = [];
    for (let hour = timeline.startHour; hour <= timeline.endHour; hour += 1) {
      items.push(hour);
    }
    return items;
  }, [timeline.endHour, timeline.startHour]);

  const appointmentsByArea = React.useMemo(() => {
    const map = {};
    for (const area of areas) map[area.id] = [];
    for (const item of appointments) {
      if (!map[item.area_id]) map[item.area_id] = [];
      map[item.area_id].push(item);
    }
    return map;
  }, [appointments, areas]);

  const blocksByArea = React.useMemo(() => {
    const map = {};
    for (const area of areas) map[area.id] = [];
    for (const item of blocks) {
      if (!item.area_id) continue;
      if (!map[item.area_id]) map[item.area_id] = [];
      map[item.area_id].push(item);
    }
    return map;
  }, [blocks, areas]);

  const pageTitle = `Appointments${visibleSiteName ? ` - ${visibleSiteName}` : ""}`;
  const selectorSites = showSiteSelector ? bookableSites : sites;

  return (
    <div style={{ width: "100%", color: ui.colors.text, fontFamily: ui.font.ui }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Appointments</h2>
          <div style={ui.text.subtitle}>
            Read-only day view using the existing appointment areas and calendar RPCs.
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, color: ui.colors.muted }}>
          {pageTitle}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          border: `1px solid ${ui.colors.border}`,
          borderRadius: 12,
          background: "rgba(2, 6, 23, 0.02)",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "end",
        }}
      >
        <label style={{ fontSize: 13, fontWeight: 700 }}>
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              display: "block",
              marginTop: 6,
              padding: "10px 12px",
              borderRadius: ui.radius.md,
              border: `1px solid ${ui.colors.border}`,
              background: ui.colors.cardBg,
              color: ui.colors.text,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </label>

        {showSiteSelector ? (
          <label style={{ fontSize: 13, fontWeight: 700 }}>
            Site
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              style={{
                display: "block",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: ui.radius.md,
                border: `1px solid ${ui.colors.border}`,
                background: ui.colors.cardBg,
                color: ui.colors.text,
                outline: "none",
                boxSizing: "border-box",
                minWidth: 180,
              }}
            >
              {selectorSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name || prettySiteName(site.id)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>Site</div>
            <div style={{ marginTop: 8 }}>{visibleSiteName}</div>
          </div>
        )}
      </div>

      {!showSiteSelector && !selectedSiteIsBookable ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
          }}
        >
          Appointments are only available for Duke Street and St Enoch. Your current site is {visibleSiteName}.
        </div>
      ) : null}

      {showSiteSelector && bookableSites.length === 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
          }}
        >
          No bookable appointment sites are available yet. Seed Duke Street and St Enoch appointment areas first.
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.35)",
          }}
        >
          {error}
        </div>
      ) : null}

      {calendarWarning ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
          }}
        >
          {calendarWarning}
        </div>
      ) : null}

      {blockWarning ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(59,130,246,0.10)",
            border: "1px solid rgba(59,130,246,0.25)",
          }}
        >
          {blockWarning}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          border: `1px solid ${ui.colors.border}`,
          borderRadius: 12,
          overflow: "hidden",
          background: ui.colors.cardBg,
        }}
      >
        <div
          style={{
            padding: 12,
            borderBottom: `1px solid ${ui.colors.border}`,
            background: "rgba(2, 6, 23, 0.03)",
            fontWeight: 900,
          }}
        >
          Day View
        </div>

        {loading ? (
          <div style={{ padding: 16 }}>Loading appointments...</div>
        ) : areas.length === 0 ? (
          <div style={{ padding: 16, color: ui.colors.muted }}>
            Appointment areas/resources need to be seeded for this site before the calendar can display columns.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `84px repeat(${areas.length}, minmax(220px, 1fr))`,
                minWidth: 84 + areas.length * 220,
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderRight: `1px solid ${ui.colors.border}`,
                  borderBottom: `1px solid ${ui.colors.border}`,
                  background: "rgba(2, 6, 23, 0.03)",
                  fontWeight: 800,
                }}
              >
                Time
              </div>

              {areas.map((area) => (
                <div
                  key={area.id}
                  style={{
                    padding: 12,
                    borderRight: `1px solid ${ui.colors.border}`,
                    borderBottom: `1px solid ${ui.colors.border}`,
                    background: "rgba(2, 6, 23, 0.03)",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{area.name}</div>
                  <div style={{ fontSize: 12, color: ui.colors.muted }}>
                    {areasById[area.id]?.branch || ""}
                  </div>
                </div>
              ))}

              <div
                style={{
                  position: "relative",
                  height: timelineHeight,
                  borderRight: `1px solid ${ui.colors.border}`,
                  background: "rgba(2, 6, 23, 0.02)",
                }}
              >
                {hourTicks.map((hour) => {
                  const top = (hour - timeline.startHour) * HOUR_HEIGHT;
                  return (
                    <div
                      key={hour}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top,
                        height: 0,
                        borderTop: "1px solid rgba(2, 6, 23, 0.08)",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: -9,
                          left: 8,
                          fontSize: 12,
                          fontWeight: 800,
                          color: ui.colors.muted,
                          background: "rgba(212,212,212,0.9)",
                          padding: "0 4px",
                        }}
                      >
                        {hourLabel(hour)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {areas.map((area) => {
                const areaAppointments = appointmentsByArea[area.id] || [];
                const areaBlocks = blocksByArea[area.id] || [];
                const hasItems = areaAppointments.length > 0 || areaBlocks.length > 0;

                return (
                  <div
                    key={area.id}
                    style={{
                      position: "relative",
                      height: timelineHeight,
                      borderRight: `1px solid ${ui.colors.border}`,
                      background: "#fff",
                    }}
                  >
                    {hourTicks.map((hour) => {
                      const top = (hour - timeline.startHour) * HOUR_HEIGHT;
                      return (
                        <div
                          key={hour}
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top,
                            borderTop: "1px solid rgba(2, 6, 23, 0.08)",
                          }}
                        />
                      );
                    })}

                    {areaBlocks.map((item) => (
                      <TimelineItem
                        key={`block-${item.id}`}
                        item={item}
                        type="block"
                        startHour={timeline.startHour}
                        typesById={typesById}
                      />
                    ))}

                    {areaAppointments.map((item) => (
                      <TimelineItem
                        key={`appt-${item.id}`}
                        item={item}
                        type="appointment"
                        startHour={timeline.startHour}
                        typesById={typesById}
                      />
                    ))}

                    {!hasItems ? (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 16,
                          textAlign: "center",
                          color: ui.colors.muted,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        No appointments or blocks
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
