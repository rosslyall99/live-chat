import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import { invokeAuthed } from "../lib/invokeAuthed";
import {
  appointmentBranchToSiteId,
  getBookableAppointmentSites,
  getDefaultAppointmentSiteId,
  isBookableAppointmentSite,
  prettySiteName,
  siteIdToAppointmentBranch,
} from "../lib/branches";

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 18;
const HOUR_HEIGHT = 72;
const TIME_OPTION_INTERVAL_MINUTES = 15;

function todayInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function tomorrowInputValue() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inputDateValueFromIso(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inputTimeValueFromIso(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
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

function formatTimeLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTimeLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    ...times.map((date) => date.getHours() + (date.getMinutes() > 0 ? 1 : 0)),
  );

  return {
    startHour: clamp(minHour - 1, 7, 20),
    endHour: clamp(Math.max(maxHour + 1, DEFAULT_END_HOUR), 8, 22),
  };
}

function toPosition(iso, startHour) {
  const date = new Date(iso);
  return (
    (((date.getHours() - startHour) * 60 + date.getMinutes()) / 60) *
    HOUR_HEIGHT
  );
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

function buildTimeOptions(
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
) {
  const items = [];
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  for (
    let minutes = startMinutes;
    minutes <= endMinutes;
    minutes += TIME_OPTION_INTERVAL_MINUTES
  ) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    items.push(`${hh}:${mm}`);
  }

  return items;
}

function areaSlotNumber(name) {
  const match = String(name || "")
    .trim()
    .match(/^(area|column)\s+(\d+)$/i);
  if (!match) return null;
  return Number(match[2]);
}

function isAreaName(name) {
  return /^area\s+\d+$/i.test(String(name || "").trim());
}

function canonicalAreaLabel(area) {
  const slot = areaSlotNumber(area?.name);
  if (!slot) return area?.name || "Area";
  return `Area ${slot}`;
}

function dedupeAreas(rows = []) {
  const canonical = new Map();
  const extras = [];

  for (const row of rows || []) {
    const slot = areaSlotNumber(row?.name);
    if (!slot) {
      extras.push(row);
      continue;
    }

    const existing = canonical.get(slot);
    if (!existing) {
      canonical.set(slot, row);
      continue;
    }

    const nextWins = isAreaName(row?.name) && !isAreaName(existing?.name);
    if (nextWins) {
      canonical.set(slot, row);
    }
  }

  return [
    ...Array.from(canonical.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value),
    ...extras.sort((a, b) => {
      const aSort = Number(a?.sort_order ?? 9999);
      const bSort = Number(b?.sort_order ?? 9999);
      if (aSort !== bSort) return aSort - bSort;
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    }),
  ];
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

function toDateTimeIso(dateString, timeString) {
  return new Date(`${dateString}T${timeString}:00`).toISOString();
}

function isWithinSelectedDay(dateString, isoValue) {
  return inputDateValueFromIso(isoValue) === dateString;
}

function rangesOverlap(startA, endA, startB, endB) {
  return (
    new Date(startA).getTime() < new Date(endB).getTime() &&
    new Date(endA).getTime() > new Date(startB).getTime()
  );
}

function buildInitialForm({ siteId, date }) {
  return {
    siteId: siteId || "",
    date: date || todayInputValue(),
    areaId: "",
    appointmentTypeId: "",
    startTime: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    internalNotes: "",
    sendConfirmationAfterSave: true,
  };
}

function buildDetailForm(appointment, siteId) {
  return {
    siteId: siteId || "",
    date: inputDateValueFromIso(appointment?.start_at),
    areaId: appointment?.area_id || "",
    appointmentTypeId: appointment?.appointment_type_id || "",
    startTime: inputTimeValueFromIso(appointment?.start_at),
    customerName: appointment?.customer_name || "",
    customerEmail: appointment?.customer_email || "",
    customerPhone: appointment?.customer_phone || "",
    internalNotes: appointment?.internal_notes || "",
  };
}

function buildInitialBlockForm({ siteId, date }) {
  return {
    siteId: siteId || "",
    date: date || todayInputValue(),
    areaId: "",
    startTime: "",
    endTime: "",
    reason: "",
  };
}

function buildBlockDetailForm(block, siteId) {
  return {
    siteId: siteId || "",
    date: inputDateValueFromIso(block?.start_at),
    areaId: block?.area_id || "",
    startTime: inputTimeValueFromIso(block?.start_at),
    endTime: inputTimeValueFromIso(block?.end_at),
    reason: block?.reason || "",
  };
}

function readErrorMessage(err, fallback) {
  return err?.message || err?.error_description || fallback;
}

function isLikelyEmail(value) {
  const email = String(value || "").trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeAuditComparable(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function describeActivity(row) {
  if (!row) return "";
  if (row.action === "created") return "Appointment created.";
  if (row.action === "cancelled") return "Appointment cancelled.";
  if (row.action === "confirmation_sent") return "Confirmation email sent.";
  if (row.action === "reminder_sent") return "Reminder email sent.";

  const beforeData = row.before_data || {};
  const afterData = row.after_data || {};
  const fields = [
    ["customer_name", "customer name"],
    ["customer_email", "customer email"],
    ["customer_phone", "customer phone"],
    ["appointment_type_id", "appointment type"],
    ["area_id", "area / resource"],
    ["start_at", "start time"],
    ["end_at", "end time"],
    ["internal_notes", "internal notes"],
  ];

  const changedLabels = fields
    .filter(
      ([key]) =>
        normalizeAuditComparable(beforeData[key]) !==
        normalizeAuditComparable(afterData[key]),
    )
    .map(([, label]) => label);

  if (changedLabels.length === 0) return "Appointment updated.";
  return `Changed ${changedLabels.join(", ")}.`;
}

function activityActionLabel(action) {
  if (!action) return "Activity";
  return String(action).replaceAll("_", " ");
}

function describeBlockActivity(row) {
  if (!row) return "";
  if (row.action === "created") return "Block created.";
  if (row.action === "cancelled") return "Block cancelled.";

  const beforeData = row.before_data || {};
  const afterData = row.after_data || {};
  const fields = [
    ["area_id", "scope"],
    ["start_at", "start time"],
    ["end_at", "end time"],
    ["reason", "reason"],
  ];

  const changedLabels = fields
    .filter(
      ([key]) =>
        normalizeAuditComparable(beforeData[key]) !==
        normalizeAuditComparable(afterData[key]),
    )
    .map(([, label]) => label);

  if (changedLabels.length === 0) return "Block updated.";
  return `Changed ${changedLabels.join(", ")}.`;
}

function TimelineItem({ item, type, startHour, typesById, onClick }) {
  const top = toPosition(item.start_at, startHour);
  const height = itemHeight(item.start_at, item.end_at);
  const isBlock = type === "block";
  const bookedBy = bookedByLabel(item);
  const blockLabel = item.area_id ? "Blocked" : "Whole site blocked";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        top,
        minHeight: height,
        borderRadius: 12,
        border: isBlock
          ? "1px solid rgba(100,116,139,0.45)"
          : "1px solid rgba(59,130,246,0.28)",
        background: isBlock
          ? "repeating-linear-gradient(-45deg, rgba(148,163,184,0.2), rgba(148,163,184,0.2) 8px, rgba(100,116,139,0.12) 8px, rgba(100,116,139,0.12) 16px)"
          : "rgba(59,130,246,0.14)",
        padding: 8,
        boxSizing: "border-box",
        overflow: "hidden",
        boxShadow: isBlock
          ? "inset 0 0 0 1px rgba(255,255,255,0.25)"
          : "0 4px 10px rgba(59,130,246,0.10)",
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        fontFamily: ui.font.ui,
      }}
      title={
        isBlock
          ? `${blockLabel}${item.reason ? `: ${item.reason}` : ""}`
          : item.customer_name
      }
    >
      <div style={{ fontSize: 11, fontWeight: 900, color: ui.colors.muted }}>
        {formatTimeRange(item.start_at, item.end_at)}
      </div>

      <div style={{ marginTop: 4, fontWeight: 900, color: ui.colors.text }}>
        {isBlock ? blockLabel : item.customer_name || "Unnamed customer"}
      </div>

      {isBlock ? (
        <div style={{ marginTop: 4, fontSize: 12, color: ui.colors.text }}>
          {item.reason || "Unavailable"}
        </div>
      ) : (
        <div style={{ marginTop: 4, fontSize: 12, color: ui.colors.text }}>
          {appointmentTypeLabel(item, typesById)}
        </div>
      )}

      {!isBlock && bookedBy ? (
        <div style={{ marginTop: 4, fontSize: 11, color: ui.colors.muted }}>
          Booked by {bookedBy}
        </div>
      ) : null}
    </button>
  );
}

