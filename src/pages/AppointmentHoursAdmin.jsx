import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import {
  APPOINTMENT_HOURS_DAY_OPTIONS,
  buildOpeningHoursSavePayload,
  normalizeOpeningHours,
} from "../lib/appointmentHours";

function blankHours() {
  return normalizeOpeningHours(null, "sten").hours;
}

export default function AppointmentHoursAdmin() {
  const [role, setRole] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [sites, setSites] = React.useState([]);
  const [selectedSiteId, setSelectedSiteId] = React.useState("");
  const [draftHours, setDraftHours] = React.useState(blankHours);

  const isAdmin = role === "admin";

  const inputStyle = React.useMemo(
    () => ({
      width: "100%",
      padding: "10px 12px",
      borderRadius: ui.radius.md,
      border: `1px solid ${ui.colors.border}`,
      background: ui.colors.cardBg,
      color: ui.colors.text,
      outline: "none",
      boxSizing: "border-box",
      fontFamily: ui.font.ui,
    }),
    [],
  );

  const selectedSite = React.useMemo(
    () => sites.find((site) => site.site_id === selectedSiteId) || null,
    [selectedSiteId, sites],
  );

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("No active session.");

      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("role, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.is_active) {
        throw new Error("Your staff profile is inactive or missing.");
      }

      const nextRole = String(profile.role || "").toLowerCase();
      setRole(nextRole);

      if (nextRole !== "admin") {
        setSites([]);
        setSelectedSiteId("");
        setDraftHours(blankHours());
        return;
      }

      const { data, error: hoursError } = await supabase.rpc(
        "get_appointment_site_hours_admin",
      );

      if (hoursError) throw hoursError;

      const nextSites = (data || []).map((site) => ({
        ...site,
        opening_hours: normalizeOpeningHours(
          site.opening_hours,
          site.site_id,
        ).hours,
      }));

      setSites(nextSites);
      setSelectedSiteId((prev) => prev || nextSites[0]?.site_id || "");
    } catch (err) {
      console.error("appointment hours admin: load failed", err);
      setError(err?.message || "Could not load appointment hours.");
      setSites([]);
      setSelectedSiteId("");
      setDraftHours(blankHours());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  React.useEffect(() => {
    setDraftHours(selectedSite?.opening_hours || blankHours());
  }, [selectedSite]);

  function updateDay(dayKey, changes) {
    setDraftHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        ...changes,
      },
    }));
  }

  async function saveHours(e) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!isAdmin) {
      setError("Only admins can manage appointment hours.");
      return;
    }

    if (!selectedSiteId) {
      setError("Choose a site first.");
      return;
    }

    for (const { value } of APPOINTMENT_HOURS_DAY_OPTIONS) {
      const day = draftHours[String(value)];
      if (day?.is_closed) continue;
      if (!day?.open_time || !day?.close_time) {
        setError("Open and close times are required for open days.");
        return;
      }
      if (day.close_time <= day.open_time) {
        setError("Closing time must be after opening time.");
        return;
      }
    }

    setSaving(true);
    try {
      const openingHoursPayload = buildOpeningHoursSavePayload(
        draftHours,
        selectedSiteId,
      );
      const { error: saveError } = await supabase.rpc(
        "save_appointment_site_hours_admin",
        {
          p_site_id: selectedSiteId,
          p_opening_hours: openingHoursPayload,
        },
      );

      if (saveError) throw saveError;

      setSuccessMessage("Appointment hours saved.");
      await loadAll();
    } catch (err) {
      console.error("appointment hours admin: save failed", err);
      setError(err?.message || "Could not save appointment hours.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading appointment hours...</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, color: ui.colors.text }}>
        Only admins can manage appointment hours.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 24,
        display: "grid",
        gap: 18,
        background: ui.colors.pageBg,
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      <div>
        <div style={{ fontSize: 28, fontWeight: 900, color: ui.colors.text }}>
          Appointment Hours
        </div>
        <div style={ui.text.subtitle}>
          Manage bookable opening hours for appointment sites.
        </div>
      </div>

      <form
        onSubmit={saveHours}
        style={{
          display: "grid",
          gap: 18,
          maxWidth: 960,
          padding: 20,
          borderRadius: ui.radius.lg,
          border: `1px solid ${ui.colors.border}`,
          background: ui.colors.cardBg,
          boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
        }}
      >
        <label style={{ display: "grid", gap: 8, fontWeight: 800, color: ui.colors.text }}>
          <span>Site</span>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            style={inputStyle}
          >
            {sites.map((site) => (
              <option key={site.site_id} value={site.site_id}>
                {site.site_name}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            display: "grid",
            gap: 10,
            borderRadius: ui.radius.md,
            border: `1px solid ${ui.colors.border}`,
            background: "rgba(248, 250, 252, 0.75)",
            padding: 14,
          }}
        >
          {APPOINTMENT_HOURS_DAY_OPTIONS.map((day) => {
            const dayKey = String(day.value);
            const value = draftHours[dayKey] || {
              is_closed: false,
              open_time: "",
              close_time: "",
            };

            return (
              <div
                key={dayKey}
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 120px minmax(120px, 160px) minmax(120px, 160px)",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800, color: ui.colors.text }}>{day.label}</div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    color: ui.colors.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!value.is_closed}
                    onChange={(e) =>
                      updateDay(dayKey, {
                        is_closed: e.target.checked,
                        open_time: e.target.checked ? "" : value.open_time || "09:30",
                        close_time: e.target.checked ? "" : value.close_time || "17:30",
                      })
                    }
                  />
                  Closed
                </label>

                <input
                  type="time"
                  value={value.open_time || ""}
                  disabled={value.is_closed}
                  onChange={(e) => updateDay(dayKey, { open_time: e.target.value })}
                  style={inputStyle}
                />

                <input
                  type="time"
                  value={value.close_time || ""}
                  disabled={value.is_closed}
                  onChange={(e) => updateDay(dayKey, { close_time: e.target.value })}
                  style={inputStyle}
                />
              </div>
            );
          })}
        </div>

        {selectedSite?.source === "fallback" ? (
          <div
            style={{
              padding: 12,
              borderRadius: ui.radius.md,
              border: `1px solid ${ui.colors.border}`,
              background: "rgba(245, 158, 11, 0.08)",
              color: ui.colors.text,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            This site is currently using fallback appointment hours until saved.
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              padding: 12,
              borderRadius: ui.radius.md,
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.08)",
              color: ui.colors.text,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div
            style={{
              padding: 12,
              borderRadius: ui.radius.md,
              border: "1px solid rgba(16,185,129,0.35)",
              background: "rgba(16,185,129,0.08)",
              color: ui.colors.text,
              fontWeight: 700,
            }}
          >
            {successMessage}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 16px",
              borderRadius: ui.radius.md,
              border: `1px solid ${ui.colors.border}`,
              background: ui.colors.cardBg,
              color: ui.colors.text,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            {saving ? "Saving..." : "Save hours"}
          </button>
        </div>
      </form>
    </div>
  );
}
