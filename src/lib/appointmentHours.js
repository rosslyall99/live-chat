import { siteIdToAppointmentBranch } from "./branches";

export const APPOINTMENT_HOURS_DAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export const APPOINTMENT_HOURS_FALLBACKS = {
  DUK: {
    openDays: [1, 2, 3, 4, 5, 6],
    startMinutes: 9 * 60 + 30,
    endMinutes: 16 * 60 + 30,
    source:
      "Seeded/frontend fallback: Duke Street 09:30-16:30, closed Sundays.",
  },
  STE: {
    openDays: [0, 1, 2, 3, 4, 5, 6],
    startMinutes: 9 * 60 + 30,
    endMinutes: 17 * 60 + 30,
    source:
      "Seeded/frontend fallback: St Enoch uses the current calendar range pending confirmation.",
  },
};

function timeValueFromMinutes(totalMinutes) {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function minutesFromTimeValue(value) {
  const [hh, mm] = String(value || "").split(":");
  const hours = Number(hh);
  const minutes = Number(mm);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

function buildFallbackOpeningHours(branchCode) {
  const fallback =
    APPOINTMENT_HOURS_FALLBACKS[branchCode] || APPOINTMENT_HOURS_FALLBACKS.STE;
  const result = {};

  for (const { value } of APPOINTMENT_HOURS_DAY_OPTIONS) {
    const isClosed = !fallback.openDays.includes(value);
    const startMinutes =
      branchCode === "STE" && value === 0 ? 11 * 60 : fallback.startMinutes;
    const endMinutes =
      branchCode === "STE" && value === 0 ? 16 * 60 : fallback.endMinutes;
    result[String(value)] = {
      is_closed: isClosed,
      open_time: isClosed ? "" : timeValueFromMinutes(startMinutes),
      close_time: isClosed ? "" : timeValueFromMinutes(endMinutes),
    };
  }

  return result;
}

export function getFallbackOpeningHours(siteId) {
  return buildFallbackOpeningHours(siteIdToAppointmentBranch(siteId));
}

export function normalizeOpeningHours(rawOpeningHours, siteId) {
  const fallback = getFallbackOpeningHours(siteId);
  const source = rawOpeningHours ? "Supabase site_settings.opening_hours" : "Fallback";
  const normalized = {};

  for (const { value } of APPOINTMENT_HOURS_DAY_OPTIONS) {
    const key = String(value);
    const rawDay = rawOpeningHours?.[key];
    const fallbackDay = fallback[key];
    const isClosed =
      typeof rawDay?.is_closed === "boolean"
        ? rawDay.is_closed
        : Boolean(fallbackDay?.is_closed);
    const openTime =
      typeof rawDay?.open_time === "string" && rawDay.open_time.trim()
        ? rawDay.open_time.trim().slice(0, 5)
        : fallbackDay?.open_time || "";
    const closeTime =
      typeof rawDay?.close_time === "string" && rawDay.close_time.trim()
        ? rawDay.close_time.trim().slice(0, 5)
        : fallbackDay?.close_time || "";

    normalized[key] = {
      is_closed: isClosed,
      open_time: isClosed ? "" : openTime,
      close_time: isClosed ? "" : closeTime,
    };
  }

  return { hours: normalized, source };
}

export function getBookableWindowForSiteDate(siteId, dateValue, openingHoursBySite = {}) {
  const branchCode = siteIdToAppointmentBranch(siteId);
  const fallbackMeta =
    APPOINTMENT_HOURS_FALLBACKS[branchCode] || APPOINTMENT_HOURS_FALLBACKS.STE;
  const date = new Date(`${dateValue}T12:00:00`);

  if (!branchCode) {
    return {
      isOpen: false,
      reason: "Appointments are not available for this site.",
      source: "",
    };
  }

  if (Number.isNaN(date.getTime())) {
    return {
      isOpen: false,
      reason: "Choose a valid date to see available times.",
      source: fallbackMeta.source,
    };
  }

  const { hours, source } = normalizeOpeningHours(
    openingHoursBySite?.[siteId] || null,
    siteId,
  );
  const dayKey = String(date.getDay());
  const dayHours = hours[dayKey];
  const startMinutes = minutesFromTimeValue(dayHours?.open_time);
  const endMinutes = minutesFromTimeValue(dayHours?.close_time);

  if (dayHours?.is_closed) {
    return {
      isOpen: false,
      reason: "This branch is closed on this date.",
      source: source === "Fallback" ? fallbackMeta.source : source,
    };
  }

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return {
      isOpen: false,
      reason: "Bookable hours are not configured correctly for this day.",
      source: source === "Fallback" ? fallbackMeta.source : source,
    };
  }

  return {
    isOpen: true,
    startMinutes,
    endMinutes,
    source: source === "Fallback" ? fallbackMeta.source : source,
  };
}