function ModalShell({ title, subtitle, onClose, children, maxWidth = 720 }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflow: "auto",
          background: ui.colors.cardBg,
          border: `1px solid ${ui.colors.border}`,
          borderRadius: ui.radius.lg,
          boxShadow: ui.shadow.card,
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: `1px solid ${ui.colors.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
            {subtitle ? <div style={ui.text.subtitle}>{subtitle}</div> : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: ui.radius.md,
              border: `1px solid ${ui.colors.border}`,
              background: ui.colors.cardBg,
              color: ui.colors.text,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Close
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function FieldValue({ label, value }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        background: "rgba(2, 6, 23, 0.03)",
        border: `1px solid ${ui.colors.border}`,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: ui.colors.muted }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontWeight: 700, color: ui.colors.text }}>
        {value || "Not provided"}
      </div>
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
  const [appointmentTypes, setAppointmentTypes] = React.useState([]);
  const [typesById, setTypesById] = React.useState({});

  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savePhase, setSavePhase] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [formNotice, setFormNotice] = React.useState("");
  const [formNoticeTone, setFormNoticeTone] = React.useState("success");
  const [modalAreas, setModalAreas] = React.useState([]);
  const [modalAreasLoading, setModalAreasLoading] = React.useState(false);
  const [form, setForm] = React.useState(() => buildInitialForm({}));
  const [createSendConfirmationTouched, setCreateSendConfirmationTouched] =
    React.useState(false);

  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailEditing, setDetailEditing] = React.useState(false);
  const [detailSaving, setDetailSaving] = React.useState(false);
  const [detailError, setDetailError] = React.useState("");
  const [detailAppointment, setDetailAppointment] = React.useState(null);
  const [detailForm, setDetailForm] = React.useState(() =>
    buildInitialForm({}),
  );
  const [activityRows, setActivityRows] = React.useState([]);
  const [activityLoading, setActivityLoading] = React.useState(false);
  const [activityError, setActivityError] = React.useState("");
  const [emailLogRows, setEmailLogRows] = React.useState([]);
  const [emailLogLoading, setEmailLogLoading] = React.useState(false);
  const [emailLogError, setEmailLogError] = React.useState("");
  const [sendingConfirmation, setSendingConfirmation] = React.useState(false);
  const [sendConfirmationMessage, setSendConfirmationMessage] =
    React.useState("");
  const [sendingReminder, setSendingReminder] = React.useState(false);
  const [sendReminderMessage, setSendReminderMessage] = React.useState("");
  const [reminderBatchDate, setReminderBatchDate] = React.useState(() =>
    tomorrowInputValue(),
  );
  const [reminderBatchSiteId, setReminderBatchSiteId] = React.useState("");
  const [reminderBatchRows, setReminderBatchRows] = React.useState([]);
  const [reminderBatchSummary, setReminderBatchSummary] = React.useState(null);
  const [reminderBatchError, setReminderBatchError] = React.useState("");
  const [reminderBatchMessage, setReminderBatchMessage] = React.useState("");
  const [reminderBatchLoading, setReminderBatchLoading] = React.useState(false);
  const [reminderBatchSending, setReminderBatchSending] = React.useState(false);

  const [blockModalOpen, setBlockModalOpen] = React.useState(false);
  const [blockSaving, setBlockSaving] = React.useState(false);
  const [blockFormError, setBlockFormError] = React.useState("");
  const [blockModalAreas, setBlockModalAreas] = React.useState([]);
  const [blockModalAreasLoading, setBlockModalAreasLoading] =
    React.useState(false);
  const [blockForm, setBlockForm] = React.useState(() =>
    buildInitialBlockForm({}),
  );

  const [blockDetailOpen, setBlockDetailOpen] = React.useState(false);
  const [blockDetailEditing, setBlockDetailEditing] = React.useState(false);
  const [blockDetailSaving, setBlockDetailSaving] = React.useState(false);
  const [blockDetailError, setBlockDetailError] = React.useState("");
  const [detailBlock, setDetailBlock] = React.useState(null);
  const [detailBlockForm, setDetailBlockForm] = React.useState(() =>
    buildInitialBlockForm({}),
  );
  const [blockActivityRows, setBlockActivityRows] = React.useState([]);
  const [blockActivityLoading, setBlockActivityLoading] = React.useState(false);
  const [blockActivityError, setBlockActivityError] = React.useState("");

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const showSiteSelector = isAdmin || isManager;
  const canManageBlocks = isAdmin || isManager;
  const canManageReminderBatch = isAdmin || isManager;
  const bookableSites = React.useMemo(
    () => getBookableAppointmentSites(sites),
    [sites],
  );
  const selectedSiteIsBookable = isBookableAppointmentSite(selectedSiteId);
  const canOpenCreate = selectedSiteIsBookable && appointmentTypes.length > 0;
  const canOpenBlock = canManageBlocks && selectedSiteIsBookable;
  const canAutoSendConfirmationOnCreate = isLikelyEmail(form.customerEmail);
  const reminderBatchSiteOptions = React.useMemo(() => {
    if (isAdmin) return bookableSites;
    if (profile?.site_id && isBookableAppointmentSite(profile.site_id)) {
      const matched = bookableSites.find((site) => site.id === profile.site_id);
      return matched
        ? [matched]
        : [{ id: profile.site_id, name: prettySiteName(profile.site_id) }];
    }
    return [];
  }, [bookableSites, isAdmin, profile?.site_id]);
  const effectiveReminderBatchSiteId = isAdmin
    ? reminderBatchSiteId
    : profile?.site_id || "";

  const baseInputStyle = React.useMemo(
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

  const loadAreasForSite = React.useCallback(async (siteId) => {
    const branchCode = siteIdToAppointmentBranch(siteId);
    if (!branchCode) return [];

    const { data, error: loadError } = await supabase
      .from("appointment_areas")
      .select("id, branch, name, sort_order, is_active")
      .eq("branch", branchCode)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (loadError) throw loadError;
    return dedupeAreas(data || []);
  }, []);

  const loadCalendar = React.useCallback(
    async (siteIdParam, dateParam) => {
      if (!siteIdParam || !profile?.site_id) return;

      setLoading(true);
      setError("");
      setBlockWarning("");
      setCalendarWarning("");

      const branchCode = siteIdToAppointmentBranch(siteIdParam);
      if (!branchCode) {
        setAreas([]);
        setAppointments([]);
        setBlocks([]);
        setError(
          `Appointments are not available for ${prettySiteName(siteIdParam)}.`,
        );
        setLoading(false);
        return;
      }

      try {
        const areasReq = loadAreasForSite(siteIdParam);
        const typesReq = supabase
          .from("appointment_types")
          .select("id, name, duration_minutes, is_active, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        const calendarReq = supabase.rpc("get_calendar_day_agent", {
          p_branch: branchCode,
          p_day: dateParam,
        });

        const blocksReq = supabase.rpc("get_blocks_day_agent", {
          p_branch: branchCode,
          p_day: dateParam,
        });

        const [areasRes, typesRes, calendarRes, blocksRes] =
          await Promise.allSettled([
            areasReq,
            typesReq,
            calendarReq,
            blocksReq,
          ]);

        if (areasRes.status === "fulfilled") {
          setAreas(areasRes.value);
        } else {
          throw areasRes.reason;
        }

        if (typesRes.status === "fulfilled") {
          if (typesRes.value.error) {
            console.error(
              "appointments: types load failed",
              typesRes.value.error,
            );
            setAppointmentTypes([]);
            setTypesById({});
          } else {
            const nextTypes = typesRes.value.data || [];
            const map = {};
            for (const item of nextTypes) map[item.id] = item;
            setAppointmentTypes(nextTypes);
            setTypesById(map);
          }
        } else {
          console.error("appointments: types load failed", typesRes.reason);
          setAppointmentTypes([]);
          setTypesById({});
        }

        if (calendarRes.status === "fulfilled") {
          if (calendarRes.value.error) {
            console.error(
              "appointments: get_calendar_day_agent failed",
              calendarRes.value.error,
            );
            setAppointments([]);
            setCalendarWarning(
              "Calendar appointments could not be loaded from the existing appointment RPC.",
            );
          } else {
            setAppointments(calendarRes.value.data || []);
          }
        } else {
          console.error(
            "appointments: get_calendar_day_agent crashed",
            calendarRes.reason,
          );
          setAppointments([]);
          setCalendarWarning(
            "Calendar appointments could not be loaded from the existing appointment RPC.",
          );
        }

        if (blocksRes.status === "fulfilled") {
          if (blocksRes.value.error) {
            console.error(
              "appointments: get_blocks_day_agent failed",
              blocksRes.value.error,
            );
            setBlocks([]);
            setBlockWarning(
              "Blocked-out periods could not be loaded for this date.",
            );
          } else {
            setBlocks(blocksRes.value.data || []);
          }
        } else {
          console.error(
            "appointments: get_blocks_day_agent crashed",
            blocksRes.reason,
          );
          setBlocks([]);
          setBlockWarning(
            "Blocked-out periods could not be loaded for this date.",
          );
        }
      } catch (err) {
        console.error("appointments: load failed", err);
        setAreas([]);
        setAppointments([]);
        setBlocks([]);
        setError(readErrorMessage(err, "Could not load appointment calendar."));
      } finally {
        setLoading(false);
      }
    },
    [loadAreasForSite, profile?.site_id],
  );

  const loadActivity = React.useCallback(async (appointmentId) => {
    if (!appointmentId) {
      setActivityRows([]);
      setActivityError("");
      return;
    }

    setActivityLoading(true);
    setActivityError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_appointment_audit_staff",
        {
          p_appointment_id: appointmentId,
        },
      );

      if (rpcError) throw rpcError;
      setActivityRows(data || []);
    } catch (err) {
      console.error("appointments: activity load failed", err);
      setActivityRows([]);
      setActivityError("Activity history could not be loaded.");
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadBlockActivity = React.useCallback(async (blockId) => {
    if (!blockId) {
      setBlockActivityRows([]);
      setBlockActivityError("");
      return;
    }

    setBlockActivityLoading(true);
    setBlockActivityError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_appointment_block_audit_staff",
        {
          p_block_id: blockId,
        },
      );

      if (rpcError) throw rpcError;
      setBlockActivityRows(data || []);
    } catch (err) {
      console.error("appointments: block activity load failed", err);
      setBlockActivityRows([]);
      setBlockActivityError("Block activity history could not be loaded.");
    } finally {
      setBlockActivityLoading(false);
    }
  }, []);

  const loadEmailLog = React.useCallback(async (appointmentId) => {
    if (!appointmentId) {
      setEmailLogRows([]);
      setEmailLogError("");
      return;
    }

    setEmailLogLoading(true);
    setEmailLogError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_appointment_email_log_staff",
        {
          p_appointment_id: appointmentId,
        },
      );

      if (rpcError) throw rpcError;
      setEmailLogRows(data || []);
    } catch (err) {
      console.error("appointments: email log load failed", err);
      setEmailLogRows([]);
      setEmailLogError("Email send history could not be loaded.");
    } finally {
      setEmailLogLoading(false);
    }
  }, []);

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
  }, [profile?.site_id, selectedSiteIsBookable, showSiteSelector, sites]);

  React.useEffect(() => {
    if (!canManageReminderBatch) return;

    if (isAdmin) {
      if (isBookableAppointmentSite(selectedSiteId)) {
        setReminderBatchSiteId((prev) => prev || selectedSiteId);
        return;
      }

      if (reminderBatchSiteOptions.length > 0) {
        setReminderBatchSiteId(
          (prev) => prev || reminderBatchSiteOptions[0].id,
        );
      }

      return;
    }

    if (profile?.site_id && isBookableAppointmentSite(profile.site_id)) {
      setReminderBatchSiteId(profile.site_id);
    }
  }, [
    canManageReminderBatch,
    isAdmin,
    profile?.site_id,
    reminderBatchSiteOptions,
    selectedSiteId,
  ]);

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

        const safeSites = siteRows?.length
          ? siteRows
          : [
              {
                id: ownProfile.site_id,
                name: prettySiteName(ownProfile.site_id),
              },
            ];

        const preferredSiteId =
          nextRole === "admin" || nextRole === "manager"
            ? getDefaultAppointmentSiteId({
                sites: safeSites,
                preferredSiteId: ownProfile.site_id,
                allowFallback: true,
              })
            : ownProfile.site_id || "";

        setProfile(ownProfile);
        setRole(nextRole);
        setSites(safeSites);
        setSelectedSiteId((prev) => prev || preferredSiteId);
      } catch (err) {
        console.error("appointments: bootstrap failed", err);
        if (!cancelled) {
          setError(readErrorMessage(err, "Could not load appointment access."));
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
    if (!selectedSiteId || !profile?.site_id) return;
    loadCalendar(selectedSiteId, selectedDate);
  }, [loadCalendar, profile?.site_id, selectedDate, selectedSiteId]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadModalAreas() {
      if (!modalOpen) return;
      if (!form.siteId) {
        setModalAreas([]);
        return;
      }

      if (!isBookableAppointmentSite(form.siteId)) {
        setModalAreas([]);
        return;
      }

      setModalAreasLoading(true);
      try {
        const nextAreas =
          form.siteId === selectedSiteId
            ? areas
            : await loadAreasForSite(form.siteId);

        if (cancelled) return;
        setModalAreas(nextAreas);
        setForm((prev) => {
          if (nextAreas.some((item) => item.id === prev.areaId)) return prev;
          return { ...prev, areaId: nextAreas[0]?.id || "" };
        });
      } catch (err) {
        console.error("appointments: modal areas load failed", err);
        if (!cancelled) {
          setModalAreas([]);
          setFormError("Could not load appointment areas for that site.");
        }
      } finally {
        if (!cancelled) setModalAreasLoading(false);
      }
    }

    loadModalAreas();

    return () => {
      cancelled = true;
    };
  }, [areas, form.siteId, loadAreasForSite, modalOpen, selectedSiteId]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadBlockModalAreas() {
      if (!blockModalOpen) return;
      if (!blockForm.siteId || !isBookableAppointmentSite(blockForm.siteId)) {
        setBlockModalAreas([]);
        return;
      }

      setBlockModalAreasLoading(true);
      try {
        const nextAreas =
          blockForm.siteId === selectedSiteId
            ? areas
            : await loadAreasForSite(blockForm.siteId);

        if (cancelled) return;
        setBlockModalAreas(nextAreas);
        setBlockForm((prev) => {
          if (!prev.areaId) return prev;
          if (nextAreas.some((item) => item.id === prev.areaId)) return prev;
          return { ...prev, areaId: "" };
        });
      } catch (err) {
        console.error("appointments: block modal areas load failed", err);
        if (!cancelled) {
          setBlockModalAreas([]);
          setBlockFormError("Could not load appointment areas for that site.");
        }
      } finally {
        if (!cancelled) setBlockModalAreasLoading(false);
      }
    }

    loadBlockModalAreas();

    return () => {
      cancelled = true;
    };
  }, [
    areas,
    blockForm.siteId,
    blockModalOpen,
    loadAreasForSite,
    selectedSiteId,
  ]);

  const visibleSiteName = React.useMemo(
    () => prettySiteName(selectedSiteId || profile?.site_id),
    [profile?.site_id, selectedSiteId],
  );

  const timeline = React.useMemo(
    () => buildVisibleWindow(appointments, blocks),
    [appointments, blocks],
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
      const key = item.area_id || "__branch__";
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [blocks, areas]);

  const pageTitle = `Appointments${visibleSiteName ? ` - ${visibleSiteName}` : ""}`;
  const selectorSites = showSiteSelector ? bookableSites : sites;
  const timeOptions = React.useMemo(
    () => buildTimeOptions(DEFAULT_START_HOUR, DEFAULT_END_HOUR),
    [],
  );
  const selectedType =
    appointmentTypes.find((item) => item.id === form.appointmentTypeId) || null;
  const detailSelectedType =
    appointmentTypes.find((item) => item.id === detailForm.appointmentTypeId) ||
    null;

  const calculatedEndTimeLabel =
    form.startTime && selectedType
      ? formatTimeRange(
          toDateTimeIso(form.date, form.startTime),
          new Date(
            new Date(toDateTimeIso(form.date, form.startTime)).getTime() +
              selectedType.duration_minutes * 60000,
          ).toISOString(),
        ).split(" - ")[1]
      : "";

  const detailEndTimeLabel =
    detailForm.startTime && detailSelectedType
      ? formatTimeRange(
          toDateTimeIso(detailForm.date, detailForm.startTime),
          new Date(
            new Date(
              toDateTimeIso(detailForm.date, detailForm.startTime),
            ).getTime() +
              detailSelectedType.duration_minutes * 60000,
          ).toISOString(),
        ).split(" - ")[1]
      : "";

  const detailSiteId = detailAppointment
    ? appointmentBranchToSiteId(detailAppointment.branch) || selectedSiteId
    : selectedSiteId;

  const detailArea = React.useMemo(
    () => areas.find((item) => item.id === detailAppointment?.area_id) || null,
    [areas, detailAppointment],
  );

  const detailLastChange = React.useMemo(
    () =>
      activityRows.find(
        (row) => row.action === "updated" || row.action === "cancelled",
      ) || null,
    [activityRows],
  );

  const latestConfirmationEmail = React.useMemo(
    () =>
      emailLogRows.find(
        (row) => row.email_type === "confirmation" && row.status === "sent",
      ) || null,
    [emailLogRows],
  );

  const detailBlockSiteId = detailBlock
    ? appointmentBranchToSiteId(detailBlock.branch) || selectedSiteId
    : selectedSiteId;

  const detailBlockArea = React.useMemo(
    () => areas.find((item) => item.id === detailBlock?.area_id) || null,
    [areas, detailBlock],
  );

  const detailBlockLastChange = React.useMemo(
    () =>
      blockActivityRows.find(
        (row) => row.action === "updated" || row.action === "cancelled",
      ) || null,
    [blockActivityRows],
  );

  const canManageSelectedAppointment = React.useMemo(() => {
    if (!detailAppointment || !profile) return false;
    return role === "admin" || role === "manager" || role === "agent";
  }, [detailAppointment, profile, role]);

  const canSendConfirmation = React.useMemo(() => {
    if (!detailAppointment) return false;
    if (!canManageSelectedAppointment) return false;
    if (detailAppointment.status === "cancelled") return false;
    return !!String(detailAppointment.customer_email || "").trim();
  }, [canManageSelectedAppointment, detailAppointment]);

  const canSendReminder = React.useMemo(() => {
    if (!detailAppointment) return false;
    if (!canManageSelectedAppointment) return false;
    if (detailAppointment.status === "cancelled") return false;
    return !!String(detailAppointment.customer_email || "").trim();
  }, [canManageSelectedAppointment, detailAppointment]);

  const canManageSelectedBlock = React.useMemo(() => {
    if (!detailBlock || !profile) return false;
    return role === "admin" || role === "manager";
  }, [detailBlock, profile, role]);

  function openCreateModal() {
    setForm(buildInitialForm({ siteId: selectedSiteId, date: selectedDate }));
    setFormError("");
    setFormNotice("");
    setCreateSendConfirmationTouched(false);
    setSavePhase("");
    setModalAreas(areas);
    setModalOpen(true);
  }

  function closeCreateModal() {
    setModalOpen(false);
    setSaving(false);
    setSavePhase("");
    setFormError("");
  }

  function openBlockModal() {
    setBlockForm(
      buildInitialBlockForm({ siteId: selectedSiteId, date: selectedDate }),
    );
    setBlockFormError("");
    setBlockModalAreas(areas);
    setBlockModalOpen(true);
  }

  function closeBlockModal() {
    setBlockModalOpen(false);
    setBlockSaving(false);
    setBlockFormError("");
  }

  function openDetailModal(item) {
    const nextSiteId = appointmentBranchToSiteId(item.branch) || selectedSiteId;
    setDetailAppointment(item);
    setDetailForm(buildDetailForm(item, nextSiteId));
    setDetailError("");
    setSendConfirmationMessage("");
    setSendReminderMessage("");
    setDetailEditing(false);
    setDetailOpen(true);
    loadActivity(item.id);
    loadEmailLog(item.id);
  }

  function openBlockDetailModal(item) {
    const nextSiteId = appointmentBranchToSiteId(item.branch) || selectedSiteId;
    setDetailBlock(item);
    setDetailBlockForm(buildBlockDetailForm(item, nextSiteId));
    setBlockDetailError("");
    setBlockDetailEditing(false);
    setBlockDetailOpen(true);
    loadBlockActivity(item.id);
  }

  function closeDetailModal() {
    setDetailOpen(false);
    setDetailEditing(false);
    setDetailSaving(false);
    setDetailError("");
    setDetailAppointment(null);
    setActivityRows([]);
    setActivityError("");
    setEmailLogRows([]);
    setEmailLogError("");
    setSendingConfirmation(false);
    setSendConfirmationMessage("");
    setSendingReminder(false);
    setSendReminderMessage("");
  }

  function closeBlockDetailModal() {
    setBlockDetailOpen(false);
    setBlockDetailEditing(false);
    setBlockDetailSaving(false);
    setBlockDetailError("");
    setDetailBlock(null);
    setBlockActivityRows([]);
    setBlockActivityError("");
  }

  function updateForm(key, value) {
    if (key === "customerEmail") {
      setForm((prev) => {
        const nextEmail = value;
        const nextIsValid = isLikelyEmail(nextEmail);
        const previousIsValid = isLikelyEmail(prev.customerEmail);
        const nextSendConfirmationAfterSave = !nextIsValid
          ? false
          : prev.sendConfirmationAfterSave ||
            (!createSendConfirmationTouched && !previousIsValid);

        return {
          ...prev,
          customerEmail: nextEmail,
          sendConfirmationAfterSave: nextSendConfirmationAfterSave,
        };
      });
      return;
    }

    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDetailForm(key, value) {
    setDetailForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateBlockForm(key, value) {
    setBlockForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDetailBlockForm(key, value) {
    setDetailBlockForm((prev) => ({ ...prev, [key]: value }));
  }

  function findLocalConflict(
    nextAreaId,
    nextStartAt,
    nextEndAt,
    excludedAppointmentId = "",
  ) {
    const compareSiteId = detailOpen ? detailSiteId : form.siteId;
    const compareDate = detailOpen ? detailForm.date : form.date;
    if (compareSiteId !== selectedSiteId || compareDate !== selectedDate)
      return "";

    const overlappingAppointment = appointments.find((item) => {
      if (item.id === excludedAppointmentId) return false;
      if (item.area_id !== nextAreaId) return false;
      return rangesOverlap(nextStartAt, nextEndAt, item.start_at, item.end_at);
    });

    if (overlappingAppointment) {
      return "That appointment overlaps an existing booking in this area.";
    }

    const overlappingBlock = blocks.find((item) => {
      const isAreaMatch = item.area_id === nextAreaId;
      const isBranchWide = !item.area_id;
      if (!isAreaMatch && !isBranchWide) return false;
      return rangesOverlap(nextStartAt, nextEndAt, item.start_at, item.end_at);
    });

    if (overlappingBlock) {
      return "That appointment overlaps a blocked-out period.";
    }

    return "";
  }

  function findLocalBlockConflict(
    nextAreaId,
    nextStartAt,
    nextEndAt,
    excludedBlockId = "",
    compareSiteId = selectedSiteId,
    compareDate = selectedDate,
  ) {
    if (compareSiteId !== selectedSiteId || compareDate !== selectedDate)
      return "";

    const overlappingAppointment = appointments.find((item) => {
      if (nextAreaId && item.area_id !== nextAreaId) return false;
      return rangesOverlap(nextStartAt, nextEndAt, item.start_at, item.end_at);
    });

    if (overlappingAppointment) {
      return "That block overlaps an existing appointment.";
    }

    const overlappingBlock = blocks.find((item) => {
      if (item.id === excludedBlockId) return false;
      const areaMatch =
        !nextAreaId || !item.area_id || item.area_id === nextAreaId;
      if (!areaMatch) return false;
      return rangesOverlap(nextStartAt, nextEndAt, item.start_at, item.end_at);
    });

    if (overlappingBlock) {
      return "That block overlaps an existing block.";
    }

    return "";
  }

  async function submitCreateAppointment(e) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    setFormNotice("");

    if (!form.customerName.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    if (!form.customerEmail.trim()) {
      setFormError("Customer email is required.");
      return;
    }
    if (!form.appointmentTypeId) {
      setFormError("Appointment type is required.");
      return;
    }
    if (!form.areaId) {
      setFormError("Appointment area is required.");
      return;
    }
    if (!form.startTime) {
      setFormError("Start time is required.");
      return;
    }
    if (!isBookableAppointmentSite(form.siteId)) {
      setFormError(
        "Appointments can only be created for Duke Street or St Enoch.",
      );
      return;
    }

    const typeRow = appointmentTypes.find(
      (item) => item.id === form.appointmentTypeId,
    );
    if (!typeRow) {
      setFormError("The selected appointment type is not available.");
      return;
    }

    const startAt = toDateTimeIso(form.date, form.startTime);
    if (!isWithinSelectedDay(form.date, startAt)) {
      setFormError("Start time must stay within the selected calendar day.");
      return;
    }

    const endAt = new Date(
      new Date(startAt).getTime() + typeRow.duration_minutes * 60000,
    ).toISOString();

    const localConflict = findLocalConflict(form.areaId, startAt, endAt);
    if (localConflict) {
      setFormError(localConflict);
      return;
    }

    setSaving(true);
    setSavePhase("saving");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "create_appointment_staff",
        {
          p_site_id: form.siteId,
          p_area_id: form.areaId,
          p_appointment_type_id: form.appointmentTypeId,
          p_start_at: startAt,
          p_customer_name: form.customerName.trim(),
          p_customer_email: form.customerEmail.trim(),
          p_customer_phone: form.customerPhone.trim() || null,
          p_internal_notes: form.internalNotes.trim() || null,
        },
      );

      if (rpcError) throw rpcError;
      if (!data || data.length === 0) {
        throw new Error("The appointment could not be created.");
      }

      const createdAppointment = Array.isArray(data) ? data[0] : data;

      if (form.sendConfirmationAfterSave && isLikelyEmail(form.customerEmail)) {
        setSavePhase("sending_confirmation");

        try {
          const { error: sendError } = await invokeAuthed(
            "send_appointment_confirmation",
            {
              appointment_id: createdAppointment.id,
            },
          );

          if (sendError) {
            throw new Error(
              sendError.message || "The confirmation email could not be sent.",
            );
          }

          setFormNotice("Appointment saved and confirmation sent.");
          setFormNoticeTone("success");
        } catch (sendErr) {
          console.error("appointments: auto confirmation failed", sendErr);
          setFormNotice(
            "Appointment saved, but confirmation email could not be sent.",
          );
          setFormNoticeTone("warning");
        }
      } else {
        setFormNotice("Appointment saved.");
        setFormNoticeTone("success");
      }

      setSelectedSiteId(form.siteId);
      setSelectedDate(form.date);
      closeCreateModal();
      await loadCalendar(form.siteId, form.date);
    } catch (err) {
      console.error("appointments: create failed", err);
      setFormError(readErrorMessage(err, "Could not create the appointment."));
    } finally {
      setSavePhase("");
      setSaving(false);
    }
  }

  async function submitCreateBlock(e) {
    e.preventDefault();
    setBlockFormError("");

    if (!canManageBlocks) {
      setBlockFormError("Only managers and admins can create blocks.");
      return;
    }
    if (!isBookableAppointmentSite(blockForm.siteId)) {
      setBlockFormError(
        "Blocks can only be created for Duke Street or St Enoch.",
      );
      return;
    }
    if (!blockForm.startTime) {
      setBlockFormError("Block start time is required.");
      return;
    }
    if (!blockForm.endTime) {
      setBlockFormError("Block end time is required.");
      return;
    }
    if (!blockForm.reason.trim()) {
      setBlockFormError("Block reason is required.");
      return;
    }

    const startAt = toDateTimeIso(blockForm.date, blockForm.startTime);
    const endAt = toDateTimeIso(blockForm.date, blockForm.endTime);

    if (
      !isWithinSelectedDay(blockForm.date, startAt) ||
      !isWithinSelectedDay(blockForm.date, endAt)
    ) {
      setBlockFormError(
        "Block times must stay within the selected calendar day.",
      );
      return;
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setBlockFormError("Block end time must be after the start time.");
      return;
    }

    const localConflict = findLocalBlockConflict(
      blockForm.areaId || null,
      startAt,
      endAt,
      "",
      blockForm.siteId,
      blockForm.date,
    );

    if (localConflict) {
      setBlockFormError(localConflict);
      return;
    }

    setBlockSaving(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "create_appointment_block_staff",
        {
          p_site_id: blockForm.siteId,
          p_area_id: blockForm.areaId || null,
          p_start_at: startAt,
          p_end_at: endAt,
          p_reason: blockForm.reason.trim(),
        },
      );

      if (rpcError) throw rpcError;
      if (!data || data.length === 0) {
        throw new Error("The block could not be created.");
      }

      setSelectedSiteId(blockForm.siteId);
      setSelectedDate(blockForm.date);
      closeBlockModal();
      await loadCalendar(blockForm.siteId, blockForm.date);
    } catch (err) {
      console.error("appointments: create block failed", err);
      setBlockFormError(readErrorMessage(err, "Could not create the block."));
    } finally {
      setBlockSaving(false);
    }
  }

  async function submitDetailUpdate(e) {
    e.preventDefault();
    setDetailError("");

    if (!detailAppointment) {
      setDetailError("This appointment is no longer available.");
      return;
    }
    if (!detailForm.customerName.trim()) {
      setDetailError("Customer name is required.");
      return;
    }
    if (!detailForm.customerEmail.trim()) {
      setDetailError("Customer email is required.");
      return;
    }
    if (!detailForm.appointmentTypeId) {
      setDetailError("Appointment type is required.");
      return;
    }
    if (!detailForm.areaId) {
      setDetailError("Appointment area is required.");
      return;
    }
    if (!detailForm.startTime) {
      setDetailError("Start time is required.");
      return;
    }

    const typeRow = appointmentTypes.find(
      (item) => item.id === detailForm.appointmentTypeId,
    );
    if (!typeRow) {
      setDetailError("The selected appointment type is not available.");
      return;
    }

    const startAt = toDateTimeIso(detailForm.date, detailForm.startTime);
    if (!isWithinSelectedDay(detailForm.date, startAt)) {
      setDetailError("Start time must stay within the selected calendar day.");
      return;
    }

    const endAt = new Date(
      new Date(startAt).getTime() + typeRow.duration_minutes * 60000,
    ).toISOString();

    const localConflict = findLocalConflict(
      detailForm.areaId,
      startAt,
      endAt,
      detailAppointment.id,
    );
    if (localConflict) {
      setDetailError(localConflict);
      return;
    }

    setDetailSaving(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "update_appointment_staff",
        {
          p_appointment_id: detailAppointment.id,
          p_area_id: detailForm.areaId,
          p_appointment_type_id: detailForm.appointmentTypeId,
          p_start_at: startAt,
          p_customer_name: detailForm.customerName.trim(),
          p_customer_email: detailForm.customerEmail.trim(),
          p_customer_phone: detailForm.customerPhone.trim() || null,
          p_internal_notes: detailForm.internalNotes.trim() || null,
        },
      );

      if (rpcError) throw rpcError;
      if (!data || data.length === 0) {
        throw new Error("The appointment could not be updated.");
      }

      const nextDate = detailForm.date;
      setSelectedDate(nextDate);
      setDetailEditing(false);
      closeDetailModal();
      await loadCalendar(selectedSiteId, nextDate);
    } catch (err) {
      console.error("appointments: update failed", err);
      setDetailError(
        readErrorMessage(err, "Could not update the appointment."),
      );
    } finally {
      setDetailSaving(false);
    }
  }

  async function cancelAppointment() {
    if (!detailAppointment) return;
    if (!window.confirm("Cancel this appointment?")) return;

    setDetailSaving(true);
    setDetailError("");

    try {
      const { error: rpcError } = await supabase.rpc(
        "cancel_appointment_staff",
        {
          p_appointment_id: detailAppointment.id,
        },
      );

      if (rpcError) throw rpcError;

      closeDetailModal();
      await loadCalendar(selectedSiteId, selectedDate);
    } catch (err) {
      console.error("appointments: cancel failed", err);
      setDetailError(
        readErrorMessage(err, "Could not cancel the appointment."),
      );
    } finally {
      setDetailSaving(false);
    }
  }

  async function sendConfirmationEmail() {
    if (!detailAppointment) return;

    setSendingConfirmation(true);
    setDetailError("");
    setSendConfirmationMessage("");
    setSendReminderMessage("");

    try {
      const { data, error } = await invokeAuthed(
        "send_appointment_confirmation",
        {
          appointment_id: detailAppointment.id,
        },
      );

      if (error) {
        throw new Error(
          error.message || "The confirmation email could not be sent.",
        );
      }

      setSendConfirmationMessage("Confirmation email sent.");
      await Promise.all([
        loadActivity(detailAppointment.id),
        loadEmailLog(detailAppointment.id),
      ]);
    } catch (err) {
      console.error("appointments: send confirmation failed", err);
      setDetailError(
        readErrorMessage(err, "Could not send the confirmation email."),
      );
    } finally {
      setSendingConfirmation(false);
    }
  }

  async function sendReminderEmail() {
    if (!detailAppointment) return;

    setSendingReminder(true);
    setDetailError("");
    setSendReminderMessage("");
    setSendConfirmationMessage("");

    try {
      const { data, error } = await invokeAuthed("send_appointment_reminder", {
        appointment_id: detailAppointment.id,
      });

      if (error) {
        throw new Error(
          error.message || "The reminder email could not be sent.",
        );
      }

      setSendReminderMessage(data?.message || "Reminder email sent.");
      await Promise.all([
        loadActivity(detailAppointment.id),
        loadEmailLog(detailAppointment.id),
      ]);
    } catch (err) {
      console.error("appointments: send reminder failed", err);
      setDetailError(
        readErrorMessage(err, "Could not send the reminder email."),
      );
    } finally {
      setSendingReminder(false);
    }
  }

  async function loadReminderBatchPreview() {
    if (!canManageReminderBatch) return;
    if (
      !effectiveReminderBatchSiteId ||
      !isBookableAppointmentSite(effectiveReminderBatchSiteId)
    ) {
      setReminderBatchError(
        "Select a valid appointment site before previewing reminders.",
      );
      return;
    }

    setReminderBatchLoading(true);
    setReminderBatchError("");
    setReminderBatchMessage("");

    try {
      const { data, error } = await invokeAuthed(
        "send_appointment_reminder_batch",
        {
          date: reminderBatchDate,
          site_id: effectiveReminderBatchSiteId,
          preview_only: true,
        },
      );

      if (error) {
        throw new Error(error.message || "Could not load reminder preview.");
      }

      setReminderBatchRows(Array.isArray(data?.results) ? data.results : []);
      setReminderBatchSummary(data || null);
    } catch (err) {
      console.error("appointments: reminder batch preview failed", err);
      setReminderBatchRows([]);
      setReminderBatchSummary(null);
      setReminderBatchError(
        readErrorMessage(err, "Could not load reminder preview."),
      );
    } finally {
      setReminderBatchLoading(false);
    }
  }

  async function sendReminderBatch() {
    if (!canManageReminderBatch) return;
    if (
      !effectiveReminderBatchSiteId ||
      !isBookableAppointmentSite(effectiveReminderBatchSiteId)
    ) {
      setReminderBatchError(
        "Select a valid appointment site before sending reminders.",
      );
      return;
    }

    setReminderBatchSending(true);
    setReminderBatchError("");
    setReminderBatchMessage("");

    try {
      const { data, error } = await invokeAuthed(
        "send_appointment_reminder_batch",
        {
          date: reminderBatchDate,
          site_id: effectiveReminderBatchSiteId,
          preview_only: false,
        },
      );

      if (error) {
        throw new Error(error.message || "Could not send reminder batch.");
      }

      setReminderBatchRows(Array.isArray(data?.results) ? data.results : []);
      setReminderBatchSummary(data || null);
      setReminderBatchMessage(
        `Sent ${Number(data?.sent_count || 0)} reminder${Number(data?.sent_count || 0) === 1 ? "" : "s"}.`,
      );
      await loadReminderBatchPreview();
    } catch (err) {
      console.error("appointments: reminder batch send failed", err);
      setReminderBatchError(readErrorMessage(err, "Could not send reminders."));
    } finally {
      setReminderBatchSending(false);
    }
  }

  async function submitBlockUpdate(e) {
    e.preventDefault();
    setBlockDetailError("");

    if (!detailBlock) {
      setBlockDetailError("This block is no longer available.");
      return;
    }
    if (!detailBlockForm.startTime) {
      setBlockDetailError("Block start time is required.");
      return;
    }
    if (!detailBlockForm.endTime) {
      setBlockDetailError("Block end time is required.");
      return;
    }
    if (!detailBlockForm.reason.trim()) {
      setBlockDetailError("Block reason is required.");
      return;
    }

    const startAt = toDateTimeIso(
      detailBlockForm.date,
      detailBlockForm.startTime,
    );
    const endAt = toDateTimeIso(detailBlockForm.date, detailBlockForm.endTime);

    if (
      !isWithinSelectedDay(detailBlockForm.date, startAt) ||
      !isWithinSelectedDay(detailBlockForm.date, endAt)
    ) {
      setBlockDetailError(
        "Block times must stay within the selected calendar day.",
      );
      return;
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setBlockDetailError("Block end time must be after the start time.");
      return;
    }

    const localConflict = findLocalBlockConflict(
      detailBlockForm.areaId || null,
      startAt,
      endAt,
      detailBlock.id,
      detailBlockSiteId,
      detailBlockForm.date,
    );

    if (localConflict) {
      setBlockDetailError(localConflict);
      return;
    }

    setBlockDetailSaving(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "update_appointment_block_staff",
        {
          p_block_id: detailBlock.id,
          p_area_id: detailBlockForm.areaId || null,
          p_start_at: startAt,
          p_end_at: endAt,
          p_reason: detailBlockForm.reason.trim(),
        },
      );

      if (rpcError) throw rpcError;
      if (!data || data.length === 0) {
        throw new Error("The block could not be updated.");
      }

      setSelectedDate(detailBlockForm.date);
      closeBlockDetailModal();
      await loadCalendar(detailBlockSiteId, detailBlockForm.date);
    } catch (err) {
      console.error("appointments: update block failed", err);
      setBlockDetailError(readErrorMessage(err, "Could not update the block."));
    } finally {
      setBlockDetailSaving(false);
    }
  }

  async function cancelBlock() {
    if (!detailBlock) return;
    if (!window.confirm("Remove this block?")) return;

    setBlockDetailSaving(true);
    setBlockDetailError("");

    try {
      const { error: rpcError } = await supabase.rpc(
        "cancel_appointment_block_staff",
        {
          p_block_id: detailBlock.id,
        },
      );

      if (rpcError) throw rpcError;

      closeBlockDetailModal();
      await loadCalendar(detailBlockSiteId, selectedDate);
    } catch (err) {
      console.error("appointments: cancel block failed", err);
      setBlockDetailError(readErrorMessage(err, "Could not remove the block."));
    } finally {
      setBlockDetailSaving(false);
    }
  }

  return (
    <div
      style={{ width: "100%", color: ui.colors.text, fontFamily: ui.font.ui }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Appointments</h2>
          <div style={ui.text.subtitle}>
            Day view with safe staff-created appointments through the existing
            appointment schema.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{ fontSize: 12, fontWeight: 800, color: ui.colors.muted }}
          >
            {pageTitle}
          </div>

          <button
            type="button"
            disabled={!canOpenCreate}
            onClick={openCreateModal}
            style={{
              padding: "8px 12px",
              borderRadius: ui.radius.md,
              border: `1px solid rgba(168,85,247,0.35)`,
              background: ui.colors.brandSoft,
              color: ui.colors.text,
              cursor: canOpenCreate ? "pointer" : "not-allowed",
              fontWeight: 900,
              opacity: canOpenCreate ? 1 : 0.55,
            }}
          >
            New appointment
          </button>

          {canManageBlocks ? (
            <button
              type="button"
              disabled={!canOpenBlock}
              onClick={openBlockModal}
              style={{
                padding: "8px 12px",
                borderRadius: ui.radius.md,
                border: "1px solid rgba(100,116,139,0.35)",
                background: "rgba(100,116,139,0.12)",
                color: ui.colors.text,
                cursor: canOpenBlock ? "pointer" : "not-allowed",
                fontWeight: 900,
                opacity: canOpenBlock ? 1 : 0.55,
              }}
            >
              New block
            </button>
          ) : null}
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
            style={{ ...baseInputStyle, display: "block", marginTop: 6 }}
          />
        </label>

        {showSiteSelector ? (
          <label style={{ fontSize: 13, fontWeight: 700 }}>
            Site
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              style={{
                ...baseInputStyle,
                display: "block",
                marginTop: 6,
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
          Appointments are only available for Duke Street and St Enoch. Your
          current site is {visibleSiteName}.
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
          No bookable appointment sites are available yet. Seed Duke Street and
          St Enoch appointment areas first.
        </div>
      ) : null}

      {canManageReminderBatch ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${ui.colors.border}`,
            background: "rgba(59,130,246,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 900 }}>
                Send tomorrow&apos;s reminders
              </div>
              <div
                style={{ marginTop: 4, fontSize: 13, color: ui.colors.muted }}
              >
                Preview eligible appointments first, then send reminders
                deliberately from the server.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "end",
              }}
            >
              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Date
                <input
                  type="date"
                  value={reminderBatchDate}
                  onChange={(e) => setReminderBatchDate(e.target.value)}
                  style={{ ...baseInputStyle, display: "block", marginTop: 6 }}
                />
              </label>

              {isAdmin ? (
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Site
                  <select
                    value={reminderBatchSiteId}
                    onChange={(e) => setReminderBatchSiteId(e.target.value)}
                    style={{
                      ...baseInputStyle,
                      display: "block",
                      marginTop: 6,
                      minWidth: 180,
                    }}
                  >
                    {reminderBatchSiteOptions.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name || prettySiteName(site.id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>Site</div>
                  <div style={{ marginTop: 8 }}>
                    {prettySiteName(effectiveReminderBatchSiteId)}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={loadReminderBatchPreview}
                disabled={reminderBatchLoading || reminderBatchSending}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: `1px solid ${ui.colors.border}`,
                  background: ui.colors.cardBg,
                  color: ui.colors.text,
                  cursor:
                    reminderBatchLoading || reminderBatchSending
                      ? "not-allowed"
                      : "pointer",
                  fontWeight: 800,
                  opacity:
                    reminderBatchLoading || reminderBatchSending ? 0.6 : 1,
                }}
              >
                {reminderBatchLoading ? "Loading..." : "Preview reminders"}
              </button>

              <button
                type="button"
                onClick={sendReminderBatch}
                disabled={
                  reminderBatchSending ||
                  reminderBatchLoading ||
                  !reminderBatchSummary ||
                  Number(reminderBatchSummary.eligible_count || 0) === 0
                }
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: "1px solid rgba(59,130,246,0.35)",
                  background: "rgba(59,130,246,0.12)",
                  color: ui.colors.text,
                  cursor:
                    reminderBatchSending ||
                    reminderBatchLoading ||
                    !reminderBatchSummary ||
                    Number(reminderBatchSummary.eligible_count || 0) === 0
                      ? "not-allowed"
                      : "pointer",
                  fontWeight: 900,
                  opacity:
                    reminderBatchSending ||
                    reminderBatchLoading ||
                    !reminderBatchSummary ||
                    Number(reminderBatchSummary.eligible_count || 0) === 0
                      ? 0.6
                      : 1,
                }}
              >
                {reminderBatchSending ? "Sending..." : "Send reminders"}
              </button>
            </div>
          </div>

          {reminderBatchError ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.35)",
              }}
            >
              {reminderBatchError}
            </div>
          ) : null}

          {reminderBatchMessage ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "rgba(34,197,94,0.10)",
                border: "1px solid rgba(34,197,94,0.35)",
              }}
            >
              {reminderBatchMessage}
            </div>
          ) : null}

          {reminderBatchSummary ? (
            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 10,
              }}
            >
              <FieldValue
                label="Found"
                value={String(reminderBatchSummary.total_found || 0)}
              />
              <FieldValue
                label="Eligible"
                value={String(reminderBatchSummary.eligible_count || 0)}
              />
              <FieldValue
                label="Sent"
                value={String(reminderBatchSummary.sent_count || 0)}
              />
              <FieldValue
                label="Already sent"
                value={String(
                  reminderBatchSummary.skipped_already_sent_count || 0,
                )}
              />
              <FieldValue
                label="Missing email"
                value={String(
                  reminderBatchSummary.skipped_missing_email_count || 0,
                )}
              />
              <FieldValue
                label="Failed"
                value={String(reminderBatchSummary.failed_count || 0)}
              />
            </div>
          ) : null}

          {reminderBatchRows.length > 0 ? (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {reminderBatchRows.map((row) => (
                <div
                  key={row.appointment_id}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    background: ui.colors.cardBg,
                    border: `1px solid ${ui.colors.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      {row.customer_name || "Customer"}
                    </div>
                    <div style={{ fontSize: 13, color: ui.colors.muted }}>
                      {row.appointment_time} • {row.site_name} • {row.area_name}
                    </div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {row.customer_email || "No email address"}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color: ui.colors.muted,
                    }}
                  >
                    {row.appointment_type}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700 }}>
                    {row.message}
                    {row.send_result === "failed" && row.error
                      ? `: ${row.error}`
                      : ""}
                    {row.send_result === "sent" ? " - Reminder sent." : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {formNotice ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            background:
              formNoticeTone === "warning"
                ? "rgba(245,158,11,0.12)"
                : "rgba(34,197,94,0.10)",
            border:
              formNoticeTone === "warning"
                ? "1px solid rgba(245,158,11,0.35)"
                : "1px solid rgba(34,197,94,0.35)",
          }}
        >
          {formNotice}
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
            Appointment areas/resources need to be seeded for this site before
            the calendar can display columns.
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
                  <div style={{ fontWeight: 900 }}>
                    {canonicalAreaLabel(area)}
                  </div>
                  <div style={{ fontSize: 12, color: ui.colors.muted }}>
                    {area.branch || ""}
                  </div>
                </div>
              ))}

              <div
                style={{
                  position: "relative",
                  height: timelineHeight,
                  borderRight: `1px solid ${ui.colors.border}`,
                  background:
                    "linear-gradient(180deg, rgba(2,6,23,0.03) 0%, rgba(2,6,23,0.01) 100%)",
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

                {Array.from({ length: Math.max(totalHours, 1) }, (_, index) => {
                  const top = index * HOUR_HEIGHT + HOUR_HEIGHT / 2;
                  return (
                    <div
                      key={`half-${index}`}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top,
                        borderTop: "1px dashed rgba(2, 6, 23, 0.08)",
                      }}
                    />
                  );
                })}
              </div>

              {areas.map((area) => {
                const areaAppointments = appointmentsByArea[area.id] || [];
                const areaBlocks = [
                  ...(blocksByArea[area.id] || []),
                  ...(blocksByArea.__branch__ || []),
                ];
                const hasItems =
                  areaAppointments.length > 0 || areaBlocks.length > 0;

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

                    {Array.from(
                      { length: Math.max(totalHours, 1) },
                      (_, index) => {
                        const top = index * HOUR_HEIGHT + HOUR_HEIGHT / 2;
                        return (
                          <div
                            key={`half-${area.id}-${index}`}
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top,
                              borderTop: "1px dashed rgba(2, 6, 23, 0.06)",
                            }}
                          />
                        );
                      },
                    )}

                    {areaBlocks.map((item) => (
                      <TimelineItem
                        key={`block-${area.id}-${item.id}`}
                        item={item}
                        type="block"
                        startHour={timeline.startHour}
                        typesById={typesById}
                        onClick={() => openBlockDetailModal(item)}
                      />
                    ))}

                    {areaAppointments.map((item) => (
                      <TimelineItem
                        key={`appt-${item.id}`}
                        item={item}
                        type="appointment"
                        startHour={timeline.startHour}
                        typesById={typesById}
                        onClick={() => openDetailModal(item)}
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

      {modalOpen ? (
        <ModalShell
          title="New appointment"
          subtitle="Create a booked appointment without sending emails yet."
          onClose={closeCreateModal}
          maxWidth={640}
        >
          <form onSubmit={submitCreateAppointment} style={{ padding: 16 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {showSiteSelector ? (
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Site
                  <select
                    value={form.siteId}
                    onChange={(e) => updateForm("siteId", e.target.value)}
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  >
                    {bookableSites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name || prettySiteName(site.id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Site
                  <input
                    value={prettySiteName(form.siteId)}
                    readOnly
                    style={{
                      ...baseInputStyle,
                      marginTop: 6,
                      background: "rgba(2, 6, 23, 0.03)",
                    }}
                  />
                </label>
              )}

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => updateForm("date", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Appointment area
                <select
                  value={form.areaId}
                  onChange={(e) => updateForm("areaId", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                  disabled={modalAreasLoading || modalAreas.length === 0}
                >
                  <option value="">
                    {modalAreasLoading
                      ? "Loading areas..."
                      : "Select an area..."}
                  </option>
                  {modalAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {canonicalAreaLabel(area)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Appointment type
                <select
                  value={form.appointmentTypeId}
                  onChange={(e) =>
                    updateForm("appointmentTypeId", e.target.value)
                  }
                  style={{ ...baseInputStyle, marginTop: 6 }}
                >
                  <option value="">Select a type...</option>
                  {appointmentTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.duration_minutes} mins)
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Start time
                <select
                  value={form.startTime}
                  onChange={(e) => updateForm("startTime", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                >
                  <option value="">Select a time...</option>
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                End time
                <input
                  value={
                    calculatedEndTimeLabel || "Calculated from appointment type"
                  }
                  readOnly
                  style={{
                    ...baseInputStyle,
                    marginTop: 6,
                    background: "rgba(2, 6, 23, 0.03)",
                  }}
                />
              </label>

              <label
                style={{ fontSize: 13, fontWeight: 700, gridColumn: "1 / -1" }}
              >
                Customer name
                <input
                  value={form.customerName}
                  onChange={(e) => updateForm("customerName", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Customer email
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => updateForm("customerEmail", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                />
              </label>

              <label
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  gridColumn: "1 / -1",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    !!form.sendConfirmationAfterSave &&
                    canAutoSendConfirmationOnCreate
                  }
                  disabled={!canAutoSendConfirmationOnCreate || saving}
                  onChange={(e) => {
                    setCreateSendConfirmationTouched(true);
                    updateForm("sendConfirmationAfterSave", e.target.checked);
                  }}
                />
                <span>Send confirmation email after saving</span>
              </label>

              {!canAutoSendConfirmationOnCreate ? (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    marginTop: -4,
                    fontSize: 13,
                    color: ui.colors.muted,
                  }}
                >
                  Add a customer email to send confirmation.
                </div>
              ) : null}

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Customer phone
                <input
                  value={form.customerPhone}
                  onChange={(e) => updateForm("customerPhone", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                />
              </label>

              <label
                style={{ fontSize: 13, fontWeight: 700, gridColumn: "1 / -1" }}
              >
                Internal notes
                <textarea
                  rows={4}
                  value={form.internalNotes}
                  onChange={(e) => updateForm("internalNotes", e.target.value)}
                  style={{
                    ...baseInputStyle,
                    marginTop: 6,
                    resize: "vertical",
                  }}
                />
              </label>
            </div>

            {formError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.35)",
                }}
              >
                {formError}
              </div>
            ) : null}

            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={closeCreateModal}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: `1px solid ${ui.colors.border}`,
                  background: ui.colors.cardBg,
                  color: ui.colors.text,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: `1px solid rgba(168,85,247,0.35)`,
                  background: ui.colors.brandSoft,
                  color: ui.colors.text,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {savePhase === "sending_confirmation"
                  ? "Sending confirmation..."
                  : savePhase === "saving"
                    ? "Saving appointment..."
                    : "Save appointment"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {blockModalOpen ? (
        <ModalShell
          title="New block"
          subtitle="Block unavailable appointment time for one area or the whole site."
          onClose={closeBlockModal}
          maxWidth={640}
        >
          <form onSubmit={submitCreateBlock} style={{ padding: 16 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {showSiteSelector ? (
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Site
                  <select
                    value={blockForm.siteId}
                    onChange={(e) => updateBlockForm("siteId", e.target.value)}
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  >
                    {bookableSites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name || prettySiteName(site.id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Site
                  <input
                    value={prettySiteName(blockForm.siteId)}
                    readOnly
                    style={{
                      ...baseInputStyle,
                      marginTop: 6,
                      background: "rgba(2, 6, 23, 0.03)",
                    }}
                  />
                </label>
              )}

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Date
                <input
                  type="date"
                  value={blockForm.date}
                  onChange={(e) => updateBlockForm("date", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                />
              </label>

              <label
                style={{ fontSize: 13, fontWeight: 700, gridColumn: "1 / -1" }}
              >
                Area / resource
                <select
                  value={blockForm.areaId}
                  onChange={(e) => updateBlockForm("areaId", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                  disabled={blockModalAreasLoading}
                >
                  <option value="">Whole site</option>
                  {blockModalAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {canonicalAreaLabel(area)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Start time
                <select
                  value={blockForm.startTime}
                  onChange={(e) => updateBlockForm("startTime", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                >
                  <option value="">Select a time...</option>
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                End time
                <select
                  value={blockForm.endTime}
                  onChange={(e) => updateBlockForm("endTime", e.target.value)}
                  style={{ ...baseInputStyle, marginTop: 6 }}
                >
                  <option value="">Select a time...</option>
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>

              <label
                style={{ fontSize: 13, fontWeight: 700, gridColumn: "1 / -1" }}
              >
                Reason
                <textarea
                  rows={4}
                  value={blockForm.reason}
                  onChange={(e) => updateBlockForm("reason", e.target.value)}
                  style={{
                    ...baseInputStyle,
                    marginTop: 6,
                    resize: "vertical",
                  }}
                />
              </label>
            </div>

            {blockFormError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.35)",
                }}
              >
                {blockFormError}
              </div>
            ) : null}

            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={closeBlockModal}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: `1px solid ${ui.colors.border}`,
                  background: ui.colors.cardBg,
                  color: ui.colors.text,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={blockSaving}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: "1px solid rgba(100,116,139,0.35)",
                  background: "rgba(100,116,139,0.12)",
                  color: ui.colors.text,
                  cursor: blockSaving ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: blockSaving ? 0.6 : 1,
                }}
              >
                {blockSaving ? "Saving..." : "Save block"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {detailOpen && detailAppointment ? (
        <ModalShell
          title={detailEditing ? "Edit appointment" : "Appointment details"}
          subtitle={
            detailEditing
              ? "Update this appointment through the controlled staff RPC."
              : "View customer details, accountability, and activity."
          }
          onClose={closeDetailModal}
          maxWidth={760}
        >
          {detailEditing ? (
            <form onSubmit={submitDetailUpdate} style={{ padding: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Site
                  <input
                    value={prettySiteName(detailSiteId)}
                    readOnly
                    style={{
                      ...baseInputStyle,
                      marginTop: 6,
                      background: "rgba(2, 6, 23, 0.03)",
                    }}
                  />
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Date
                  <input
                    type="date"
                    value={detailForm.date}
                    onChange={(e) => updateDetailForm("date", e.target.value)}
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Appointment area
                  <select
                    value={detailForm.areaId}
                    onChange={(e) => updateDetailForm("areaId", e.target.value)}
                    style={{ ...baseInputStyle, marginTop: 6 }}
                    disabled={areas.length === 0}
                  >
                    <option value="">Select an area...</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {canonicalAreaLabel(area)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Appointment type
                  <select
                    value={detailForm.appointmentTypeId}
                    onChange={(e) =>
                      updateDetailForm("appointmentTypeId", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  >
                    <option value="">Select a type...</option>
                    {appointmentTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.duration_minutes} mins)
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Start time
                  <select
                    value={detailForm.startTime}
                    onChange={(e) =>
                      updateDetailForm("startTime", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  >
                    <option value="">Select a time...</option>
                    {timeOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  End time
                  <input
                    value={
                      detailEndTimeLabel || "Calculated from appointment type"
                    }
                    readOnly
                    style={{
                      ...baseInputStyle,
                      marginTop: 6,
                      background: "rgba(2, 6, 23, 0.03)",
                    }}
                  />
                </label>

                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    gridColumn: "1 / -1",
                  }}
                >
                  Customer name
                  <input
                    value={detailForm.customerName}
                    onChange={(e) =>
                      updateDetailForm("customerName", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Customer email
                  <input
                    type="email"
                    value={detailForm.customerEmail}
                    onChange={(e) =>
                      updateDetailForm("customerEmail", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Customer phone
                  <input
                    value={detailForm.customerPhone}
                    onChange={(e) =>
                      updateDetailForm("customerPhone", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  />
                </label>

                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    gridColumn: "1 / -1",
                  }}
                >
                  Internal notes
                  <textarea
                    rows={4}
                    value={detailForm.internalNotes}
                    onChange={(e) =>
                      updateDetailForm("internalNotes", e.target.value)
                    }
                    style={{
                      ...baseInputStyle,
                      marginTop: 6,
                      resize: "vertical",
                    }}
                  />
                </label>
              </div>

              {detailError ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.35)",
                  }}
                >
                  {detailError}
                </div>
              ) : null}

              {sendConfirmationMessage ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.35)",
                  }}
                >
                  {sendConfirmationMessage}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setDetailEditing(false);
                    setDetailForm(
                      buildDetailForm(detailAppointment, detailSiteId),
                    );
                    setDetailError("");
                  }}
                  style={{
                    padding: "9px 12px",
                    borderRadius: ui.radius.md,
                    border: `1px solid ${ui.colors.border}`,
                    background: ui.colors.cardBg,
                    color: ui.colors.text,
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Cancel edit
                </button>

                <button
                  type="submit"
                  disabled={detailSaving}
                  style={{
                    padding: "9px 12px",
                    borderRadius: ui.radius.md,
                    border: `1px solid rgba(168,85,247,0.35)`,
                    background: ui.colors.brandSoft,
                    color: ui.colors.text,
                    cursor: detailSaving ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    opacity: detailSaving ? 0.6 : 1,
                  }}
                >
                  {detailSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ padding: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <FieldValue
                  label="Customer name"
                  value={detailAppointment.customer_name}
                />
                <FieldValue
                  label="Customer email"
                  value={detailAppointment.customer_email}
                />
                <FieldValue
                  label="Customer phone"
                  value={detailAppointment.customer_phone}
                />
                <FieldValue
                  label="Appointment type"
                  value={appointmentTypeLabel(detailAppointment, typesById)}
                />
                <FieldValue
                  label="Date"
                  value={formatDateLabel(detailAppointment.start_at)}
                />
                <FieldValue
                  label="Start time"
                  value={formatTimeLabel(detailAppointment.start_at)}
                />
                <FieldValue
                  label="End time"
                  value={formatTimeLabel(detailAppointment.end_at)}
                />
                <FieldValue label="Site" value={prettySiteName(detailSiteId)} />
                <FieldValue
                  label="Area / resource"
                  value={canonicalAreaLabel(detailArea)}
                />
                <FieldValue
                  label="Booked by"
                  value={bookedByLabel(detailAppointment)}
                />
                <FieldValue
                  label="Latest confirmation sent"
                  value={
                    latestConfirmationEmail
                      ? `${formatDateTimeLabel(latestConfirmationEmail.sent_at)}${
                          latestConfirmationEmail.sent_by_name
                            ? ` by ${latestConfirmationEmail.sent_by_name}`
                            : ""
                        }`
                      : "Not sent yet"
                  }
                />
                <FieldValue
                  label="Created at"
                  value={formatDateTimeLabel(detailAppointment.created_at)}
                />
                <FieldValue
                  label="Last updated"
                  value={
                    detailLastChange
                      ? formatDateTimeLabel(detailLastChange.created_at)
                      : formatDateTimeLabel(detailAppointment.updated_at)
                  }
                />
                <FieldValue
                  label="Last updated by"
                  value={detailLastChange?.changed_by_name || "Not available"}
                />
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(2, 6, 23, 0.03)",
                    border: `1px solid ${ui.colors.border}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: ui.colors.muted,
                    }}
                  >
                    Internal notes
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      whiteSpace: "pre-wrap",
                      fontWeight: 700,
                    }}
                  >
                    {detailAppointment.internal_notes || "No internal notes"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${ui.colors.border}`,
                  background: "rgba(2, 6, 23, 0.02)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900 }}>Activity</div>

                {activityLoading ? (
                  <div style={{ marginTop: 10, color: ui.colors.muted }}>
                    Loading activity...
                  </div>
                ) : activityError ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 10,
                      background: "rgba(245,158,11,0.12)",
                      border: "1px solid rgba(245,158,11,0.35)",
                    }}
                  >
                    {activityError}
                  </div>
                ) : activityRows.length === 0 ? (
                  <div style={{ marginTop: 10, color: ui.colors.muted }}>
                    No activity has been recorded yet.
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {activityRows.map((row) => (
                      <div
                        key={row.id}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          background: ui.colors.cardBg,
                          border: `1px solid ${ui.colors.border}`,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            textTransform: "capitalize",
                          }}
                        >
                          {row.action}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            color: ui.colors.muted,
                          }}
                        >
                          {formatDateTimeLabel(row.created_at)}
                          {row.changed_by_name
                            ? ` by ${row.changed_by_name}`
                            : ""}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            color: ui.colors.text,
                          }}
                        >
                          {describeActivity(row)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${ui.colors.border}`,
                  background: "rgba(2, 6, 23, 0.02)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  Email history
                </div>

                {emailLogLoading ? (
                  <div style={{ marginTop: 10, color: ui.colors.muted }}>
                    Loading email history...
                  </div>
                ) : emailLogError ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 10,
                      background: "rgba(245,158,11,0.12)",
                      border: "1px solid rgba(245,158,11,0.35)",
                    }}
                  >
                    {emailLogError}
                  </div>
                ) : emailLogRows.length === 0 ? (
                  <div style={{ marginTop: 10, color: ui.colors.muted }}>
                    No confirmation or reminder emails have been logged yet.
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {emailLogRows.map((row) => (
                      <div
                        key={row.id}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          background: ui.colors.cardBg,
                          border: `1px solid ${ui.colors.border}`,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            textTransform: "capitalize",
                          }}
                        >
                          {row.email_type} - {row.status}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            color: ui.colors.muted,
                          }}
                        >
                          {formatDateTimeLabel(row.sent_at)}
                          {row.sent_by_name ? ` by ${row.sent_by_name}` : ""}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            color: ui.colors.text,
                          }}
                        >
                          {row.recipient_email}
                        </div>
                        {row.error_message ? (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 13,
                              color: ui.colors.muted,
                            }}
                          >
                            {row.error_message}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detailAppointment.status !== "cancelled" &&
              !String(detailAppointment.customer_email || "").trim() ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(245,158,11,0.10)",
                    border: "1px solid rgba(245,158,11,0.35)",
                    color: ui.colors.text,
                  }}
                >
                  Customer email required before sending reminder.
                </div>
              ) : null}

              {sendConfirmationMessage ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.35)",
                  }}
                >
                  {sendConfirmationMessage}
                </div>
              ) : null}

              {sendReminderMessage ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.35)",
                  }}
                >
                  {sendReminderMessage}
                </div>
              ) : null}

              {detailError ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.35)",
                  }}
                >
                  {detailError}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {canManageSelectedAppointment &&
                detailAppointment.status !== "cancelled" ? (
                  <button
                    type="button"
                    onClick={sendReminderEmail}
                    disabled={!canSendReminder || sendingReminder}
                    title={
                      detailAppointment.customer_email
                        ? undefined
                        : "Customer email required before sending reminder."
                    }
                    style={{
                      padding: "9px 12px",
                      borderRadius: ui.radius.md,
                      border: "1px solid rgba(59,130,246,0.35)",
                      background: "rgba(59,130,246,0.12)",
                      color: ui.colors.text,
                      cursor:
                        !canSendReminder || sendingReminder
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: 900,
                      opacity: !canSendReminder || sendingReminder ? 0.6 : 1,
                    }}
                  >
                    {sendingReminder ? "Sending..." : "Send reminder"}
                  </button>
                ) : null}

                {canManageSelectedAppointment ? (
                  <button
                    type="button"
                    onClick={sendConfirmationEmail}
                    disabled={!canSendConfirmation || sendingConfirmation}
                    title={
                      detailAppointment.customer_email
                        ? undefined
                        : "Customer email is required before sending confirmation."
                    }
                    style={{
                      padding: "9px 12px",
                      borderRadius: ui.radius.md,
                      border: "1px solid rgba(16,185,129,0.35)",
                      background: "rgba(16,185,129,0.12)",
                      color: ui.colors.text,
                      cursor:
                        !canSendConfirmation || sendingConfirmation
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: 900,
                      opacity:
                        !canSendConfirmation || sendingConfirmation ? 0.6 : 1,
                    }}
                  >
                    {sendingConfirmation ? "Sending..." : "Send confirmation"}
                  </button>
                ) : null}

                {canManageSelectedAppointment ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailEditing(true);
                      setDetailForm(
                        buildDetailForm(detailAppointment, detailSiteId),
                      );
                      setDetailError("");
                    }}
                    style={{
                      padding: "9px 12px",
                      borderRadius: ui.radius.md,
                      border: `1px solid rgba(168,85,247,0.35)`,
                      background: ui.colors.brandSoft,
                      color: ui.colors.text,
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Edit
                  </button>
                ) : null}

                {canManageSelectedAppointment ? (
                  <button
                    type="button"
                    onClick={cancelAppointment}
                    disabled={detailSaving}
                    style={{
                      padding: "9px 12px",
                      borderRadius: ui.radius.md,
                      border: "1px solid rgba(239,68,68,0.35)",
                      background: "rgba(239,68,68,0.12)",
                      color: ui.colors.text,
                      cursor: detailSaving ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      opacity: detailSaving ? 0.6 : 1,
                    }}
                  >
                    Cancel appointment
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={closeDetailModal}
                  style={{
                    padding: "9px 12px",
                    borderRadius: ui.radius.md,
                    border: `1px solid ${ui.colors.border}`,
                    background: ui.colors.cardBg,
                    color: ui.colors.text,
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </ModalShell>
      ) : null}

      {blockDetailOpen && detailBlock ? (
        <ModalShell
          title={blockDetailEditing ? "Edit block" : "Block details"}
          subtitle={
            blockDetailEditing
              ? "Update this block through the controlled manager/admin RPC."
              : "View block details and accountability."
          }
          onClose={closeBlockDetailModal}
          maxWidth={760}
        >
          {blockDetailEditing ? (
            <form onSubmit={submitBlockUpdate} style={{ padding: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Site
                  <input
                    value={prettySiteName(detailBlockSiteId)}
                    readOnly
                    style={{
                      ...baseInputStyle,
                      marginTop: 6,
                      background: "rgba(2, 6, 23, 0.03)",
                    }}
                  />
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Date
                  <input
                    type="date"
                    value={detailBlockForm.date}
                    onChange={(e) =>
                      updateDetailBlockForm("date", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  />
                </label>

                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    gridColumn: "1 / -1",
                  }}
                >
                  Area / resource
                  <select
                    value={detailBlockForm.areaId}
                    onChange={(e) =>
                      updateDetailBlockForm("areaId", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  >
                    <option value="">Whole site</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {canonicalAreaLabel(area)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Start time
                  <select
                    value={detailBlockForm.startTime}
                    onChange={(e) =>
                      updateDetailBlockForm("startTime", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  >
                    <option value="">Select a time...</option>
                    {timeOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  End time
                  <select
                    value={detailBlockForm.endTime}
                    onChange={(e) =>
                      updateDetailBlockForm("endTime", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  >
                    <option value="">Select a time...</option>
                    {timeOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    gridColumn: "1 / -1",
                  }}
                >
                  Reason
                  <textarea
                    rows={4}
                    value={detailBlockForm.reason}
                    onChange={(e) =>
                      updateDetailBlockForm("reason", e.target.value)
                    }
                    style={{
                      ...baseInputStyle,
                      marginTop: 6,
                      resize: "vertical",
                    }}
                  />
                </label>
              </div>

              {blockDetailError ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.35)",
                  }}
                >
                  {blockDetailError}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setBlockDetailEditing(false);
                    setDetailBlockForm(
                      buildBlockDetailForm(detailBlock, detailBlockSiteId),
                    );
                    setBlockDetailError("");
                  }}
                  style={{
                    padding: "9px 12px",
                    borderRadius: ui.radius.md,
                    border: `1px solid ${ui.colors.border}`,
                    background: ui.colors.cardBg,
                    color: ui.colors.text,
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Cancel edit
                </button>

                <button
                  type="submit"
                  disabled={blockDetailSaving}
                  style={{
                    padding: "9px 12px",
                    borderRadius: ui.radius.md,
                    border: "1px solid rgba(100,116,139,0.35)",
                    background: "rgba(100,116,139,0.12)",
                    color: ui.colors.text,
                    cursor: blockDetailSaving ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    opacity: blockDetailSaving ? 0.6 : 1,
                  }}
                >
                  {blockDetailSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ padding: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <FieldValue
                  label="Scope"
                  value={
                    detailBlock.area_id ? "One area / resource" : "Whole site"
                  }
                />
                <FieldValue
                  label="Area / resource"
                  value={
                    detailBlock.area_id
                      ? canonicalAreaLabel(detailBlockArea)
                      : "Whole site"
                  }
                />
                <FieldValue
                  label="Date"
                  value={formatDateLabel(detailBlock.start_at)}
                />
                <FieldValue
                  label="Time"
                  value={formatTimeRange(
                    detailBlock.start_at,
                    detailBlock.end_at,
                  )}
                />
                <FieldValue
                  label="Site"
                  value={prettySiteName(detailBlockSiteId)}
                />
                <FieldValue label="Reason" value={detailBlock.reason} />
                <FieldValue
                  label="Created by"
                  value={detailBlock.created_by_name}
                />
                <FieldValue
                  label="Created at"
                  value={formatDateTimeLabel(detailBlock.created_at)}
                />
                <FieldValue
                  label="Last updated by"
                  value={
                    detailBlockLastChange?.changed_by_name ||
                    detailBlock.updated_by_name ||
                    "Not available"
                  }
                />
                <FieldValue
                  label="Last updated"
                  value={
                    detailBlockLastChange
                      ? formatDateTimeLabel(detailBlockLastChange.created_at)
                      : formatDateTimeLabel(detailBlock.updated_at)
                  }
                />
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${ui.colors.border}`,
                  background: "rgba(2, 6, 23, 0.02)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 900 }}>Activity</div>

                {blockActivityLoading ? (
                  <div style={{ marginTop: 10, color: ui.colors.muted }}>
                    Loading activity...
                  </div>
                ) : blockActivityError ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      borderRadius: 10,
                      background: "rgba(245,158,11,0.12)",
                      border: "1px solid rgba(245,158,11,0.35)",
                    }}
                  >
                    {blockActivityError}
                  </div>
                ) : blockActivityRows.length === 0 ? (
                  <div style={{ marginTop: 10, color: ui.colors.muted }}>
                    No activity has been recorded yet.
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {blockActivityRows.map((row) => (
                      <div
                        key={row.id}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          background: ui.colors.cardBg,
                          border: `1px solid ${ui.colors.border}`,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            textTransform: "capitalize",
                          }}
                        >
                          {activityActionLabel(row.action)}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 13,
                            color: ui.colors.muted,
                          }}
                        >
                          {formatDateTimeLabel(row.created_at)}
                          {row.changed_by_name
                            ? ` by ${row.changed_by_name}`
                            : ""}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            color: ui.colors.text,
                          }}
                        >
                          {describeBlockActivity(row)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {blockDetailError ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.35)",
                  }}
                >
                  {blockDetailError}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {canManageSelectedBlock ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBlockDetailEditing(true);
                      setDetailBlockForm(
                        buildBlockDetailForm(detailBlock, detailBlockSiteId),
                      );
                      setBlockDetailError("");
                    }}
                    style={{
                      padding: "9px 12px",
                      borderRadius: ui.radius.md,
                      border: "1px solid rgba(100,116,139,0.35)",
                      background: "rgba(100,116,139,0.12)",
                      color: ui.colors.text,
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Edit
                  </button>
                ) : null}

                {canManageSelectedBlock ? (
                  <button
                    type="button"
                    onClick={cancelBlock}
                    disabled={blockDetailSaving}
                    style={{
                      padding: "9px 12px",
                      borderRadius: ui.radius.md,
                      border: "1px solid rgba(239,68,68,0.35)",
                      background: "rgba(239,68,68,0.12)",
                      color: ui.colors.text,
                      cursor: blockDetailSaving ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      opacity: blockDetailSaving ? 0.6 : 1,
                    }}
                  >
                    Cancel block
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={closeBlockDetailModal}
                  style={{
                    padding: "9px 12px",
                    borderRadius: ui.radius.md,
                    border: `1px solid ${ui.colors.border}`,
                    background: ui.colors.cardBg,
                    color: ui.colors.text,
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </ModalShell>
      ) : null}
    </div>
  );
}
