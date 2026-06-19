import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import { invokeAuthed } from "../lib/invokeAuthed";
import "./Appointments.css";
import {
  appointmentBranchToSiteId,
  getBookableAppointmentSites,
  getDefaultAppointmentSiteId,
  isBookableAppointmentSite,
  prettySiteName,
  siteIdToAppointmentBranch,
} from "../lib/branches";
import { getBookableWindowForSiteDate } from "../lib/appointmentHours";

const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 18;
const CALENDAR_START_MINUTES = 9 * 60 + 30;
const CALENDAR_END_MINUTES = 17 * 60 + 30;
const CALENDAR_TOTAL_MINUTES = CALENDAR_END_MINUTES - CALENDAR_START_MINUTES;
const HOUR_HEIGHT = 50;
const CALENDAR_SLOT_INTERVAL_MINUTES = 15;
const TIME_OPTION_INTERVAL_MINUTES = 5;
const QUICK_CREATE_DEFAULT_DURATION_MINUTES = 30;
const CALENDAR_VIEWPORT_HEIGHT = "calc(100vh - 198px)";

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

function formatCompactDateLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--/--/--";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatDateHeading(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Choose a date";
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

function roundMinutesToNearestInterval(
  totalMinutes,
  intervalMinutes = CALENDAR_SLOT_INTERVAL_MINUTES,
) {
  if (!Number.isFinite(totalMinutes) || intervalMinutes <= 0) return 0;
  return Math.round(totalMinutes / intervalMinutes) * intervalMinutes;
}

function minutesFromIso(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return CALENDAR_START_MINUTES;
  return date.getHours() * 60 + date.getMinutes();
}

function toPosition(iso, timelineStartMinutes, timelineHeight) {
  const relativeMinutes = clamp(
    minutesFromIso(iso) - timelineStartMinutes,
    0,
    CALENDAR_TOTAL_MINUTES,
  );
  return (relativeMinutes / CALENDAR_TOTAL_MINUTES) * timelineHeight;
}

function itemHeight(startAt, endAt, timelineStartMinutes, timelineHeight) {
  const clampedStart = clamp(
    minutesFromIso(startAt) - timelineStartMinutes,
    0,
    CALENDAR_TOTAL_MINUTES,
  );
  const clampedEnd = clamp(
    minutesFromIso(endAt) - timelineStartMinutes,
    0,
    CALENDAR_TOTAL_MINUTES,
  );
  const durationMinutes = Math.max(clampedEnd - clampedStart, 12);
  return (durationMinutes / CALENDAR_TOTAL_MINUTES) * timelineHeight;
}

function timeLabelFromMinutes(totalMinutes) {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function timeValueToMinutes(value) {
  const [hh, mm] = String(value || "").split(":");
  const hours = Number(hh);
  const minutes = Number(mm);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

function itemMatchesWizardDate(item, dateValue) {
  return inputDateValueFromIso(item?.start_at) === dateValue;
}

function buildBusyIntervalsForResource({
  appointments,
  blocks,
  areaId,
  dateValue,
}) {
  const busy = [];

  for (const item of appointments || []) {
    if (item?.status === "cancelled") continue;
    if (item?.area_id !== areaId) continue;
    if (!itemMatchesWizardDate(item, dateValue)) continue;
    busy.push({
      startMinutes: minutesFromIso(item.start_at),
      endMinutes: minutesFromIso(item.end_at),
    });
  }

  for (const item of blocks || []) {
    const isAreaMatch = item?.area_id === areaId;
    const isBranchWide = !item?.area_id;
    if (!isAreaMatch && !isBranchWide) continue;
    if (!itemMatchesWizardDate(item, dateValue)) continue;
    busy.push({
      startMinutes: minutesFromIso(item.start_at),
      endMinutes: minutesFromIso(item.end_at),
    });
  }

  return busy.sort((a, b) => a.startMinutes - b.startMinutes);
}

function doIntervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function findAvailableSlots({
  dateValue,
  durationMinutes,
  resources,
  appointments,
  blocks,
  bookableWindow,
  maxSlots = Infinity,
}) {
  if (!bookableWindow?.isOpen) return [];
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return [];
  if (!Array.isArray(resources) || resources.length === 0) return [];

  const latestStartMinutes = bookableWindow.endMinutes - durationMinutes;
  if (latestStartMinutes < bookableWindow.startMinutes) return [];

  const suggestions = [];

  for (
    let startMinutes = bookableWindow.startMinutes;
    startMinutes <= latestStartMinutes;
    startMinutes += CALENDAR_SLOT_INTERVAL_MINUTES
  ) {
    const endMinutes = startMinutes + durationMinutes;
    const startTime = timeLabelFromMinutes(startMinutes);
    const endTime = timeLabelFromMinutes(endMinutes);

    for (const area of resources) {
      const busyIntervals = buildBusyIntervalsForResource({
        appointments,
        blocks,
        areaId: area.id,
        dateValue,
      });
      const hasConflict = busyIntervals.some((interval) =>
        doIntervalsOverlap(
          startMinutes,
          endMinutes,
          interval.startMinutes,
          interval.endMinutes,
        ),
      );

      if (hasConflict) continue;

      suggestions.push({
        areaId: area.id,
        areaLabel: canonicalAreaLabel(area),
        startTime,
        endTime,
        startAt: toDateTimeIso(dateValue, startTime),
        endAt: toDateTimeIso(dateValue, endTime),
      });

      if (suggestions.length >= maxSlots) {
        return suggestions;
      }
    }
  }

  return suggestions;
}

function validateTimeRangeWithinBookableWindow({
  bookableWindow,
  startTime,
  endTime,
}) {
  if (!bookableWindow?.isOpen) {
    return bookableWindow?.reason || "This branch is closed on this date.";
  }

  const startMinutes = timeValueToMinutes(startTime);
  const endMinutes = timeValueToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return "Choose a valid appointment time.";
  }

  if (startMinutes < bookableWindow.startMinutes) {
    return "Appointments cannot start before the branch opens.";
  }

  if (endMinutes > bookableWindow.endMinutes) {
    return "Appointments cannot end after the branch closes.";
  }

  return "";
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

function appointmentTypeTextColor(item, typesById) {
  return (
    item.appointment_type_text_color ||
    typesById[item.appointment_type_id]?.text_color ||
    ""
  );
}

function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)
    ? normalized
    : "";
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "";

  let value = normalized.slice(1);
  if (value.length === 3) {
    value = value
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const APPOINTMENT_TYPE_STYLES = {
  "Hire Measurement": {
    background: "rgba(16,185,129,0.14)",
    border: "rgba(16,185,129,0.32)",
    accent: "#047857",
  },
  "Style & Fit": {
    background: "rgba(59,130,246,0.14)",
    border: "rgba(59,130,246,0.30)",
    accent: "#1d4ed8",
  },
  "Full Try On": {
    background: "rgba(245,158,11,0.14)",
    border: "rgba(245,158,11,0.32)",
    accent: "#b45309",
  },
  Remeasure: {
    background: "rgba(168,85,247,0.14)",
    border: "rgba(168,85,247,0.30)",
    accent: "#7e22ce",
  },
  Collection: {
    background: "rgba(20,184,166,0.14)",
    border: "rgba(20,184,166,0.30)",
    accent: "#0f766e",
  },
  default: {
    background: "rgba(99,102,241,0.12)",
    border: "rgba(99,102,241,0.24)",
    accent: "#4338ca",
  },
};

function appointmentTypeAccent(label, color) {
  const value = String(label || "").trim();
  const adminColor = normalizeHexColor(color);
  const withColor = (style) =>
    adminColor
      ? {
          ...style,
          background: adminColor,
          border: adminColor,
          accent: adminColor,
        }
      : style;

  if (APPOINTMENT_TYPE_STYLES[value]) {
    return withColor(APPOINTMENT_TYPE_STYLES[value]);
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("measurement")) {
    return withColor(APPOINTMENT_TYPE_STYLES["Hire Measurement"]);
  }
  if (normalized.includes("style") || normalized.includes("fit")) {
    return withColor(APPOINTMENT_TYPE_STYLES["Style & Fit"]);
  }
  if (normalized.includes("try")) {
    return withColor(APPOINTMENT_TYPE_STYLES["Full Try On"]);
  }
  if (normalized.includes("remeasure")) {
    return withColor(APPOINTMENT_TYPE_STYLES.Remeasure);
  }
  if (normalized.includes("collection")) {
    return withColor(APPOINTMENT_TYPE_STYLES.Collection);
  }
  return withColor(APPOINTMENT_TYPE_STYLES.default);
}

function appointmentTextStyleVariables(textColor) {
  const normalizedTextColor = normalizeHexColor(textColor);
  if (!normalizedTextColor) return {};

  return {
    "--appointment-entry-text-color": normalizedTextColor,
    "--appointment-entry-muted-color": normalizedTextColor,
    "--appointment-entry-type-color": normalizedTextColor,
  };
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
    endTime: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    internalNotes: "",
    sendConfirmationAfterSave: false,
  };
}

const APPOINTMENT_TYPE_CODES = {
  hireMeasurement: "hire_measurement",
  hireRemeasure: "hire_remeasure",
  hireCollection: "hire_collection",
  hireStyleFit: "hire_style_fit",
  hireFullTryOn: "hire_full_try_on",
  retailPurchaseFullKiltPackage: "retail_purchase_full_kilt_package",
  retailPurchaseKiltOnly: "retail_purchase_kilt_only",
  retailPurchaseTrousers: "retail_purchase_trousers",
  retailPurchaseJacketWaistcoat: "retail_purchase_jacket_waistcoat",
  retailPurchaseAccessories: "retail_purchase_accessories",
  retailCollectionFullKiltOutfit: "retail_collection_full_kilt_outfit",
  retailCollectionKiltOnly: "retail_collection_kilt_only",
  retailCollectionTrousers: "retail_collection_trousers",
  retailCollectionJacketWaistcoat: "retail_collection_jacket_waistcoat",
  retailCollectionAccessories: "retail_collection_accessories",
  alterationKilt: "alteration_kilt",
  alterationTrews: "alteration_trews",
  customAppointment: "custom_appointment",
};

const LEGACY_APPOINTMENT_TYPE_CODE_BY_NAME = {
  "hire measurement": APPOINTMENT_TYPE_CODES.hireMeasurement,
  "hire remeasure": APPOINTMENT_TYPE_CODES.hireRemeasure,
  remeasure: APPOINTMENT_TYPE_CODES.hireRemeasure,
  "collection": APPOINTMENT_TYPE_CODES.hireCollection,
  "party collection try on": APPOINTMENT_TYPE_CODES.hireCollection,
  "hire collection": APPOINTMENT_TYPE_CODES.hireCollection,
  "style fit": APPOINTMENT_TYPE_CODES.hireStyleFit,
  "full try on": APPOINTMENT_TYPE_CODES.hireFullTryOn,
  "retail purchase full kilt package":
    APPOINTMENT_TYPE_CODES.retailPurchaseFullKiltPackage,
  "retail purchase kilt only": APPOINTMENT_TYPE_CODES.retailPurchaseKiltOnly,
  "retail purchase trousers": APPOINTMENT_TYPE_CODES.retailPurchaseTrousers,
  "retail purchase jacket waistcoat":
    APPOINTMENT_TYPE_CODES.retailPurchaseJacketWaistcoat,
  "retail purchase accessories":
    APPOINTMENT_TYPE_CODES.retailPurchaseAccessories,
  "retail collection full kilt outfit":
    APPOINTMENT_TYPE_CODES.retailCollectionFullKiltOutfit,
  "retail collection kilt only":
    APPOINTMENT_TYPE_CODES.retailCollectionKiltOnly,
  "retail collection trousers":
    APPOINTMENT_TYPE_CODES.retailCollectionTrousers,
  "retail collection jacket waistcoat":
    APPOINTMENT_TYPE_CODES.retailCollectionJacketWaistcoat,
  "retail collection accessories":
    APPOINTMENT_TYPE_CODES.retailCollectionAccessories,
  "alteration kilt": APPOINTMENT_TYPE_CODES.alterationKilt,
  "alteration trews": APPOINTMENT_TYPE_CODES.alterationTrews,
  "custom appointment": APPOINTMENT_TYPE_CODES.customAppointment,
};

function buildInitialWizardForm() {
  return {
    category: "",
    selectedTypeId: "",
    adults: "1",
    children: "0",
    customLabel: "",
    customDurationMinutes: "",
    fullTryOnAcknowledged: false,
    additionalTimeMinutes: "0",
  };
}

function parseCount(value) {
  const nextValue = Number.parseInt(String(value || "0"), 10);
  if (!Number.isFinite(nextValue) || nextValue < 0) return 0;
  return nextValue;
}

function durationFromPartySize(totalPeople) {
  if (totalPeople <= 0) return 0;
  return Math.min(60, 10 + totalPeople * 5);
}

function durationFromAdultMeasurementCount(totalAdults) {
  const count = Math.max(0, parseCount(totalAdults));
  if (count === 0) return 0;
  if (count >= 10) return 60;
  return 10 + count * 5;
}

// Explicit children mapping taken from the "Services List" sheet in
// Ross's uploaded "Appointment Types.xlsx" workbook:
// - Childs Hire Measurement: 1 = 30, 2 = 45, 3 = 60
// - Childs Hire Remeasure: 1 = 30, 2 = 45, 3 = 60
// The workbook currently defines rows up to 3 children only, so larger values
// clamp to the highest known workbook duration instead of guessing new timings.
const CHILD_MEASUREMENT_DURATION_BY_COUNT = {
  0: 0,
  1: 30,
  2: 45,
  3: 60,
};

function durationFromChildMeasurementCount(totalChildren) {
  const count = Math.max(0, parseCount(totalChildren));
  if (count >= 3) return CHILD_MEASUREMENT_DURATION_BY_COUNT[3];
  return CHILD_MEASUREMENT_DURATION_BY_COUNT[count] || 0;
}

function buildMeasurementDurationBreakdown(totalAdults, totalChildren) {
  const adultCount = parseCount(totalAdults);
  const childCount = parseCount(totalChildren);
  const adultMinutes = durationFromAdultMeasurementCount(adultCount);
  const childMinutes = durationFromChildMeasurementCount(childCount);

  return {
    kind: "measurement",
    adultCount,
    childCount,
    adultMinutes,
    childMinutes,
    totalMinutes: adultMinutes + childMinutes,
  };
}

function buildCollectionDurationBreakdown(totalAdults, totalChildren) {
  const adultCount = parseCount(totalAdults);
  const childCount = parseCount(totalChildren);
  const totalPeople = adultCount + childCount;

  return {
    kind: "collection",
    adultCount,
    childCount,
    totalPeople,
    totalMinutes: durationFromPartySize(totalPeople),
  };
}

function additionalTimeMinutesValue(value) {
  const amount = Number.parseInt(String(value || "0"), 10);
  if (!Number.isFinite(amount)) return 0;
  return amount;
}

function addMinutesToTimeValueRoundedUp(
  timeValue,
  minutesToAdd,
  intervalMinutes = TIME_OPTION_INTERVAL_MINUTES,
) {
  const [hh, mm] = String(timeValue || "").split(":");
  const baseHours = Number(hh);
  const baseMinutes = Number(mm);
  if (
    !Number.isInteger(baseHours) ||
    !Number.isInteger(baseMinutes) ||
    !Number.isFinite(minutesToAdd)
  ) {
    return "";
  }

  const totalMinutes = baseHours * 60 + baseMinutes + minutesToAdd;
  if (totalMinutes < 0) return "";
  const roundedMinutes =
    Math.ceil(totalMinutes / intervalMinutes) * intervalMinutes;
  const nextHours = Math.floor(roundedMinutes / 60);
  const nextMinutes = roundedMinutes % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function normalizeAppointmentTypeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function appointmentTypeCode(item) {
  const explicitCode = String(item?.code || "").trim().toLowerCase();
  if (explicitCode) return explicitCode;
  return LEGACY_APPOINTMENT_TYPE_CODE_BY_NAME[
    normalizeAppointmentTypeName(item?.name)
  ] || "";
}

function isMeasurementAppointmentTypeCode(code) {
  return (
    code === APPOINTMENT_TYPE_CODES.hireMeasurement ||
    code === APPOINTMENT_TYPE_CODES.hireRemeasure
  );
}

function usesPartyCountsAppointmentTypeCode(code) {
  return (
    isMeasurementAppointmentTypeCode(code) ||
    code === APPOINTMENT_TYPE_CODES.hireCollection
  );
}

function isFullTryOnAppointmentTypeCode(code) {
  return code === APPOINTMENT_TYPE_CODES.hireFullTryOn;
}

function isCustomAppointmentTypeCode(code) {
  return code === APPOINTMENT_TYPE_CODES.customAppointment;
}

function resolveWizardAppointmentType(appointmentTypes, wizardForm) {
  if (!wizardForm?.category) {
    return {
      appointmentType: null,
      baseDurationMinutes: 0,
      suggestedDurationMinutes: 0,
      appointmentTypeLabel: "",
      routeLabel: "",
      summaryLabel: "",
      guidance: "",
      resolutionWarning: "",
    };
  }

  const selectedType =
    appointmentTypes.find((item) => item.id === wizardForm.selectedTypeId) || null;
  if (!selectedType) {
    return {
      appointmentType: null,
      baseDurationMinutes: 0,
      suggestedDurationMinutes: 0,
      appointmentTypeLabel: "",
      routeLabel: "",
      summaryLabel: "",
      guidance: "",
      resolutionWarning: "",
    };
  }

  const additionalTimeMinutes = additionalTimeMinutesValue(
    wizardForm.additionalTimeMinutes,
  );
  const selectedTypeCode = appointmentTypeCode(selectedType);
  let baseDurationMinutes = Number(selectedType.duration_minutes || 0);
  let routeLabel = selectedType.name || "";
  let summaryLabel = selectedType.name || "";
  let guidance = "";
  let durationBreakdown = null;
  if (isMeasurementAppointmentTypeCode(selectedTypeCode)) {
    durationBreakdown = buildMeasurementDurationBreakdown(
      wizardForm.adults,
      wizardForm.children,
    );
    baseDurationMinutes = durationBreakdown.totalMinutes;
  } else if (selectedTypeCode === APPOINTMENT_TYPE_CODES.hireCollection) {
    durationBreakdown = buildCollectionDurationBreakdown(
      wizardForm.adults,
      wizardForm.children,
    );
    baseDurationMinutes = durationBreakdown.totalMinutes;
  } else if (isFullTryOnAppointmentTypeCode(selectedTypeCode)) {
    guidance =
      "Please make sure an outfit has been booked in the hire database for this full try-on appointment.";
  } else if (isCustomAppointmentTypeCode(selectedTypeCode)) {
    routeLabel = wizardForm.customLabel || selectedType.name || "Custom appointment";
    summaryLabel = routeLabel;
    baseDurationMinutes = Number(wizardForm.customDurationMinutes || 0);
  }

  const appointmentType = selectedType;
  const resolvedBaseDurationMinutes = durationBreakdown
    ? durationBreakdown.totalMinutes
    : baseDurationMinutes;
  const resolvedSuggestedDurationMinutes =
    resolvedBaseDurationMinutes + additionalTimeMinutes;
  const resolutionWarning = "";

  return {
    appointmentType,
    baseDurationMinutes: resolvedBaseDurationMinutes,
    suggestedDurationMinutes: resolvedSuggestedDurationMinutes,
    appointmentTypeLabel: summaryLabel || appointmentType?.name || "",
    routeLabel,
    summaryLabel,
    guidance,
    durationBreakdown,
    resolutionWarning,
    additionalTimeMinutes,
  };
}

function wizardStepLabel(step) {
  const labels = [
    "Main category",
    "Appointment type",
    "Booking details",
    "Date and time",
    "Customer details",
    "Summary",
  ];
  return labels[step] || "New appointment";
}

function buildDetailForm(appointment, siteId) {
  return {
    siteId: siteId || "",
    date: inputDateValueFromIso(appointment?.start_at),
    areaId: appointment?.area_id || "",
    appointmentTypeId: appointment?.appointment_type_id || "",
    startTime: inputTimeValueFromIso(appointment?.start_at),
    endTime: inputTimeValueFromIso(appointment?.end_at),
    customerName: appointment?.customer_name || "",
    customerEmail: appointment?.customer_email || "",
    customerPhone: appointment?.customer_phone || "",
    internalNotes: appointment?.internal_notes || "",
  };
}

function buildInitialBlockForm({ siteId, date }) {
  const initialDate = date || todayInputValue();
  return {
    siteId: siteId || "",
    date: initialDate,
    areaId: "",
    startTime: "",
    endTime: "",
    reason: "",
    recurrencePattern: "none",
    recurrenceUntilDate: initialDate,
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

function addMinutesToTimeValue(timeValue, minutesToAdd) {
  const [hh, mm] = String(timeValue || "").split(":");
  const baseHours = Number(hh);
  const baseMinutes = Number(mm);
  if (
    !Number.isInteger(baseHours) ||
    !Number.isInteger(baseMinutes) ||
    !Number.isFinite(minutesToAdd)
  ) {
    return "";
  }

  const totalMinutes = baseHours * 60 + baseMinutes + minutesToAdd;
  if (totalMinutes < 0) return "";
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
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

function shouldShowActivityDescription(row) {
  if (!row) return false;
  return row.action !== "created" && row.action !== "cancelled";
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

function TimelineItem({
  item,
  type,
  timelineStartMinutes,
  timelineHeight,
  typesById,
  onClick,
}) {
  const top = toPosition(item.start_at, timelineStartMinutes, timelineHeight);
  const height = itemHeight(
    item.start_at,
    item.end_at,
    timelineStartMinutes,
    timelineHeight,
  );
  const isBlock = type === "block";
  const bookedBy = bookedByLabel(item);
  const blockLabel = item.area_id ? "Blocked" : "Whole site blocked";
  const appointmentType = appointmentTypeLabel(item, typesById);
  const appointmentAccent = appointmentTypeAccent(
    appointmentType,
    item.appointment_type_color || typesById[item.appointment_type_id]?.color,
  );
  const appointmentTextColorValue = appointmentTypeTextColor(item, typesById);
  const cardAreaLabel = item.area_name || "Area";

  return (
    <button
      className={
        isBlock
          ? "appointment-entry appointment-block-entry"
          : "appointment-entry"
      }
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        left: 8,
        right: 8,
        top,
        height,
        ...appointmentTextStyleVariables(appointmentTextColorValue),
        "--appointment-entry-border": isBlock
          ? "rgba(100,116,139,0.45)"
          : appointmentAccent.border,
        "--appointment-entry-bg": isBlock
          ? "repeating-linear-gradient(-45deg, rgba(148,163,184,0.2), rgba(148,163,184,0.2) 8px, rgba(100,116,139,0.12) 8px, rgba(100,116,139,0.12) 16px)"
          : appointmentAccent.background,
        "--appointment-entry-shadow": isBlock
          ? "inset 0 0 0 1px rgba(255,255,255,0.25)"
          : "0 6px 14px rgba(15,23,42,0.08)",
        "--appointment-entry-type-color":
          normalizeHexColor(appointmentTextColorValue) || appointmentAccent.accent,
      }}
      title={
        isBlock
          ? `${blockLabel}${item.reason ? `: ${item.reason}` : ""}`
          : `${formatTimeRange(item.start_at, item.end_at)} | ${
              item.customer_name || "Unnamed customer"
            } | ${appointmentType}${bookedBy ? ` | Booked by ${bookedBy}` : ""}${
              cardAreaLabel ? ` | ${cardAreaLabel}` : ""
            }`
      }
    >
      {isBlock ? (
        <div className="appointment-block-entry-text">
          {formatTimeRange(item.start_at, item.end_at)} | {blockLabel}
          {item.reason ? ` | ${item.reason}` : ""}
        </div>
      ) : (
        <div className="appointment-entry-content">
          <div className="appointment-entry-time">
            {formatTimeRange(item.start_at, item.end_at)}
          </div>

          <div className="appointment-entry-customer">
            {item.customer_name || "Unnamed customer"}
          </div>

          <div className="appointment-entry-type" title={appointmentType}>
            {appointmentType}
          </div>
        </div>
      )}
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

function SectionCard({ title, subtitle, children, tone = "default" }) {
  const background =
    tone === "softBlue"
      ? "rgba(59,130,246,0.06)"
      : tone === "softSlate"
        ? "rgba(2, 6, 23, 0.02)"
        : "rgba(2, 6, 23, 0.03)";

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background,
        border: `1px solid ${ui.colors.border}`,
      }}
    >
      {title ? <div style={{ fontSize: 13, fontWeight: 900 }}>{title}</div> : null}
      {subtitle ? (
        <div style={{ marginTop: 4, fontSize: 12, color: ui.colors.muted }}>
          {subtitle}
        </div>
      ) : null}
      <div style={{ marginTop: title || subtitle ? 12 : 0 }}>{children}</div>
    </div>
  );
}

export default function Appointments() {
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);

  const [role, setRole] = React.useState("");
  const [profile, setProfile] = React.useState(null);
  const [sites, setSites] = React.useState([]);
  const [selectedSiteId, setSelectedSiteId] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState(todayInputValue);

  const [areas, setAreas] = React.useState([]);
  const [appointments, setAppointments] = React.useState([]);
  const [blocks, setBlocks] = React.useState([]);
  const [siteOpeningHoursBySite, setSiteOpeningHoursBySite] = React.useState({});
  const [appointmentCategories, setAppointmentCategories] = React.useState([]);
  const [appointmentTypes, setAppointmentTypes] = React.useState([]);
  const [typesById, setTypesById] = React.useState({});

  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savePhase, setSavePhase] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [modalAreas, setModalAreas] = React.useState([]);
  const [modalAreasLoading, setModalAreasLoading] = React.useState(false);
  const [wizardDayAppointments, setWizardDayAppointments] = React.useState([]);
  const [wizardDayBlocks, setWizardDayBlocks] = React.useState([]);
  const [wizardDayLoading, setWizardDayLoading] = React.useState(false);
  const [wizardDayError, setWizardDayError] = React.useState("");
  const [form, setForm] = React.useState(() => buildInitialForm({}));
  const [quickCreateEndTimeTouched, setQuickCreateEndTimeTouched] =
    React.useState(false);
  const [quickCreateTypeKey, setQuickCreateTypeKey] = React.useState("");
  const [drawerMode, setDrawerMode] = React.useState("empty");
  const [drawerReturnMode, setDrawerReturnMode] = React.useState("empty");
  const [wizardStep, setWizardStep] = React.useState(0);
  const [wizardForm, setWizardForm] = React.useState(() =>
    buildInitialWizardForm(),
  );

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
  const [sendingReminder, setSendingReminder] = React.useState(false);
  const [isDesktopToolsLayout, setIsDesktopToolsLayout] = React.useState(
    typeof window === "undefined" ? true : window.innerWidth >= 1080,
  );
  const [viewportHeight, setViewportHeight] = React.useState(
    typeof window === "undefined" ? 900 : window.innerHeight,
  );
  const calendarDateInputRef = React.useRef(null);
  const toastTimerRef = React.useRef(null);

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
  const bookableSites = React.useMemo(
    () => getBookableAppointmentSites(sites),
    [sites],
  );
  const selectedSiteIsBookable = isBookableAppointmentSite(selectedSiteId);
  const canOpenCreate = selectedSiteIsBookable && appointmentTypes.length > 0;
  const canOpenBlock = canManageBlocks && selectedSiteIsBookable;
  const canAutoSendConfirmationOnCreate = isLikelyEmail(form.customerEmail);
  const createWizardOpen = modalOpen && drawerMode === "newWizard";
  const quickCreateOpen = modalOpen && drawerMode === "quickCreate";

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

  const showToast = React.useCallback((type, message, timeoutMs) => {
    if (!message) return;
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast({ type, message });

    const dismissAfter = timeoutMs ?? (type === "error" ? 9000 : 5000);

    if (dismissAfter > 0) {
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, dismissAfter);
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const availableWizardCategoryOptions = React.useMemo(() => {
    return appointmentCategories
      .map((category) => {
        const typeCount = appointmentTypes.filter(
          (type) => type.category_id === category.id,
        ).length;
        return {
          value: category.id,
          label: category.name,
          description:
            typeCount === 1 ? "1 active type" : `${typeCount} active types`,
        };
      })
      .filter((option) => option.description !== "0 active types");
  }, [appointmentCategories, appointmentTypes]);

  const selectedWizardCategory = React.useMemo(
    () =>
      appointmentCategories.find((item) => item.id === wizardForm.category) || null,
    [appointmentCategories, wizardForm.category],
  );

  const selectedWizardTypes = React.useMemo(
    () =>
      appointmentTypes.filter((item) => item.category_id === wizardForm.category),
    [appointmentTypes, wizardForm.category],
  );

  const selectedWizardType = React.useMemo(
    () =>
      appointmentTypes.find((item) => item.id === wizardForm.selectedTypeId) || null,
    [appointmentTypes, wizardForm.selectedTypeId],
  );

  const selectedWizardTypeCode = React.useMemo(
    () => appointmentTypeCode(selectedWizardType),
    [selectedWizardType],
  );

  const quickCreateTypeOptions = React.useMemo(() => {
    return selectedWizardTypes.map((item) => ({
      value: item.id,
      label: item.name,
    }));
  }, [selectedWizardTypes]);

  React.useEffect(() => {
    if (
      wizardForm.category &&
      !availableWizardCategoryOptions.some(
        (option) => option.value === wizardForm.category,
      )
    ) {
      setWizardForm(buildInitialWizardForm());
    }
  }, [availableWizardCategoryOptions, wizardForm.category]);

  React.useEffect(() => {
    if (
      wizardForm.selectedTypeId &&
      !selectedWizardTypes.some((option) => option.id === wizardForm.selectedTypeId)
    ) {
      updateWizardForm("selectedTypeId", "");
    }
  }, [selectedWizardTypes, wizardForm.selectedTypeId]);

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

      const branchCode = siteIdToAppointmentBranch(siteIdParam);
      if (!branchCode) {
        setAreas([]);
        setAppointments([]);
        setBlocks([]);
        showToast(
          "error",
          `Appointments are not available for ${prettySiteName(siteIdParam)}.`,
        );
        setLoading(false);
        return;
      }

      try {
        const areasReq = loadAreasForSite(siteIdParam);
        const categoriesReq = supabase
          .from("appointment_categories")
          .select("id, name, code, sort_order, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        const typesReq = supabase
          .from("appointment_types")
          .select(
            "id, name, code, category_id, duration_minutes, color, text_color, is_active, sort_order",
          )
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

        const [areasRes, categoriesRes, typesRes, calendarRes, blocksRes] =
          await Promise.allSettled([
            areasReq,
            categoriesReq,
            typesReq,
            calendarReq,
            blocksReq,
          ]);

        if (areasRes.status === "fulfilled") {
          setAreas(areasRes.value);
        } else {
          throw areasRes.reason;
        }

        if (categoriesRes.status === "fulfilled") {
          if (categoriesRes.value.error) {
            console.error(
              "appointments: categories load failed",
              categoriesRes.value.error,
            );
            setAppointmentCategories([]);
          } else {
            setAppointmentCategories(categoriesRes.value.data || []);
          }
        } else {
          console.error(
            "appointments: categories load failed",
            categoriesRes.reason,
          );
          setAppointmentCategories([]);
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
            showToast(
              "error",
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
          showToast(
            "error",
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
            showToast(
              "info",
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
          showToast(
            "info",
            "Blocked-out periods could not be loaded for this date.",
          );
        }
      } catch (err) {
        console.error("appointments: load failed", err);
        setAreas([]);
        setAppointments([]);
        setBlocks([]);
        setAppointmentCategories([]);
        showToast(
          "error",
          readErrorMessage(err, "Could not load appointment calendar."),
        );
      } finally {
        setLoading(false);
      }
    },
    [loadAreasForSite, profile?.site_id, showToast],
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
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);

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
          showToast(
            "error",
            readErrorMessage(err, "Could not load appointment access."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  React.useEffect(() => {
    if (!selectedSiteId || !profile?.site_id) return;
    loadCalendar(selectedSiteId, selectedDate);
  }, [loadCalendar, profile?.site_id, selectedDate, selectedSiteId]);

  const visibleSiteName = React.useMemo(
    () => prettySiteName(selectedSiteId || profile?.site_id),
    [profile?.site_id, selectedSiteId],
  );

  React.useEffect(() => {
    if (loading) return;
    if (!showSiteSelector && !selectedSiteIsBookable) {
      showToast(
        "info",
        `Appointments are only available for Duke Street and St Enoch. Your current site is ${visibleSiteName}.`,
        8000,
      );
    }
  }, [
    loading,
    selectedSiteIsBookable,
    showSiteSelector,
    showToast,
    visibleSiteName,
  ]);

  React.useEffect(() => {
    if (loading) return;
    if (showSiteSelector && bookableSites.length === 0) {
      showToast(
        "info",
        "No bookable appointment sites are available yet. Seed Duke Street and St Enoch appointment areas first.",
        8000,
      );
    }
  }, [bookableSites.length, loading, showSiteSelector, showToast]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadSiteOpeningHours() {
      const siteIds = getBookableAppointmentSites(sites).map((site) => site.id);
      if (siteIds.length === 0) {
        setSiteOpeningHoursBySite({});
        return;
      }

      try {
        const { data, error } = await supabase
          .from("site_settings")
          .select("site_id, opening_hours")
          .in("site_id", siteIds);

        if (error) throw error;
        if (cancelled) return;

        const next = {};
        for (const row of data || []) {
          next[row.site_id] = row.opening_hours || null;
        }
        setSiteOpeningHoursBySite(next);
      } catch (err) {
        console.error("appointments: site opening hours load failed", err);
        if (!cancelled) {
          setSiteOpeningHoursBySite({});
        }
      }
    }

    loadSiteOpeningHours();

    return () => {
      cancelled = true;
    };
  }, [sites]);

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

  React.useEffect(() => {
    let cancelled = false;

    async function loadWizardDayData() {
      if (!createWizardOpen) {
        setWizardDayAppointments([]);
        setWizardDayBlocks([]);
        setWizardDayError("");
        setWizardDayLoading(false);
        return;
      }
      if (!form.siteId || !form.date || !isBookableAppointmentSite(form.siteId)) {
        setWizardDayAppointments([]);
        setWizardDayBlocks([]);
        setWizardDayError("");
        return;
      }

      if (form.siteId === selectedSiteId && form.date === selectedDate) {
        setWizardDayAppointments(appointments);
        setWizardDayBlocks(blocks);
        setWizardDayError("");
        setWizardDayLoading(false);
        return;
      }

      const branchCode = siteIdToAppointmentBranch(form.siteId);
      if (!branchCode) {
        setWizardDayAppointments([]);
        setWizardDayBlocks([]);
        setWizardDayError("");
        return;
      }

      setWizardDayLoading(true);
      setWizardDayError("");
      setWizardDayAppointments([]);
      setWizardDayBlocks([]);

      try {
        const [appointmentsRes, blocksRes] = await Promise.all([
          supabase.rpc("get_calendar_day_agent", {
            p_branch: branchCode,
            p_day: form.date,
          }),
          supabase.rpc("get_blocks_day_agent", {
            p_branch: branchCode,
            p_day: form.date,
          }),
        ]);

        if (appointmentsRes.error) throw appointmentsRes.error;
        if (blocksRes.error) throw blocksRes.error;
        if (cancelled) return;

        setWizardDayAppointments(appointmentsRes.data || []);
        setWizardDayBlocks(blocksRes.data || []);
      } catch (err) {
        console.error("appointments: wizard day data load failed", err);
        if (cancelled) return;
        setWizardDayAppointments([]);
        setWizardDayBlocks([]);
        setWizardDayError("Available slots could not be loaded for this day.");
      } finally {
        if (!cancelled) setWizardDayLoading(false);
      }
    }

    loadWizardDayData();

    return () => {
      cancelled = true;
    };
  }, [
    appointments,
    blocks,
    createWizardOpen,
    form.date,
    form.siteId,
    selectedDate,
    selectedSiteId,
  ]);

  const timelineStartMinutes = CALENDAR_START_MINUTES;
  const timelineEndMinutes = CALENDAR_END_MINUTES;
  const timelineHeight = React.useMemo(() => {
    if (!isDesktopToolsLayout) {
      return Math.max((CALENDAR_TOTAL_MINUTES / 60) * HOUR_HEIGHT, 540);
    }
    return Math.max(viewportHeight - 288, 540);
  }, [isDesktopToolsLayout, viewportHeight]);

  const timeTicks = React.useMemo(() => {
    const items = [];
    for (
      let minutes = timelineStartMinutes;
      minutes <= timelineEndMinutes;
      minutes += 30
    ) {
      items.push(minutes);
    }
    return items;
  }, [timelineEndMinutes, timelineStartMinutes]);

  const quickCreateSlotStarts = React.useMemo(() => {
    const items = [];
    for (
      let minutes = timelineStartMinutes;
      minutes < timelineEndMinutes;
      minutes += CALENDAR_SLOT_INTERVAL_MINUTES
    ) {
      items.push(minutes);
    }
    return items;
  }, [timelineEndMinutes, timelineStartMinutes]);

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
  const selectorSites = showSiteSelector ? bookableSites : sites;
  const timeOptions = React.useMemo(
    () => buildTimeOptions(DEFAULT_START_HOUR, DEFAULT_END_HOUR),
    [],
  );
  const quickCreateEndTimeFor = React.useCallback(
    (startTime, appointmentTypeId = "") => {
      if (!startTime) return "";
      const nextType = appointmentTypes.find(
        (item) => item.id === appointmentTypeId,
      );
      const durationMinutes =
        Number(nextType?.duration_minutes) || QUICK_CREATE_DEFAULT_DURATION_MINUTES;
      return addMinutesToTimeValueRoundedUp(startTime, durationMinutes);
    },
    [appointmentTypes],
  );
  const detailAppointmentTypeOptions = React.useMemo(() => {
    const currentId = detailAppointment?.appointment_type_id;
    const hasCurrent = currentId
      ? appointmentTypes.some((item) => item.id === currentId)
      : true;

    if (hasCurrent || !currentId || !detailAppointment?.appointment_type_name) {
      return appointmentTypes;
    }

    return [
      ...appointmentTypes,
      {
        id: currentId,
        name: detailAppointment.appointment_type_name,
        duration_minutes: Math.max(
          0,
          Math.round(
            (new Date(detailAppointment.end_at).getTime() -
              new Date(detailAppointment.start_at).getTime()) /
              60000,
          ),
        ),
        is_active: false,
      },
    ];
  }, [appointmentTypes, detailAppointment]);
  const detailSelectedType =
    detailAppointmentTypeOptions.find(
      (item) => item.id === detailForm.appointmentTypeId,
    ) ||
    null;

  const detailEndTimeLabel =
    detailForm.startTime && detailSelectedType
      ? addMinutesToTimeValue(
          detailForm.startTime,
          detailSelectedType.duration_minutes,
        )
      : "";

  const detailSiteId = detailAppointment
    ? appointmentBranchToSiteId(detailAppointment.branch) || selectedSiteId
    : selectedSiteId;
  const detailBookableWindow = React.useMemo(
    () =>
      getBookableWindowForSiteDate(
        detailSiteId,
        detailForm.date,
        siteOpeningHoursBySite,
      ),
    [detailForm.date, detailSiteId, siteOpeningHoursBySite],
  );

  const detailArea = React.useMemo(
    () => areas.find((item) => item.id === detailAppointment?.area_id) || null,
    [areas, detailAppointment],
  );

  const visibleActivityRows = React.useMemo(
    () =>
      activityRows.filter(
        (row) =>
          row.action !== "confirmation_sent" && row.action !== "reminder_sent",
      ),
    [activityRows],
  );
  const detailAppointmentType = detailAppointment
    ? appointmentTypeLabel(detailAppointment, typesById)
    : "Appointment";
  const detailTypeAccent = appointmentTypeAccent(
    detailAppointmentType,
    detailAppointment?.appointment_type_color ||
      typesById[detailAppointment?.appointment_type_id]?.color,
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
  const detailBlockIsRecurring = Boolean(detailBlock?.recurrence_group_id);
  const detailBlockRecurrenceLabel =
    detailBlock?.recurrence_pattern === "daily"
      ? "Every day"
      : detailBlock?.recurrence_pattern === "weekly"
        ? "Every week"
        : "Does not repeat";

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

  const wizardResolution = React.useMemo(
    () => resolveWizardAppointmentType(appointmentTypes, wizardForm),
    [appointmentTypes, wizardForm],
  );
  const wizardSelectedType = wizardResolution.appointmentType;
  const wizardSelectedTypeCode = React.useMemo(
    () => appointmentTypeCode(wizardSelectedType),
    [wizardSelectedType],
  );
  const wizardBaseDurationMinutes = wizardResolution.baseDurationMinutes;
  const wizardSuggestedDurationMinutes =
    wizardResolution.suggestedDurationMinutes;
  const wizardSummaryLabel =
    wizardResolution.summaryLabel ||
    wizardResolution.appointmentTypeLabel ||
    "Appointment";
  const wizardTypeAccent = appointmentTypeAccent(
    wizardSelectedType?.name || wizardSummaryLabel,
    wizardSelectedType?.color,
  );
  const wizardDurationBreakdown = wizardResolution.durationBreakdown;
  const wizardResolutionWarning = wizardResolution.resolutionWarning;
  const wizardAdditionalTimeMinutes = wizardResolution.additionalTimeMinutes;

  const wizardCountsSummary = React.useMemo(() => {
    const adults = parseCount(wizardForm.adults);
    const children = parseCount(wizardForm.children);
    const items = [];
    if (adults > 0) items.push(`${adults} adult${adults === 1 ? "" : "s"}`);
    if (children > 0)
      items.push(`${children} child${children === 1 ? "" : "ren"}`);
    return items.join(", ");
  }, [wizardForm.adults, wizardForm.children]);

  const wizardSelectedArea = React.useMemo(
    () => modalAreas.find((item) => item.id === form.areaId) || null,
    [form.areaId, modalAreas],
  );
  const quickCreateSelectedArea = React.useMemo(
    () =>
      modalAreas.find((item) => item.id === form.areaId) ||
      areas.find((item) => item.id === form.areaId) ||
      null,
    [areas, form.areaId, modalAreas],
  );
  const wizardBookableWindow = React.useMemo(
    () =>
      getBookableWindowForSiteDate(
        form.siteId,
        form.date,
        siteOpeningHoursBySite,
      ),
    [form.date, form.siteId, siteOpeningHoursBySite],
  );
  const wizardSuggestionAppointmentsSource = React.useMemo(
    () =>
      form.siteId === selectedSiteId && form.date === selectedDate
        ? appointments
        : wizardDayAppointments,
    [
      appointments,
      form.date,
      form.siteId,
      selectedDate,
      selectedSiteId,
      wizardDayAppointments,
    ],
  );
  const wizardSuggestionBlocksSource = React.useMemo(
    () =>
      form.siteId === selectedSiteId && form.date === selectedDate
        ? blocks
        : wizardDayBlocks,
    [blocks, form.date, form.siteId, selectedDate, selectedSiteId, wizardDayBlocks],
  );
  const wizardSuggestedSlots = React.useMemo(
    () =>
      findAvailableSlots({
        dateValue: form.date,
        durationMinutes: wizardSuggestedDurationMinutes,
        resources: modalAreas,
        appointments: wizardSuggestionAppointmentsSource,
        blocks: wizardSuggestionBlocksSource,
        bookableWindow: wizardBookableWindow,
      }),
    [
      form.date,
      modalAreas,
      wizardSuggestedDurationMinutes,
      wizardSuggestionAppointmentsSource,
      wizardSuggestionBlocksSource,
      wizardBookableWindow,
    ],
  );
  const wizardAvailableAreaSlots = React.useMemo(
    () =>
      wizardSelectedArea
        ? wizardSuggestedSlots.filter((slot) => slot.areaId === wizardSelectedArea.id)
        : [],
    [wizardSelectedArea, wizardSuggestedSlots],
  );
  const wizardAvailableStartTimes = React.useMemo(
    () => [...new Set(wizardAvailableAreaSlots.map((slot) => slot.startTime))],
    [wizardAvailableAreaSlots],
  );
  const wizardSuggestedSlotsMessage = React.useMemo(() => {
    if (wizardSuggestedDurationMinutes <= 0) {
      return "Select appointment details first.";
    }
    if (!form.date) {
      return "Choose a date first.";
    }
    if (!form.siteId || !isBookableAppointmentSite(form.siteId)) {
      return "Choose a valid appointment site first.";
    }
    if (!form.areaId) {
      return "Select an area first.";
    }
    if (!wizardBookableWindow.isOpen) {
      return wizardBookableWindow.reason;
    }
    if (modalAreasLoading || wizardDayLoading) {
      return "Checking available slots...";
    }
    if (wizardDayError) {
      return wizardDayError;
    }
    if (modalAreas.length === 0) {
      return "No appointment areas are available for this site.";
    }
    if (wizardSuggestedSlots.length === 0) {
      return "No available slots found for this duration on this date.";
    }
    return "";
  }, [
    form.areaId,
    form.date,
    form.siteId,
    modalAreas.length,
    modalAreasLoading,
    wizardBookableWindow,
    wizardDayError,
    wizardDayLoading,
    wizardSuggestedDurationMinutes,
    wizardSuggestedSlots.length,
  ]);
  const quickCreateUsesPartyCounts = usesPartyCountsAppointmentTypeCode(
    wizardSelectedTypeCode,
  );
  const quickCreateSuggestedEndTime = React.useMemo(() => {
    if (!quickCreateOpen || !form.startTime) return "";
    const durationMinutes =
      wizardSuggestedDurationMinutes ||
      Number(wizardSelectedType?.duration_minutes || 0) ||
      QUICK_CREATE_DEFAULT_DURATION_MINUTES;
    return addMinutesToTimeValueRoundedUp(form.startTime, durationMinutes);
  }, [
    form.startTime,
    quickCreateOpen,
    wizardSelectedType,
    wizardSuggestedDurationMinutes,
  ]);
  React.useEffect(() => {
    if (!createWizardOpen && !quickCreateOpen) return;

    const nextTypeId = wizardSelectedType?.id || "";

    if (nextTypeId && nextTypeId !== form.appointmentTypeId) {
      setForm((prev) => {
        const nextType =
          appointmentTypes.find((item) => item.id === nextTypeId) || null;
        const nextEndTime =
          quickCreateOpen && prev.startTime
            ? quickCreateEndTimeFor(prev.startTime, nextTypeId)
            : nextType && prev.startTime
              ? addMinutesToTimeValue(prev.startTime, nextType.duration_minutes)
              : prev.endTime;

        return {
          ...prev,
          appointmentTypeId: nextTypeId,
          endTime: nextEndTime,
        };
      });
      return;
    }

    if (
      !nextTypeId &&
      form.appointmentTypeId &&
      form.appointmentTypeId !== wizardForm.selectedTypeId
    ) {
      setForm((prev) => ({ ...prev, appointmentTypeId: "" }));
    }

    if (
      form.startTime &&
      wizardSuggestedDurationMinutes > 0 &&
      (!quickCreateOpen || !quickCreateEndTimeTouched)
    ) {
      const suggestedEndTime = quickCreateOpen
        ? quickCreateSuggestedEndTime
        : addMinutesToTimeValueRoundedUp(
            form.startTime,
            wizardSuggestedDurationMinutes,
          );
      if (suggestedEndTime && suggestedEndTime !== form.endTime) {
        setForm((prev) => ({ ...prev, endTime: suggestedEndTime }));
      }
    }
  }, [
    appointmentTypes,
    createWizardOpen,
    form.appointmentTypeId,
    form.endTime,
    form.startTime,
    quickCreateEndTimeTouched,
    quickCreateEndTimeFor,
    quickCreateOpen,
    quickCreateSuggestedEndTime,
    wizardForm.selectedTypeId,
    wizardSelectedType,
    wizardSelectedTypeCode,
    wizardSuggestedDurationMinutes,
  ]);

  React.useEffect(() => {
    if (!createWizardOpen) return;

    const shouldDisableStartTimes =
      wizardSuggestedDurationMinutes <= 0 ||
      !form.siteId ||
      !form.date ||
      !form.areaId ||
      !wizardBookableWindow.isOpen ||
      modalAreasLoading ||
      wizardDayLoading;

    if (shouldDisableStartTimes) {
      if (form.startTime || form.endTime) {
        setForm((prev) => ({ ...prev, startTime: "", endTime: "" }));
      }
      return;
    }

    if (
      form.startTime &&
      !wizardAvailableStartTimes.includes(form.startTime)
    ) {
      setForm((prev) => ({ ...prev, startTime: "", endTime: "" }));
    }
  }, [
    createWizardOpen,
    form.areaId,
    form.date,
    form.endTime,
    form.siteId,
    form.startTime,
    modalAreasLoading,
    wizardAvailableStartTimes,
    wizardBookableWindow,
    wizardDayLoading,
    wizardSuggestedDurationMinutes,
  ]);

  function openCreateModal() {
    setForm(buildInitialForm({ siteId: selectedSiteId, date: selectedDate }));
    setFormError("");
    setQuickCreateEndTimeTouched(false);
    setQuickCreateTypeKey("");
    setSavePhase("");
    setModalAreas(areas);
    setWizardForm(buildInitialWizardForm());
    setWizardStep(0);
    setDrawerReturnMode(
      detailOpen && detailAppointment ? "detail" : "empty",
    );
    setDrawerMode("newWizard");
    setModalOpen(true);
  }

  function openQuickCreateDrawer({ areaId = "", startTime = "" }) {
    closeDetailModal();
    setForm({
      ...buildInitialForm({ siteId: selectedSiteId, date: selectedDate }),
      areaId,
      startTime,
      endTime: quickCreateEndTimeFor(startTime),
    });
    setFormError("");
    setQuickCreateEndTimeTouched(false);
    setQuickCreateTypeKey("");
    setSavePhase("");
    setModalAreas(areas);
    setWizardForm(buildInitialWizardForm());
    setWizardStep(0);
    setDrawerReturnMode("empty");
    setDrawerMode("quickCreate");
    setModalOpen(true);
  }

  function closeCreateModal() {
    setModalOpen(false);
    setSaving(false);
    setSavePhase("");
    setFormError("");
    setQuickCreateEndTimeTouched(false);
    setQuickCreateTypeKey("");
    setWizardStep(0);
    setDrawerMode(
      drawerReturnMode === "detail" && detailOpen && detailAppointment
        ? "detail"
        : "empty",
    );
  }

  function openBlockModal() {
    setModalOpen(false);
    setDrawerMode("empty");
    setQuickCreateEndTimeTouched(false);
    setQuickCreateTypeKey("");
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
    setModalOpen(false);
    setDetailAppointment(item);
    setDetailForm(buildDetailForm(item, nextSiteId));
    setDetailError("");
    setDetailEditing(false);
    setDetailOpen(true);
    setDrawerMode("detail");
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
    setSendingReminder(false);
    setDrawerMode("empty");
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

  function handleQuickCreateSlotClick(areaId, startMinutes) {
    if (!canOpenCreate) return;
    const roundedMinutes = clamp(
      roundMinutesToNearestInterval(startMinutes),
      CALENDAR_START_MINUTES,
      CALENDAR_END_MINUTES,
    );
    openQuickCreateDrawer({
      areaId,
      startTime: timeLabelFromMinutes(roundedMinutes),
    });
  }

  function updateForm(key, value) {
    if (key === "appointmentTypeId" || key === "startTime") {
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        const nextTypeId =
          key === "appointmentTypeId" ? value : prev.appointmentTypeId;
        const nextStartTime = key === "startTime" ? value : prev.startTime;
        const nextType = appointmentTypes.find((item) => item.id === nextTypeId);
        const shouldAutoUpdateEndTime =
          drawerMode !== "quickCreate" || !quickCreateEndTimeTouched;
        const nextEndTime = shouldAutoUpdateEndTime
          ? drawerMode === "quickCreate"
            ? quickCreateEndTimeFor(nextStartTime, nextTypeId)
            : nextType && nextStartTime
              ? addMinutesToTimeValue(nextStartTime, nextType.duration_minutes)
              : ""
          : prev.endTime;

        return {
          ...next,
          endTime: nextEndTime,
        };
      });
      return;
    }

    if (key === "endTime") {
      if (drawerMode === "quickCreate") {
        setQuickCreateEndTimeTouched(true);
      }
      setForm((prev) => ({ ...prev, endTime: value }));
      return;
    }

    if (key === "customerEmail") {
      setForm((prev) => {
        const nextEmail = value;
        const previousIsValid = isLikelyEmail(prev.customerEmail);
        const nextIsValid = isLikelyEmail(nextEmail);
        const nextSendConfirmationAfterSave = !nextIsValid
          ? false
          : previousIsValid
            ? prev.sendConfirmationAfterSave
            : true;

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
    if (key === "appointmentTypeId" || key === "startTime") {
      setDetailForm((prev) => {
        const next = { ...prev, [key]: value };
        const nextTypeId =
          key === "appointmentTypeId" ? value : prev.appointmentTypeId;
        const nextStartTime = key === "startTime" ? value : prev.startTime;
        const nextType = appointmentTypes.find(
          (item) => item.id === nextTypeId,
        );
        const nextEndTime =
          nextType && nextStartTime
            ? addMinutesToTimeValue(nextStartTime, nextType.duration_minutes)
            : "";

        return {
          ...next,
          endTime: nextEndTime,
        };
      });
      return;
    }

    setDetailForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateBlockForm(key, value) {
    setBlockForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "date") {
        if (!prev.recurrenceUntilDate || prev.recurrenceUntilDate === prev.date) {
          next.recurrenceUntilDate = value;
        }
      }

      if (key === "recurrencePattern" && value === "none") {
        next.recurrenceUntilDate = next.date;
      }

      return next;
    });
  }

  function updateWizardForm(key, value) {
    setWizardForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "category") {
        return {
          ...next,
          selectedTypeId: "",
          customLabel: "",
          customDurationMinutes: "",
          fullTryOnAcknowledged: false,
          adults: "1",
          children: "0",
          additionalTimeMinutes: "0",
        };
      }

      if (key === "selectedTypeId") {
        const selectedType =
          appointmentTypes.find((item) => item.id === value) || null;
        const selectedTypeCode = appointmentTypeCode(selectedType);
        const usesPartyCounts =
          usesPartyCountsAppointmentTypeCode(selectedTypeCode);
        const isCustomType = isCustomAppointmentTypeCode(selectedTypeCode);

        return {
          ...next,
          fullTryOnAcknowledged: false,
          customLabel: "",
          customDurationMinutes: isCustomType
            ? String(selectedType?.duration_minutes || "")
            : "",
          adults: usesPartyCounts ? prev.adults : "0",
          children: usesPartyCounts ? prev.children : "0",
          additionalTimeMinutes: "0",
        };
      }

      return next;
    });
  }

  function updateDetailBlockForm(key, value) {
    setDetailBlockForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateQuickCreateCategory(category) {
    setQuickCreateTypeKey("");
    setFormError("");
    setQuickCreateEndTimeTouched(false);
    setWizardForm({
      ...buildInitialWizardForm(),
      category,
    });
    setForm((prev) => ({
      ...prev,
      appointmentTypeId: "",
      endTime: quickCreateEndTimeFor(prev.startTime, ""),
    }));
  }

  function updateQuickCreateType(value) {
    setQuickCreateTypeKey(value);
    setFormError("");
    setQuickCreateEndTimeTouched(false);
    updateWizardForm("selectedTypeId", value);
  }

  function validateWizardStep(step) {
    if (step === 0) {
      if (!wizardForm.category) return "Choose what the appointment is for.";
      return "";
    }

    if (step === 1) {
      if (!wizardForm.selectedTypeId) return "Choose the appointment type.";
      return "";
    }

    if (step === 2) {
      if (
        usesPartyCountsAppointmentTypeCode(wizardSelectedTypeCode) &&
        parseCount(wizardForm.adults) + parseCount(wizardForm.children) <= 0
      ) {
        return "Add at least one person for this appointment.";
      }

      if (
        isFullTryOnAppointmentTypeCode(wizardSelectedTypeCode) &&
        !wizardForm.fullTryOnAcknowledged
      ) {
        return "Confirm the outfit has been booked in the hire database.";
      }

      if (
        isCustomAppointmentTypeCode(wizardSelectedTypeCode)
      ) {
        if (!wizardForm.customLabel.trim()) {
          return "Enter a custom appointment label.";
        }
        if (!Number(wizardForm.customDurationMinutes)) {
          return "Enter a custom duration in minutes.";
        }
      }

      if (!wizardSelectedType) {
        return "Choose an appointment type to continue.";
      }

      return "";
    }

    if (step === 3) {
      if (!isBookableAppointmentSite(form.siteId)) {
        return "Choose a valid appointment site.";
      }
      if (!form.date) return "Choose a date.";
      if (!form.areaId) return "Choose an appointment area.";
      if (!form.startTime) return "Choose a start time.";
      if (!form.endTime) return "Choose an end time.";

      const times = validateAppointmentTimes({
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        setErrorMessage: () => {},
      });
      if (!times) return "Check that the appointment end time is after the start time.";
      return "";
    }

    if (step === 4) {
      if (!form.customerName.trim()) return "Customer name is required.";
      if (!form.customerEmail.trim()) {
        return "Customer email is required.";
      }
      if (
        isCustomAppointmentTypeCode(wizardSelectedTypeCode) &&
        !form.internalNotes.trim()
      ) {
        return "Internal notes are required for a custom appointment.";
      }
      return "";
    }

    return "";
  }

  function goToWizardStep(nextStep) {
    if (nextStep > wizardStep) {
      const validationMessage = validateWizardStep(wizardStep);
      if (validationMessage) {
        setFormError(validationMessage);
        return;
      }
    }

    setFormError("");
    setWizardStep(clamp(nextStep, 0, 5));
  }

  function validateAppointmentTimes({
    date,
    startTime,
    endTime,
    setErrorMessage,
  }) {
    if (!startTime) {
      setErrorMessage("Start time is required.");
      return null;
    }

    if (!endTime) {
      setErrorMessage("End time is required.");
      return null;
    }

    if (!timeOptions.includes(startTime) || !timeOptions.includes(endTime)) {
      setErrorMessage("Choose a valid start and end time from the dropdowns.");
      return null;
    }

    const startAt = toDateTimeIso(date, startTime);
    const endAt = toDateTimeIso(date, endTime);

    if (!isWithinSelectedDay(date, startAt)) {
      setErrorMessage("Start time must stay within the selected calendar day.");
      return null;
    }

    if (!isWithinSelectedDay(date, endAt)) {
      setErrorMessage("End time must stay within the selected calendar day.");
      return null;
    }

    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setErrorMessage("End time must be after the start time.");
      return null;
    }

    return { startAt, endAt };
  }

  function findLocalConflict(
    nextAreaId,
    nextStartAt,
    nextEndAt,
    excludedAppointmentId = "",
  ) {
    const compareSiteId =
      drawerMode === "detail" && detailOpen ? detailSiteId : form.siteId;
    const compareDate =
      drawerMode === "detail" && detailOpen ? detailForm.date : form.date;
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

  const quickCreateAvailability = (() => {
    if (!quickCreateOpen) {
      return {
        isPossible: false,
        tone: "muted",
        message: "",
      };
    }

    if (!wizardForm.category) {
      return {
        isPossible: false,
        tone: "muted",
        message: "Choose an appointment category to continue.",
      };
    }

    if (!quickCreateTypeKey) {
      return {
        isPossible: false,
        tone: "muted",
        message: "Choose the appointment type for this slot.",
      };
    }

    if (
      isCustomAppointmentTypeCode(wizardSelectedTypeCode) &&
      !wizardForm.customLabel.trim()
    ) {
      return {
        isPossible: false,
        tone: "warning",
        message: "Add a custom appointment label before checking availability.",
      };
    }

    if (
      isCustomAppointmentTypeCode(wizardSelectedTypeCode) &&
      !Number(wizardForm.customDurationMinutes)
    ) {
      return {
        isPossible: false,
        tone: "warning",
        message: "Enter a custom duration before checking availability.",
      };
    }

    if (
      quickCreateUsesPartyCounts &&
      parseCount(wizardForm.adults) + parseCount(wizardForm.children) <= 0
    ) {
      return {
        isPossible: false,
        tone: "warning",
        message: "Add at least one adult or child before checking availability.",
      };
    }

    if (!wizardSelectedType) {
      return {
        isPossible: false,
        tone: "warning",
        message:
          wizardResolutionWarning ||
          "Could not match this quick booking to an appointment type.",
      };
    }

    const suggestedEndTime = quickCreateSuggestedEndTime;

    if (!suggestedEndTime) {
      return {
        isPossible: false,
        tone: "warning",
        message: "This slot needs a valid end time before it can be saved.",
      };
    }

    const times = validateAppointmentTimes({
      date: form.date,
      startTime: form.startTime,
      endTime: suggestedEndTime,
      setErrorMessage: () => {},
    });

    if (!times) {
      return {
        isPossible: false,
        tone: "warning",
        message: "This booking would run beyond the calendar day.",
      };
    }

    const bookableHoursMessage = validateTimeRangeWithinBookableWindow({
      bookableWindow: wizardBookableWindow,
      startTime: form.startTime,
      endTime: suggestedEndTime,
    });

    if (bookableHoursMessage) {
      return {
        isPossible: false,
        tone: "warning",
        message: bookableHoursMessage,
      };
    }

    const availableAreas = modalAreas.filter(
      (area) => !findLocalConflict(area.id, times.startAt, times.endAt),
    );
    const availableAreaCount = availableAreas.length;
    const selectedAreaConflict = findLocalConflict(
      form.areaId,
      times.startAt,
      times.endAt,
    );

    if (selectedAreaConflict) {
      return {
        isPossible: false,
        tone: "warning",
        message: "This time is unavailable.",
      };
    }

    return {
      isPossible: true,
      tone: "success",
      message:
        availableAreaCount > 1
          ? `${availableAreaCount} areas are free at this start time.`
          : "The clicked location is free for this booking.",
      suggestedEndTime,
    };
  })();

  async function submitCreateAppointment(e) {
    e.preventDefault();
    if (saving) return;
    setFormError("");

    if (quickCreateOpen && !quickCreateAvailability.isPossible) {
      const message =
        quickCreateAvailability.message ||
        "This quick appointment is not ready to save yet.";
      setFormError(message);
      showToast("error", message);
      return;
    }

    if (!form.customerName.trim()) {
      setFormError("Customer name is required.");
      showToast("error", "Customer name is required.");
      return;
    }
    if (!form.customerEmail.trim()) {
      setFormError("Customer email is required.");
      showToast("error", "Customer email is required.");
      return;
    }
    if (!form.appointmentTypeId) {
      setFormError("Appointment type is required.");
      showToast("error", "Appointment type is required.");
      return;
    }
    if (!form.areaId) {
      setFormError("Appointment area is required.");
      showToast("error", "Appointment area is required.");
      return;
    }
    if (!form.startTime) {
      setFormError("Start time is required.");
      showToast("error", "Start time is required.");
      return;
    }
    const endTimeValue =
      quickCreateOpen && quickCreateSuggestedEndTime
        ? quickCreateSuggestedEndTime
        : form.endTime;
    if (!endTimeValue) {
      setFormError("End time is required.");
      showToast("error", "End time is required.");
      return;
    }
    if (!isBookableAppointmentSite(form.siteId)) {
      const message =
        "Appointments can only be created for Duke Street or St Enoch.";
      setFormError(message);
      showToast("error", message);
      return;
    }

    const typeRow = appointmentTypes.find(
      (item) => item.id === form.appointmentTypeId,
    );
    if (!typeRow) {
      setFormError("The selected appointment type is not available.");
      showToast("error", "The selected appointment type is not available.");
      return;
    }

    const appointmentTimes = validateAppointmentTimes({
      date: form.date,
      startTime: form.startTime,
      endTime: endTimeValue,
      setErrorMessage: setFormError,
    });
    if (!appointmentTimes) {
      return;
    }
    const { startAt, endAt } = appointmentTimes;

    const bookableHoursMessage = validateTimeRangeWithinBookableWindow({
      bookableWindow: wizardBookableWindow,
      startTime: form.startTime,
      endTime: endTimeValue,
    });
    if (bookableHoursMessage) {
      setFormError(bookableHoursMessage);
      showToast("error", bookableHoursMessage);
      return;
    }

    const localConflict = findLocalConflict(form.areaId, startAt, endAt);
    if (localConflict) {
      setFormError(localConflict);
      showToast("error", localConflict);
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
          p_end_at: endAt,
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

          showToast("success", "Appointment saved and confirmation sent.");
        } catch (sendErr) {
          console.error("appointments: auto confirmation failed", sendErr);
          showToast(
            "info",
            "Appointment saved, but confirmation email could not be sent.",
          );
        }
      } else {
        showToast("success", "Appointment saved.");
      }

      setSelectedSiteId(form.siteId);
      setSelectedDate(form.date);
      closeCreateModal();
      await loadCalendar(form.siteId, form.date);
    } catch (err) {
      console.error("appointments: create failed", err);
      const message = readErrorMessage(
        err,
        "Could not create the appointment.",
      );
      setFormError(message);
      showToast("error", message);
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
    if (
      blockForm.recurrencePattern !== "none" &&
      !blockForm.recurrenceUntilDate
    ) {
      setBlockFormError("Choose the last date for this recurring block.");
      return;
    }
    if (
      blockForm.recurrencePattern !== "none" &&
      blockForm.recurrenceUntilDate < blockForm.date
    ) {
      setBlockFormError(
        "The recurring block end date must be on or after the first block date.",
      );
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
      const rpcName =
        blockForm.recurrencePattern === "none"
          ? "create_appointment_block_staff"
          : "create_recurring_appointment_blocks_staff";
      const rpcParams =
        blockForm.recurrencePattern === "none"
          ? {
              p_site_id: blockForm.siteId,
              p_area_id: blockForm.areaId || null,
              p_start_at: startAt,
              p_end_at: endAt,
              p_reason: blockForm.reason.trim(),
            }
          : {
              p_site_id: blockForm.siteId,
              p_area_id: blockForm.areaId || null,
              p_start_at: startAt,
              p_end_at: endAt,
              p_reason: blockForm.reason.trim(),
              p_recurrence: blockForm.recurrencePattern,
              p_until_date: blockForm.recurrenceUntilDate,
            };

      const { data, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

      if (rpcError) throw rpcError;
      if (!data || data.length === 0) {
        throw new Error("The block could not be created.");
      }

      setSelectedSiteId(blockForm.siteId);
      setSelectedDate(blockForm.date);
      closeBlockModal();
      await loadCalendar(blockForm.siteId, blockForm.date);
      const blockCount = Array.isArray(data) ? data.length : 1;
      showToast(
        "success",
        blockForm.recurrencePattern === "none"
          ? "Block saved."
          : `${blockCount} recurring block${blockCount === 1 ? "" : "s"} saved.`,
      );
    } catch (err) {
      console.error("appointments: create block failed", err);
      const message = readErrorMessage(err, "Could not create the block.");
      setBlockFormError(message);
      showToast("error", message);
    } finally {
      setBlockSaving(false);
    }
  }

  async function submitDetailUpdate(e) {
    e.preventDefault();
    setDetailError("");

    if (!detailAppointment) {
      setDetailError("This appointment is no longer available.");
      showToast("error", "This appointment is no longer available.");
      return;
    }
    if (!detailForm.customerName.trim()) {
      setDetailError("Customer name is required.");
      showToast("error", "Customer name is required.");
      return;
    }
    if (!detailForm.customerEmail.trim()) {
      setDetailError("Customer email is required.");
      showToast("error", "Customer email is required.");
      return;
    }
    if (!detailForm.appointmentTypeId) {
      setDetailError("Appointment type is required.");
      showToast("error", "Appointment type is required.");
      return;
    }
    if (!detailForm.areaId) {
      setDetailError("Appointment area is required.");
      showToast("error", "Appointment area is required.");
      return;
    }
    if (!detailForm.startTime) {
      setDetailError("Start time is required.");
      showToast("error", "Start time is required.");
      return;
    }
    if (!detailForm.endTime) {
      setDetailError("End time is required.");
      showToast("error", "End time is required.");
      return;
    }

    const typeRow = appointmentTypes.find(
      (item) => item.id === detailForm.appointmentTypeId,
    );
    if (!typeRow) {
      setDetailError("The selected appointment type is not available.");
      showToast("error", "The selected appointment type is not available.");
      return;
    }

    const appointmentTimes = validateAppointmentTimes({
      date: detailForm.date,
      startTime: detailForm.startTime,
      endTime: detailForm.endTime,
      setErrorMessage: setDetailError,
    });
    if (!appointmentTimes) {
      return;
    }
    const { startAt, endAt } = appointmentTimes;

    const bookableHoursMessage = validateTimeRangeWithinBookableWindow({
      bookableWindow: detailBookableWindow,
      startTime: detailForm.startTime,
      endTime: detailForm.endTime,
    });
    if (bookableHoursMessage) {
      setDetailError(bookableHoursMessage);
      showToast("error", bookableHoursMessage);
      return;
    }

    const localConflict = findLocalConflict(
      detailForm.areaId,
      startAt,
      endAt,
      detailAppointment.id,
    );
    if (localConflict) {
      setDetailError(localConflict);
      showToast("error", localConflict);
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
          p_end_at: endAt,
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
      showToast("success", "Appointment updated.");
    } catch (err) {
      console.error("appointments: update failed", err);
      const message = readErrorMessage(
        err,
        "Could not update the appointment.",
      );
      setDetailError(message);
      showToast("error", message);
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
      showToast("success", "Appointment cancelled.");
    } catch (err) {
      console.error("appointments: cancel failed", err);
      const message = readErrorMessage(
        err,
        "Could not cancel the appointment.",
      );
      setDetailError(message);
      showToast("error", message);
    } finally {
      setDetailSaving(false);
    }
  }

  async function sendConfirmationEmail() {
    if (!detailAppointment) return;

    setSendingConfirmation(true);
    setDetailError("");

    try {
      const { error } = await invokeAuthed("send_appointment_confirmation", {
        appointment_id: detailAppointment.id,
      });

      if (error) {
        throw new Error(
          error.message || "The confirmation email could not be sent.",
        );
      }

      showToast("success", "Confirmation email sent.");
      await Promise.all([
        loadActivity(detailAppointment.id),
        loadEmailLog(detailAppointment.id),
      ]);
    } catch (err) {
      console.error("appointments: send confirmation failed", err);
      const message = readErrorMessage(
        err,
        "Could not send the confirmation email.",
      );
      setDetailError(message);
      showToast("error", message);
    } finally {
      setSendingConfirmation(false);
    }
  }

  async function sendReminderEmail() {
    if (!detailAppointment) return;

    setSendingReminder(true);
    setDetailError("");

    try {
      const { data, error } = await invokeAuthed("send_appointment_reminder", {
        appointment_id: detailAppointment.id,
      });

      if (error) {
        throw new Error(
          error.message || "The reminder email could not be sent.",
        );
      }

      showToast("success", data?.message || "Reminder email sent.");
      await Promise.all([
        loadActivity(detailAppointment.id),
        loadEmailLog(detailAppointment.id),
      ]);
    } catch (err) {
      console.error("appointments: send reminder failed", err);
      const message = readErrorMessage(
        err,
        "Could not send the reminder email.",
      );
      setDetailError(message);
      showToast("error", message);
    } finally {
      setSendingReminder(false);
    }
  }

  React.useEffect(() => {
    function handleResize() {
      setIsDesktopToolsLayout(window.innerWidth >= 1080);
      setViewportHeight(window.innerHeight);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
      showToast("success", "Block updated.");
    } catch (err) {
      console.error("appointments: update block failed", err);
      const message = readErrorMessage(err, "Could not update the block.");
      setBlockDetailError(message);
      showToast("error", message);
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
      showToast("success", "Block removed.");
    } catch (err) {
      console.error("appointments: cancel block failed", err);
      const message = readErrorMessage(err, "Could not remove the block.");
      setBlockDetailError(message);
      showToast("error", message);
    } finally {
      setBlockDetailSaving(false);
    }
  }

  async function cancelRecurringBlockSeries() {
    if (!detailBlock?.recurrence_group_id) return;
    if (!window.confirm("Remove the entire recurring block series?")) return;

    setBlockDetailSaving(true);
    setBlockDetailError("");

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "cancel_recurring_appointment_block_series_staff",
        {
          p_block_id: detailBlock.id,
        },
      );

      if (rpcError) throw rpcError;

      const deletedCount = Array.isArray(data)
        ? Number(data[0]?.deleted_count || 0)
        : Number(data?.deleted_count || 0);

      closeBlockDetailModal();
      await loadCalendar(detailBlockSiteId, selectedDate);
      showToast(
        "success",
        deletedCount > 0
          ? `${deletedCount} recurring block${deletedCount === 1 ? "" : "s"} removed.`
          : "Recurring block series removed.",
      );
    } catch (err) {
      console.error("appointments: cancel recurring block series failed", err);
      const message = readErrorMessage(
        err,
        "Could not remove the recurring block series.",
      );
      setBlockDetailError(message);
      showToast("error", message);
    } finally {
      setBlockDetailSaving(false);
    }
  }

  const quickJumpButtons = [
    {
      label: "<",
      onClick: () => setSelectedDate((prev) => shiftInputDateValue(prev, -1)),
    },
    { label: "Today", onClick: () => setSelectedDate(todayInputValue()) },
    {
      label: ">",
      onClick: () => setSelectedDate((prev) => shiftInputDateValue(prev, 1)),
    },
  ];

  const calendarPanel = (
    <div
      className="appointment-calendar-card"
      style={{
        height: isDesktopToolsLayout ? "100%" : "auto",
        minHeight: isDesktopToolsLayout ? 0 : undefined,
      }}
    >
      <div className="appointment-calendar-header">
        <div className="appointment-calendar-header-left">
          <div className="appointment-quick-jumps">
            {quickJumpButtons.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                style={{
                  padding: item.label === "Today" ? "7px 12px" : "7px 10px",
                  minWidth: item.label === "Today" ? undefined : 36,
                  fontSize: 12,
                  borderRadius: ui.radius.md,
                  border: `1px solid ${ui.colors.border}`,
                  background: ui.colors.cardBg,
                  color: ui.colors.text,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="appointment-calendar-header-center">
          <button
            className="appointment-date-heading"
            type="button"
            onClick={() => {
              if (calendarDateInputRef.current?.showPicker) {
                calendarDateInputRef.current.showPicker();
                return;
              }
              calendarDateInputRef.current?.click();
            }}
            aria-label={`Selected date ${formatDateHeading(selectedDate)}. Change date.`}
          >
            {formatDateHeading(selectedDate)}
          </button>
          <input
            ref={calendarDateInputRef}
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            aria-label="Change calendar date"
            style={{
              position: "absolute",
              opacity: 0,
              pointerEvents: "none",
              width: 1,
              height: 1,
            }}
            tabIndex={-1}
          />
        </div>

        <div className="appointment-calendar-header-right">
          {showSiteSelector ? (
            <div className="appointment-site-picker-wrap">
              <select
                className="appointment-site-picker"
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                style={{
                  ...baseInputStyle,
                  padding: "9px 40px 9px 12px",
                  marginTop: 0,
                }}
              >
                {selectorSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name || prettySiteName(site.id)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="appointment-site-picker appointment-site-picker-readonly">
              <div className="appointment-site-picker-readonly-value">
                {visibleSiteName}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="appointment-calendar-message">
          Loading this day&apos;s appointments and blocks...
        </div>
      ) : areas.length === 0 ? (
        <div className="appointment-calendar-message">
          Appointment areas/resources need to be seeded for this site before the
          calendar can display columns.
        </div>
      ) : (
        <div className="appointment-calendar-scroll">
          <div
            className="appointment-calendar-grid"
            style={{
              gridTemplateColumns: `74px repeat(${areas.length}, minmax(190px, 1fr))`,
              minWidth: 74 + areas.length * 190,
            }}
          >
            <div className="appointment-grid-cell-header appointment-time-axis-header">
              Time
            </div>

            {areas.map((area, index) => (
              <div
                key={area.id}
                className={`appointment-grid-cell-header${
                  index === areas.length - 1
                    ? " appointment-grid-cell-header--last"
                    : ""
                }`}
              >
                <div className="appointment-area-header-title">
                  {canonicalAreaLabel(area)}
                </div>
              </div>
            ))}

            <div
              className="appointment-time-axis"
              style={{
                height: timelineHeight,
              }}
            >
              {timeTicks.map((minutes, index) => {
                const top =
                  ((minutes - timelineStartMinutes) / CALENDAR_TOTAL_MINUTES) *
                  timelineHeight;
                const isHour = minutes % 60 === 0;
                const isLast = index === timeTicks.length - 1;
                return (
                  <div
                    className="appointment-time-line"
                    key={minutes}
                    style={{
                      top,
                      height: 0,
                      borderTop: isLast
                        ? "1px solid rgba(2, 6, 23, 0.08)"
                        : isHour
                          ? "1px solid rgba(2, 6, 23, 0.08)"
                          : "1px dashed rgba(2, 6, 23, 0.08)",
                    }}
                  >
                    <span className="appointment-time-label">
                      {timeLabelFromMinutes(minutes)}
                    </span>
                  </div>
                );
              })}
            </div>

            {areas.map((area, index) => {
              const areaAppointments = appointmentsByArea[area.id] || [];
              const areaBlocks = [
                ...(blocksByArea[area.id] || []),
                ...(blocksByArea.__branch__ || []),
              ];

              return (
                <div
                  key={area.id}
                  className={`appointment-area-column${
                    index === areas.length - 1
                      ? " appointment-area-column--last"
                      : ""
                  }`}
                  style={{
                    height: timelineHeight,
                  }}
                >
                  {quickCreateSlotStarts.map((minutes) => {
                    const top =
                      ((minutes - timelineStartMinutes) /
                        CALENDAR_TOTAL_MINUTES) *
                      timelineHeight;
                    const slotHeight =
                      (CALENDAR_SLOT_INTERVAL_MINUTES /
                        CALENDAR_TOTAL_MINUTES) *
                      timelineHeight;
                    return (
                      <button
                        key={`slot-${area.id}-${minutes}`}
                        type="button"
                        className="appointment-area-slot"
                        onClick={() =>
                          handleQuickCreateSlotClick(area.id, minutes)
                        }
                        aria-label={`Create appointment at ${timeLabelFromMinutes(minutes)} in ${canonicalAreaLabel(area)}`}
                        style={{
                          top,
                          height: slotHeight,
                        }}
                      >
                        <span className="appointment-area-slot-label">
                          {timeLabelFromMinutes(minutes)}
                        </span>
                      </button>
                    );
                  })}

                  {timeTicks.map((minutes, index) => {
                    const top =
                      ((minutes - timelineStartMinutes) /
                        CALENDAR_TOTAL_MINUTES) *
                      timelineHeight;
                    const isHour = minutes % 60 === 0;
                    const isLast = index === timeTicks.length - 1;
                    return (
                      <div
                        className="appointment-time-line"
                        key={minutes}
                        style={{
                          top,
                          borderTop: isLast
                            ? "1px solid rgba(2, 6, 23, 0.08)"
                            : isHour
                              ? "1px solid rgba(2, 6, 23, 0.08)"
                              : "1px dashed rgba(2, 6, 23, 0.06)",
                        }}
                      />
                    );
                  })}

                  {areaBlocks.map((item) => (
                    <TimelineItem
                      key={`block-${area.id}-${item.id}`}
                      item={item}
                      type="block"
                      timelineStartMinutes={timelineStartMinutes}
                      timelineHeight={timelineHeight}
                      typesById={typesById}
                      onClick={() => openBlockDetailModal(item)}
                    />
                  ))}

                  {areaAppointments.map((item) => (
                    <TimelineItem
                      key={`appt-${item.id}`}
                      item={item}
                      type="appointment"
                      timelineStartMinutes={timelineStartMinutes}
                      timelineHeight={timelineHeight}
                      typesById={typesById}
                      onClick={() => openDetailModal(item)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const desktopWorkspaceHeight = isDesktopToolsLayout ? "100%" : undefined;

  const appointmentDetailDrawer =
    detailOpen && detailAppointment ? (
      <>
        {!isDesktopToolsLayout ? (
          <button
            type="button"
            className="appointment-drawer-backdrop"
            onClick={closeDetailModal}
            aria-label="Close appointment details"
          />
        ) : null}

        <aside
          className={`appointment-drawer ${
            isDesktopToolsLayout
              ? "appointment-drawer--desktop"
              : "appointment-drawer--mobile"
          }`}
          aria-label="Appointment details"
        >
          <div className="appointment-drawer-panel">
            <div className="appointment-drawer-header">
              <div className="appointment-drawer-summary">
                <div className="appointment-drawer-summary-item appointment-drawer-summary-item--strong">
                  {detailAppointment.customer_name || "Unnamed customer"}
                </div>
                <div
                  className="appointment-drawer-summary-item appointment-drawer-summary-item--type"
                  style={{ color: detailTypeAccent.accent }}
                >
                  {detailAppointmentType}
                </div>
                <div className="appointment-drawer-summary-item appointment-drawer-summary-item--emphasis">
                  {formatTimeRange(
                    detailAppointment.start_at,
                    detailAppointment.end_at,
                  )}
                </div>
                <div className="appointment-drawer-summary-item appointment-drawer-summary-item--emphasis">
                  {formatCompactDateLabel(detailAppointment.start_at)}
                </div>
                <div className="appointment-drawer-summary-item">
                  Booked by {bookedByLabel(detailAppointment) || "Unknown"}
                </div>
                <div className="appointment-drawer-summary-item">
                  {prettySiteName(detailSiteId)}, {canonicalAreaLabel(detailArea)}
                </div>
              </div>
            </div>

            <div className="appointment-drawer-scroll">
              {detailEditing ? (
                <form
                  className="appointment-drawer-shell"
                  onSubmit={submitDetailUpdate}
                >
                  <div
                    className="appointment-drawer-body"
                    style={{ padding: 20, paddingBottom: 16 }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                      }}
                    >
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 13, fontWeight: 900 }}>
                          Appointment details
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: ui.colors.muted,
                          }}
                        >
                          Update the date, time, area, and appointment type here.
                        </div>
                      </div>

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
                          onChange={(e) =>
                            updateDetailForm("date", e.target.value)
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        />
                      </label>

                      <label style={{ fontSize: 13, fontWeight: 700 }}>
                        Appointment area
                        <select
                          value={detailForm.areaId}
                          onChange={(e) =>
                            updateDetailForm("areaId", e.target.value)
                          }
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
                          {detailAppointmentTypeOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.duration_minutes} mins)
                              {!item.is_active ? " - inactive" : ""}
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
                        <select
                          value={detailForm.endTime}
                          onChange={(e) =>
                            updateDetailForm("endTime", e.target.value)
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        >
                          <option value="">
                            {detailEndTimeLabel
                              ? `Suggested: ${detailEndTimeLabel}`
                              : "Select an end time..."}
                          </option>
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
                        <div
                          style={{
                            marginBottom: 6,
                            fontSize: 13,
                            fontWeight: 900,
                          }}
                        >
                          Customer details
                        </div>
                        Customer name
                        <input
                          value={detailForm.customerName}
                          onChange={(e) =>
                            updateDetailForm("customerName", e.target.value)
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
                        Customer email
                        <input
                          type="email"
                          required
                          value={detailForm.customerEmail}
                          onChange={(e) =>
                            updateDetailForm("customerEmail", e.target.value)
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
                        <div
                          style={{
                            marginBottom: 6,
                            fontSize: 13,
                            fontWeight: 900,
                          }}
                        >
                          Internal notes
                        </div>
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
                  </div>

                  <div className="appointment-drawer-footer appointment-drawer-footer--contained">
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
                <div className="appointment-drawer-shell">
                  <div
                    className="appointment-drawer-body"
                    style={{ padding: 20, paddingBottom: 16 }}
                  >
                    <div style={{ display: "grid", gap: 16 }}>
                      <SectionCard>
                        <div className="appointment-drawer-detail-list">
                          <div className="appointment-drawer-detail-line">
                            <span className="appointment-drawer-detail-label">
                              Name
                            </span>
                            <span className="appointment-drawer-detail-value">
                              {detailAppointment.customer_name || "Not provided"}
                            </span>
                          </div>
                          <div className="appointment-drawer-detail-line">
                            <span className="appointment-drawer-detail-label">
                              Email
                            </span>
                            <span className="appointment-drawer-detail-value">
                              {detailAppointment.customer_email ? (
                                <a
                                  href={`mailto:${detailAppointment.customer_email}`}
                                  className="appointment-drawer-detail-link"
                                >
                                  {detailAppointment.customer_email}
                                </a>
                              ) : (
                                "Not provided"
                              )}
                            </span>
                          </div>
                          <div className="appointment-drawer-detail-line">
                            <span className="appointment-drawer-detail-label">
                              Phone
                            </span>
                            <span className="appointment-drawer-detail-value">
                              {detailAppointment.customer_phone || "Not provided"}
                            </span>
                          </div>
                        </div>
                      </SectionCard>

                      <SectionCard title="Internal notes" tone="softSlate">
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            fontWeight: 700,
                          }}
                        >
                          {detailAppointment.internal_notes ||
                            "No internal notes"}
                        </div>
                      </SectionCard>

                      <SectionCard>
                        <div className="appointment-drawer-section-header">
                          <div className="appointment-drawer-section-title">
                            Email
                          </div>
                          <div className="appointment-drawer-section-actions">
                            {canManageSelectedAppointment &&
                            detailAppointment.status !== "cancelled" ? (
                              <button
                                className="appointment-drawer-action-button appointment-drawer-action-button--reminder"
                                type="button"
                                onClick={sendReminderEmail}
                                disabled={!canSendReminder || sendingReminder}
                                title={
                                  detailAppointment.customer_email
                                    ? undefined
                                    : "Customer email required before sending reminder."
                                }
                              >
                                {sendingReminder ? "Sending..." : "Reminder"}
                              </button>
                            ) : null}

                            {canManageSelectedAppointment ? (
                              <button
                                className="appointment-drawer-action-button appointment-drawer-action-button--confirmation"
                                type="button"
                                onClick={sendConfirmationEmail}
                                disabled={
                                  !canSendConfirmation || sendingConfirmation
                                }
                                title={
                                  detailAppointment.customer_email
                                    ? undefined
                                    : "Customer email is required before sending confirmation."
                                }
                              >
                                {sendingConfirmation
                                  ? "Sending..."
                                  : "Confirmation"}
                              </button>
                            ) : null}
                          </div>
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
                            No email history yet.
                          </div>
                        ) : (
                          <div
                            style={{ marginTop: 10, display: "grid", gap: 10 }}
                          >
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
                                  {row.sent_by_name
                                    ? ` by ${row.sent_by_name}`
                                    : ""}
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
                      </SectionCard>

                      <SectionCard title="Activity">
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
                        ) : visibleActivityRows.length === 0 ? (
                          <div style={{ marginTop: 10, color: ui.colors.muted }}>
                            No appointment activity has been recorded yet.
                          </div>
                        ) : (
                          <div
                            style={{ marginTop: 10, display: "grid", gap: 10 }}
                          >
                            {visibleActivityRows.map((row) => (
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
                                {shouldShowActivityDescription(row) ? (
                                  <div
                                    style={{
                                      marginTop: 6,
                                      fontSize: 13,
                                      color: ui.colors.text,
                                    }}
                                  >
                                    {describeActivity(row)}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </SectionCard>
                    </div>

                    {detailAppointment.status !== "cancelled" &&
                    !String(detailAppointment.customer_email || "").trim() ? (
                      <div className="appointment-drawer-warning">
                        Customer email required before sending reminder.
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
                  </div>

                  <div className="appointment-drawer-footer appointment-drawer-footer--contained">
                    {canManageSelectedAppointment ? (
                      <button
                        className="appointment-drawer-action-button appointment-drawer-action-button--edit"
                        type="button"
                        onClick={() => {
                          setDetailEditing(true);
                          setDetailForm(
                            buildDetailForm(detailAppointment, detailSiteId),
                          );
                          setDetailError("");
                        }}
                      >
                        Edit
                      </button>
                    ) : null}

                    {canManageSelectedAppointment ? (
                      <button
                        className="appointment-drawer-action-button appointment-drawer-action-button--cancel"
                        type="button"
                        onClick={cancelAppointment}
                        disabled={detailSaving}
                      >
                        Cancel
                      </button>
                    ) : null}

                    <button
                      className="appointment-drawer-action-button appointment-drawer-action-button--close"
                      type="button"
                      onClick={closeDetailModal}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </>
    ) : null;

  const quickCreateDrawer = quickCreateOpen ? (
    <>
      {!isDesktopToolsLayout ? (
        <button
          type="button"
          className="appointment-drawer-backdrop"
          onClick={closeCreateModal}
          aria-label="Close quick appointment form"
        />
      ) : null}

      <aside
        className={`appointment-drawer ${
          isDesktopToolsLayout
            ? "appointment-drawer--desktop"
            : "appointment-drawer--mobile"
        }`}
        aria-label="Quick appointment form"
      >
        <div className="appointment-drawer-panel">
          <div className="appointment-drawer-header">
            <div className="appointment-wizard-title-row">
              <div className="appointment-wizard-title">Quick appointment</div>
            </div>
            <div className="appointment-quick-create-meta">
              <div className="appointment-quick-create-meta-row">
                <span>Date</span>
                <strong>{formatDateHeading(form.date)}</strong>
              </div>
              <div className="appointment-quick-create-meta-row">
                <span>Time</span>
                <strong>{form.startTime || "Choose a time"}</strong>
              </div>
              <div className="appointment-quick-create-meta-row">
                <span>Location</span>
                <strong>
                  {form.areaId && quickCreateSelectedArea
                    ? `${prettySiteName(form.siteId)}, ${canonicalAreaLabel(
                        quickCreateSelectedArea,
                      )}`
                    : prettySiteName(form.siteId)}
                </strong>
              </div>
            </div>
          </div>

          <div className="appointment-drawer-scroll">
            <form className="appointment-drawer-shell" onSubmit={submitCreateAppointment}>
              <div
                className="appointment-drawer-body appointment-quick-create"
                style={{ padding: 20, paddingBottom: 16 }}
              >
                <div className="appointment-wizard-fields">
                  <label className="appointment-wizard-field">
                    <span>Appointment category</span>
                    <select
                      value={wizardForm.category}
                      onChange={(e) => updateQuickCreateCategory(e.target.value)}
                      style={{ ...baseInputStyle, marginTop: 6 }}
                    >
                      <option value="">Select a category...</option>
                      {availableWizardCategoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {wizardForm.category ? (
                    <label className="appointment-wizard-field">
                      <span>Appointment type</span>
                      <select
                        value={quickCreateTypeKey}
                        onChange={(e) => updateQuickCreateType(e.target.value)}
                        style={{ ...baseInputStyle, marginTop: 6 }}
                      >
                        <option value="">Select a type...</option>
                        {quickCreateTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {isCustomAppointmentTypeCode(wizardSelectedTypeCode) ? (
                    <div className="appointment-quick-create-grid">
                      <label className="appointment-wizard-field">
                        <span>Custom appointment label</span>
                        <input
                          value={wizardForm.customLabel}
                          onChange={(e) =>
                            updateWizardForm("customLabel", e.target.value)
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        />
                      </label>
                      <label className="appointment-wizard-field">
                        <span>Duration (mins)</span>
                        <input
                          type="number"
                          min="5"
                          step="5"
                          value={wizardForm.customDurationMinutes}
                          onChange={(e) =>
                            updateWizardForm(
                              "customDurationMinutes",
                              e.target.value,
                            )
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        />
                      </label>
                    </div>
                  ) : null}

                  {quickCreateTypeKey && quickCreateUsesPartyCounts ? (
                    <div className="appointment-wizard-metric-grid">
                      <label className="appointment-wizard-field">
                        <span>Adults</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={wizardForm.adults}
                          onChange={(e) =>
                            updateWizardForm("adults", e.target.value)
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        />
                      </label>
                      <label className="appointment-wizard-field">
                        <span>Children</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={wizardForm.children}
                          onChange={(e) =>
                            updateWizardForm("children", e.target.value)
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        />
                      </label>
                    </div>
                  ) : null}

                  {quickCreateTypeKey && !quickCreateAvailability.isPossible ? (
                    <div
                      className={`appointment-quick-create-status appointment-quick-create-status--${quickCreateAvailability.tone}`}
                    >
                      <div>{quickCreateAvailability.message}</div>
                    </div>
                  ) : null}

                  {quickCreateAvailability.isPossible ? (
                    <>
                      <div className="appointment-quick-create-grid">
                        <label className="appointment-wizard-field">
                          <span>Appointment type</span>
                          <input
                            value={wizardSummaryLabel}
                            readOnly
                            style={{
                              ...baseInputStyle,
                              marginTop: 6,
                              background: "rgba(2, 6, 23, 0.03)",
                            }}
                          />
                        </label>
                        <label className="appointment-wizard-field">
                          <span>End time</span>
                          <input
                            value={quickCreateSuggestedEndTime || form.endTime}
                            readOnly
                            style={{
                              ...baseInputStyle,
                              marginTop: 6,
                              background: "rgba(2, 6, 23, 0.03)",
                            }}
                          />
                        </label>
                      </div>

                      <label className="appointment-wizard-field">
                        <span>Customer name</span>
                        <input
                          value={form.customerName}
                          onChange={(e) =>
                            updateForm("customerName", e.target.value)
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        />
                      </label>

                      <div className="appointment-quick-create-grid">
                        <label className="appointment-wizard-field appointment-form-field--full">
                          <span>Customer email</span>
                          <input
                            type="email"
                            required
                            value={form.customerEmail}
                            onChange={(e) =>
                              updateForm("customerEmail", e.target.value)
                            }
                            style={{ ...baseInputStyle, marginTop: 6 }}
                          />
                        </label>

                        <label className="appointment-wizard-field appointment-form-field--full">
                          <span>Customer phone</span>
                          <input
                            value={form.customerPhone}
                            onChange={(e) =>
                              updateForm("customerPhone", e.target.value)
                            }
                            style={{ ...baseInputStyle, marginTop: 6 }}
                          />
                        </label>
                      </div>

                      <label className="appointment-wizard-field">
                        <span>Notes</span>
                        <textarea
                          rows={4}
                          value={form.internalNotes}
                          onChange={(e) =>
                            updateForm("internalNotes", e.target.value)
                          }
                          style={{
                            ...baseInputStyle,
                            marginTop: 6,
                            resize: "vertical",
                          }}
                        />
                      </label>

                      {canAutoSendConfirmationOnCreate ? (
                        <label className="appointment-wizard-checkbox">
                          <input
                            className="appointment-confirm-checkbox"
                            type="checkbox"
                            checked={!!form.sendConfirmationAfterSave}
                            disabled={saving}
                            onChange={(e) =>
                              updateForm(
                                "sendConfirmationAfterSave",
                                e.target.checked,
                              )
                            }
                          />
                          <span>Send confirmation email after saving</span>
                        </label>
                      ) : null}
                    </>
                  ) : null}

                  {formError ? (
                    <div className="appointment-wizard-warning-inline">
                      {formError}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="appointment-drawer-footer appointment-drawer-footer--contained">
                <button
                  className="appointment-drawer-action-button appointment-drawer-action-button--close"
                  type="button"
                  onClick={closeCreateModal}
                >
                  Close
                </button>
                <button
                  className="appointment-drawer-action-button appointment-drawer-action-button--edit"
                  type="submit"
                  disabled={saving || !quickCreateAvailability.isPossible}
                >
                  {savePhase === "sending_confirmation"
                    ? "Sending confirmation..."
                    : savePhase === "saving"
                      ? "Saving appointment..."
                      : "Save appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </aside>
    </>
  ) : null;

  const blockCreateDrawer = blockModalOpen ? (
    <>
      {!isDesktopToolsLayout ? (
        <button
          type="button"
          className="appointment-drawer-backdrop"
          onClick={closeBlockModal}
          aria-label="Close new block form"
        />
      ) : null}

      <aside
        className={`appointment-drawer ${
          isDesktopToolsLayout
            ? "appointment-drawer--desktop"
            : "appointment-drawer--mobile"
        }`}
        aria-label="New block form"
      >
        <div className="appointment-drawer-panel">
          <div className="appointment-drawer-header">
            <div className="appointment-wizard-title-row">
              <div>
                <div className="appointment-wizard-title">New block</div>
                <div className="appointment-wizard-subtitle">
                  Block unavailable appointment time for one area or the whole
                  site.
                </div>
              </div>
            </div>
          </div>

          <div className="appointment-drawer-scroll">
            <form
              className="appointment-drawer-body"
              onSubmit={submitCreateBlock}
              style={{ padding: 20, paddingBottom: 16 }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>
                    Block details
                  </div>
                  <div
                    style={{ marginTop: 4, fontSize: 12, color: ui.colors.muted }}
                  >
                    Choose whether this blocks one area or the whole site before
                    setting the time range.
                  </div>
                </div>

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

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Repeat
                  <select
                    value={blockForm.recurrencePattern}
                    onChange={(e) =>
                      updateBlockForm("recurrencePattern", e.target.value)
                    }
                    style={{ ...baseInputStyle, marginTop: 6 }}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                  </select>
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
                  <div
                    style={{ marginTop: 6, fontSize: 12, color: ui.colors.muted }}
                  >
                    {blockForm.areaId
                      ? "This block applies only to the selected area/resource."
                      : "This block applies to the whole site across every area."}
                  </div>
                </label>

                {blockForm.recurrencePattern !== "none" ? (
                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                    Repeat until
                    <input
                      type="date"
                      value={blockForm.recurrenceUntilDate}
                      min={blockForm.date}
                      onChange={(e) =>
                        updateBlockForm("recurrenceUntilDate", e.target.value)
                      }
                      style={{ ...baseInputStyle, marginTop: 6 }}
                    />
                  </label>
                ) : null}

                {blockForm.recurrencePattern !== "none" ? (
                  <div
                    style={{
                      alignSelf: "end",
                      fontSize: 12,
                      color: ui.colors.muted,
                    }}
                  >
                    {blockForm.recurrencePattern === "daily"
                      ? "Creates this block every day from the first date up to the final date."
                      : "Creates this block every week on the same weekday until the final date."}
                  </div>
                ) : null}

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
                  <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 900 }}>
                    Reason
                  </div>
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

              <div className="appointment-drawer-footer">
                <button
                  className="appointment-drawer-action-button appointment-drawer-action-button--close"
                  type="button"
                  onClick={closeBlockModal}
                >
                  Cancel
                </button>

                <button
                  className="appointment-drawer-action-button"
                  type="submit"
                  disabled={blockSaving}
                  style={{
                    borderColor: "rgba(100,116,139,0.35)",
                    background: "rgba(100,116,139,0.12)",
                    opacity: blockSaving ? 0.6 : 1,
                  }}
                >
                  {blockSaving ? "Saving..." : "Save block"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </aside>
    </>
  ) : null;

  const appointmentWizardDrawer = createWizardOpen ? (
    <>
      {!isDesktopToolsLayout ? (
        <button
          type="button"
          className="appointment-drawer-backdrop"
          onClick={closeCreateModal}
          aria-label="Close new appointment wizard"
        />
      ) : null}

      <aside
        className={`appointment-drawer ${
          isDesktopToolsLayout
            ? "appointment-drawer--desktop"
            : "appointment-drawer--mobile"
        }`}
        aria-label="New appointment wizard"
      >
        <div className="appointment-drawer-panel">
          <div className="appointment-drawer-header appointment-wizard-header">
            <div className="appointment-wizard-progress">
              Step {wizardStep + 1} of 6
            </div>
            <div className="appointment-wizard-title-row">
              <div>
                <div className="appointment-wizard-title">New appointment</div>
                <div className="appointment-wizard-subtitle">
                  {wizardStepLabel(wizardStep)}
                </div>
              </div>
              {wizardStep >= 2 && wizardSummaryLabel ? (
                <div
                  className="appointment-wizard-type"
                  style={{ color: wizardTypeAccent.accent }}
                >
                  {wizardSummaryLabel}
                </div>
              ) : null}
            </div>
          </div>

          <div className="appointment-drawer-scroll">
            <div
              className="appointment-drawer-body appointment-wizard"
              style={{ padding: 20, paddingBottom: 16 }}
            >
              {wizardStep === 0 ? (
                <div className="appointment-wizard-section">
                  <div className="appointment-wizard-question">
                    What is the appointment for?
                  </div>
                  <div className="appointment-wizard-options">
                    {availableWizardCategoryOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`appointment-wizard-option ${
                          wizardForm.category === option.value
                            ? "appointment-wizard-option--selected"
                            : ""
                        }`}
                        onClick={() => {
                          updateWizardForm("category", option.value);
                          setFormError("");
                          setWizardStep(1);
                        }}
                      >
                        <span>{option.label}</span>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {wizardStep === 1 ? (
                <div className="appointment-wizard-section">
                  <div className="appointment-wizard-question">
                    {selectedWizardCategory
                      ? `Which ${selectedWizardCategory.name} appointment type do you need?`
                      : "Which appointment type do you need?"}
                  </div>
                  <div className="appointment-wizard-options">
                    {selectedWizardTypes.map((option) => {
                      const optionCode = appointmentTypeCode(option);
                      const optionDescription = isMeasurementAppointmentTypeCode(
                        optionCode,
                      )
                        ? "Uses quantity-based measuring rules"
                        : optionCode === APPOINTMENT_TYPE_CODES.hireCollection
                          ? "Uses try-on counts to calculate the duration"
                          : isFullTryOnAppointmentTypeCode(optionCode)
                            ? "Requires a hire-database check before saving"
                            : isCustomAppointmentTypeCode(optionCode)
                              ? "Staff can set a custom label and duration"
                              : `${option.duration_minutes} mins default duration`;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`appointment-wizard-option ${
                            wizardForm.selectedTypeId === option.id
                              ? "appointment-wizard-option--selected"
                              : ""
                          }`}
                          onClick={() => {
                            updateWizardForm("selectedTypeId", option.id);
                            setFormError("");
                            setWizardStep(2);
                          }}
                        >
                          <span>{option.name}</span>
                          <small>{optionDescription}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {wizardStep === 2 ? (
                <div className="appointment-wizard-section">
                  <div className="appointment-wizard-question">
                    Gather the key details for this booking
                  </div>

                  {isMeasurementAppointmentTypeCode(wizardSelectedTypeCode) ? (
                    <div className="appointment-wizard-fields">
                      <div className="appointment-wizard-metric-grid">
                        <label className="appointment-wizard-field">
                          <span>Adults being measured</span>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={wizardForm.adults}
                            onChange={(e) =>
                              updateWizardForm("adults", e.target.value)
                            }
                            style={{ ...baseInputStyle, marginTop: 6 }}
                          />
                        </label>
                        <label className="appointment-wizard-field">
                          <span>Children being measured</span>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={wizardForm.children}
                            onChange={(e) =>
                              updateWizardForm("children", e.target.value)
                            }
                            style={{ ...baseInputStyle, marginTop: 6 }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {wizardSelectedTypeCode === APPOINTMENT_TYPE_CODES.hireCollection ? (
                    <div className="appointment-wizard-fields">
                      <div className="appointment-wizard-note">
                        Duration is based on how many people are trying on,
                        rather than how many outfits are being collected.
                      </div>
                      <div className="appointment-wizard-metric-grid">
                        <label className="appointment-wizard-field">
                          <span>Adults trying on</span>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={wizardForm.adults}
                            onChange={(e) =>
                              updateWizardForm("adults", e.target.value)
                            }
                            style={{ ...baseInputStyle, marginTop: 6 }}
                          />
                        </label>
                        <label className="appointment-wizard-field">
                          <span>Children trying on</span>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={wizardForm.children}
                            onChange={(e) =>
                              updateWizardForm("children", e.target.value)
                            }
                            style={{ ...baseInputStyle, marginTop: 6 }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {isFullTryOnAppointmentTypeCode(wizardSelectedTypeCode) ? (
                    <div className="appointment-wizard-fields">
                      <div className="appointment-wizard-note">
                        Please make sure an outfit has been booked in the hire
                        database for this full try-on appointment.
                      </div>
                      <label className="appointment-wizard-checkbox">
                        <input
                          type="checkbox"
                          checked={wizardForm.fullTryOnAcknowledged}
                          onChange={(e) =>
                            updateWizardForm(
                              "fullTryOnAcknowledged",
                              e.target.checked,
                            )
                          }
                        />
                        <span>
                          I have checked the outfit is booked in the hire
                          database.
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {isCustomAppointmentTypeCode(wizardSelectedTypeCode) ? (
                    <div className="appointment-wizard-fields">
                      <label className="appointment-wizard-field">
                        <span>Custom appointment label</span>
                        <input
                          value={wizardForm.customLabel}
                          onChange={(e) =>
                            updateWizardForm("customLabel", e.target.value)
                          }
                          placeholder="Example: VIP fitting review"
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        />
                      </label>
                      <label className="appointment-wizard-field">
                        <span>Suggested duration (minutes)</span>
                        <input
                          type="number"
                          min="15"
                          step="5"
                          value={wizardForm.customDurationMinutes}
                          onChange={(e) =>
                            updateWizardForm(
                              "customDurationMinutes",
                              e.target.value,
                            )
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="appointment-wizard-fields">
                    <label className="appointment-wizard-field">
                      <span>Additional time if required</span>
                      <select
                        value={wizardForm.additionalTimeMinutes}
                        onChange={(e) =>
                          updateWizardForm(
                            "additionalTimeMinutes",
                            e.target.value,
                          )
                        }
                        style={{ ...baseInputStyle, marginTop: 6 }}
                      >
                        {[-30, -20, -10, 0, 10, 20, 30, 40, 50, 60].map((minutes) => (
                          <option key={minutes} value={String(minutes)}>
                            {minutes > 0
                              ? `+${minutes} mins`
                              : `${minutes} mins`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                    <div className="appointment-wizard-summary-card">
                      <div className="appointment-wizard-summary-row">
                        <span>Suggested appointment type</span>
                        <strong style={{ color: wizardTypeAccent.accent }}>
                          {wizardSummaryLabel || "Choose below"}
                        </strong>
                      </div>
                      <div className="appointment-wizard-summary-row">
                        <span>Base duration</span>
                        <strong>
                          {wizardBaseDurationMinutes
                            ? `${wizardBaseDurationMinutes} mins`
                            : "0 mins"}
                        </strong>
                      </div>
                      {wizardDurationBreakdown ? (
                        <div className="appointment-wizard-breakdown">
                          <div className="appointment-wizard-breakdown-title">
                            Breakdown
                          </div>
                          {wizardDurationBreakdown.kind === "measurement" ? (
                            <>
                              {wizardDurationBreakdown.adultCount > 0 ? (
                                <div className="appointment-wizard-breakdown-line">
                                  <span>
                                    {wizardDurationBreakdown.adultCount} adult
                                    {wizardDurationBreakdown.adultCount === 1
                                      ? ""
                                      : "s"}
                                  </span>
                                  <strong>
                                    {wizardDurationBreakdown.adultMinutes} mins
                                  </strong>
                                </div>
                              ) : null}
                              {wizardDurationBreakdown.childCount > 0 ? (
                                <div className="appointment-wizard-breakdown-line">
                                  <span>
                                    {wizardDurationBreakdown.childCount} child
                                    {wizardDurationBreakdown.childCount === 1
                                      ? ""
                                      : "ren"}
                                  </span>
                                  <strong>
                                    {wizardDurationBreakdown.childMinutes} mins
                                  </strong>
                                </div>
                              ) : null}
                              {wizardDurationBreakdown.adultCount === 0 &&
                              wizardDurationBreakdown.childCount === 0 ? (
                                <div className="appointment-wizard-breakdown-empty">
                                  Add adults or children to calculate the duration.
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              {wizardDurationBreakdown.totalPeople > 0 ? (
                                <div className="appointment-wizard-breakdown-line">
                                  <span>People trying on</span>
                                  <strong>
                                    {wizardDurationBreakdown.totalPeople}
                                  </strong>
                                </div>
                              ) : (
                                <div className="appointment-wizard-breakdown-empty">
                                  Add people trying on to calculate the duration.
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ) : null}
                      <div className="appointment-wizard-summary-row">
                        <span>Additional time</span>
                        <strong>{wizardAdditionalTimeMinutes} mins</strong>
                      </div>
                      <div className="appointment-wizard-summary-row">
                        <span>Total duration</span>
                        <strong>
                          {wizardSuggestedDurationMinutes
                            ? `${wizardSuggestedDurationMinutes} mins`
                            : "0 mins"}
                        </strong>
                      </div>
                    {wizardResolution.guidance ? (
                      <div className="appointment-wizard-note">
                        {wizardResolution.guidance}
                      </div>
                    ) : null}
                    {wizardResolutionWarning ? (
                      <div className="appointment-wizard-warning-inline">
                        {wizardResolutionWarning}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {wizardStep === 3 ? (
                <div className="appointment-wizard-section">
                  <div className="appointment-wizard-question">
                    When and where should this appointment happen?
                  </div>
                  <div className="appointment-wizard-fields">
                    {showSiteSelector ? (
                      <label className="appointment-wizard-field">
                        <span>Site</span>
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
                      <label className="appointment-wizard-field">
                        <span>Site</span>
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

                    <label className="appointment-wizard-field">
                      <span>Date</span>
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) => updateForm("date", e.target.value)}
                        style={{ ...baseInputStyle, marginTop: 6 }}
                      />
                    </label>

                    <label className="appointment-wizard-field">
                      <span>Appointment area</span>
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

                    <div className="appointment-wizard-metric-grid">
                      <label className="appointment-wizard-field">
                        <span>Start time</span>
                        <select
                          value={form.startTime}
                          onChange={(e) =>
                            updateForm("startTime", e.target.value)
                          }
                          style={{ ...baseInputStyle, marginTop: 6 }}
                          disabled={
                            modalAreasLoading ||
                            wizardDayLoading ||
                            wizardSuggestedDurationMinutes <= 0 ||
                            !form.siteId ||
                            !form.date ||
                            !form.areaId ||
                            !wizardBookableWindow.isOpen ||
                            wizardAvailableStartTimes.length === 0
                          }
                        >
                          <option value="">
                            {!form.areaId
                              ? "Select an area first"
                              : wizardSuggestedDurationMinutes <= 0
                                ? "Select appointment details first"
                                : modalAreasLoading || wizardDayLoading
                                  ? "Loading times..."
                                  : wizardAvailableStartTimes.length === 0
                                    ? "No available times"
                                    : "Select a time..."}
                          </option>
                          {wizardAvailableStartTimes.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                        {wizardSuggestedSlotsMessage &&
                        (form.areaId ||
                          wizardSuggestedDurationMinutes <= 0 ||
                          !wizardBookableWindow.isOpen) ? (
                          <div className="appointment-wizard-inline-help">
                            {wizardSuggestedSlotsMessage}
                          </div>
                        ) : null}
                      </label>
                      <label className="appointment-wizard-field">
                        <span>End time</span>
                        <select
                          value={form.endTime}
                          onChange={(e) => updateForm("endTime", e.target.value)}
                          style={{ ...baseInputStyle, marginTop: 6 }}
                        >
                          <option value="">
                            {wizardSuggestedDurationMinutes && form.startTime
                              ? `Suggested: ${addMinutesToTimeValueRoundedUp(
                                  form.startTime,
                                  wizardSuggestedDurationMinutes,
                                )}`
                              : "Select an end time..."}
                          </option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              {wizardStep === 4 ? (
                <div className="appointment-wizard-section">
                  <div className="appointment-wizard-question">
                    Who is this appointment for?
                  </div>
                  <div className="appointment-wizard-fields">
                    <label className="appointment-wizard-field">
                      <span>Customer name</span>
                      <input
                        value={form.customerName}
                        onChange={(e) =>
                          updateForm("customerName", e.target.value)
                        }
                        style={{ ...baseInputStyle, marginTop: 6 }}
                      />
                    </label>
                    <label className="appointment-wizard-field">
                      <span>Customer email</span>
                      <input
                        type="email"
                        required
                        value={form.customerEmail}
                        onChange={(e) =>
                          updateForm("customerEmail", e.target.value)
                        }
                        style={{ ...baseInputStyle, marginTop: 6 }}
                      />
                    </label>
                    <label className="appointment-wizard-field">
                      <span>Phone</span>
                      <input
                        value={form.customerPhone}
                        onChange={(e) =>
                          updateForm("customerPhone", e.target.value)
                        }
                        style={{ ...baseInputStyle, marginTop: 6 }}
                      />
                    </label>
                    <label className="appointment-wizard-field">
                      <span>Internal notes</span>
                      <textarea
                        rows={4}
                        value={form.internalNotes}
                        onChange={(e) =>
                          updateForm("internalNotes", e.target.value)
                        }
                        style={{
                          ...baseInputStyle,
                          marginTop: 6,
                          resize: "vertical",
                        }}
                      />
                    </label>
                    {canAutoSendConfirmationOnCreate ? (
                      <label className="appointment-wizard-checkbox">
                        <input
                          className="appointment-confirm-checkbox"
                          type="checkbox"
                          checked={!!form.sendConfirmationAfterSave}
                          disabled={saving}
                          onChange={(e) =>
                            updateForm(
                              "sendConfirmationAfterSave",
                              e.target.checked,
                            )
                          }
                        />
                        <span>Send confirmation email after saving</span>
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {wizardStep === 5 ? (
                <div className="appointment-wizard-section">
                  <div className="appointment-wizard-question">
                    Please check before confirming...
                  </div>
                  <div className="appointment-wizard-summary-grid">
                    <div className="appointment-wizard-summary-row">
                      <span>Customer</span>
                      <strong>{form.customerName || "Not provided"}</strong>
                    </div>
                    <div className="appointment-wizard-summary-row">
                      <span>Appointment type</span>
                      <strong style={{ color: wizardTypeAccent.accent }}>
                        {wizardSummaryLabel || "Not selected"}
                      </strong>
                    </div>
                    <div className="appointment-wizard-summary-row">
                      <span>Date</span>
                      <strong>{formatDateHeading(form.date)}</strong>
                    </div>
                    <div className="appointment-wizard-summary-row">
                      <span>Time</span>
                      <strong>
                        {form.startTime && form.endTime
                          ? `${form.startTime} - ${form.endTime}`
                          : "Not set"}
                      </strong>
                    </div>
                    <div className="appointment-wizard-summary-row">
                      <span>Site</span>
                      <strong>{prettySiteName(form.siteId)}</strong>
                    </div>
                    <div className="appointment-wizard-summary-row">
                      <span>Area</span>
                      <strong>
                        {wizardSelectedArea
                          ? canonicalAreaLabel(wizardSelectedArea)
                          : "Not selected"}
                      </strong>
                    </div>
                    <div className="appointment-wizard-summary-row">
                      <span>Booked duration</span>
                      <strong>
                        {wizardSuggestedDurationMinutes
                          ? `${wizardSuggestedDurationMinutes} mins`
                          : "Not set"}
                      </strong>
                    </div>
                    {wizardCountsSummary ? (
                      <div className="appointment-wizard-summary-row">
                        <span>People</span>
                        <strong>{wizardCountsSummary}</strong>
                      </div>
                    ) : null}
                    {form.internalNotes.trim() ? (
                      <div className="appointment-wizard-summary-row">
                        <span>Notes</span>
                        <strong>{form.internalNotes}</strong>
                      </div>
                    ) : null}
                    <div className="appointment-wizard-summary-row">
                      <span>Confirmation email</span>
                      <strong>
                        {form.sendConfirmationAfterSave &&
                        isLikelyEmail(form.customerEmail)
                          ? "Will be sent after save"
                          : "Not sending automatically"}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : null}

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

              <div className="appointment-drawer-footer appointment-wizard-footer">
                <button
                  className="appointment-drawer-action-button"
                  type="button"
                  onClick={closeCreateModal}
                >
                  Cancel
                </button>

                {wizardStep > 0 ? (
                  <button
                    className="appointment-drawer-action-button"
                    type="button"
                    onClick={() => goToWizardStep(wizardStep - 1)}
                  >
                    Back
                  </button>
                ) : null}

                {wizardStep < 5 ? (
                  <button
                    className="appointment-drawer-action-button appointment-drawer-action-button--edit"
                    type="button"
                    onClick={() => goToWizardStep(wizardStep + 1)}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    className="appointment-drawer-action-button appointment-drawer-action-button--edit"
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      const validationMessage = validateWizardStep(4);
                      if (validationMessage) {
                        setFormError(validationMessage);
                        return;
                      }
                      await submitCreateAppointment({
                        preventDefault() {},
                      });
                    }}
                  >
                    {savePhase === "sending_confirmation"
                      ? "Sending confirmation..."
                      : savePhase === "saving"
                        ? "Saving appointment..."
                        : "Confirm booking"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  ) : null;

  const blockDetailDrawer =
    blockDetailOpen && detailBlock ? (
      <>
        {!isDesktopToolsLayout ? (
          <button
            type="button"
            className="appointment-drawer-backdrop"
            onClick={closeBlockDetailModal}
            aria-label="Close block details"
          />
        ) : null}

        <aside
          className={`appointment-drawer ${
            isDesktopToolsLayout
              ? "appointment-drawer--desktop"
              : "appointment-drawer--mobile"
          }`}
          aria-label={blockDetailEditing ? "Edit block" : "Block details"}
        >
          <div className="appointment-drawer-panel">
            <div className="appointment-drawer-header">
              <div className="appointment-wizard-title-row">
                <div>
                  <div className="appointment-wizard-title">
                    {blockDetailEditing ? "Edit block" : "Block details"}
                  </div>
                  <div className="appointment-wizard-subtitle">
                    {blockDetailEditing
                      ? "Update this blocked-out time."
                      : "View block details and accountability."}
                  </div>
                </div>
                {detailBlockIsRecurring ? (
                  <div
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(190,24,93,0.28)",
                      background: "rgba(190,24,93,0.12)",
                      color: ui.colors.text,
                      fontSize: 12,
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Recurring series
                  </div>
                ) : null}
              </div>
            </div>

            <div className="appointment-drawer-scroll">
              {blockDetailEditing ? (
                <form
                  className="appointment-drawer-body"
                  onSubmit={submitBlockUpdate}
                  style={{ padding: 20, paddingBottom: 16 }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: 13, fontWeight: 900 }}>
                        Block details
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: ui.colors.muted,
                        }}
                      >
                        Adjust the date, scope, and reason for this blocked-out
                        time.
                      </div>
                    </div>

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
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: ui.colors.muted,
                        }}
                      >
                        {detailBlockForm.areaId
                          ? "This block affects only the selected area/resource."
                          : "This block affects the whole site."}
                      </div>
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
                      <div
                        style={{ marginBottom: 6, fontSize: 13, fontWeight: 900 }}
                      >
                        Reason
                      </div>
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
                    <div className="appointment-wizard-warning-inline">
                      {blockDetailError}
                    </div>
                  ) : null}

                  <div className="appointment-drawer-footer appointment-drawer-footer--contained">
                    <button
                      className="appointment-drawer-action-button appointment-drawer-action-button--close"
                      type="button"
                      onClick={() => {
                        setBlockDetailEditing(false);
                        setDetailBlockForm(
                          buildBlockDetailForm(detailBlock, detailBlockSiteId),
                        );
                        setBlockDetailError("");
                      }}
                    >
                      Cancel edit
                    </button>

                    <button
                      className="appointment-drawer-action-button appointment-drawer-action-button--edit"
                      type="submit"
                      disabled={blockDetailSaving}
                    >
                      {blockDetailSaving ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  className="appointment-drawer-body"
                  style={{ padding: 20, paddingBottom: 16 }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 12,
                    }}
                  >
                    {detailBlockIsRecurring ? (
                      <div
                        style={{
                          gridColumn: "1 / -1",
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid rgba(190,24,93,0.24)",
                          background: "rgba(190,24,93,0.08)",
                          fontSize: 13,
                          color: ui.colors.text,
                        }}
                      >
                        This block is part of a recurring series.
                        {detailBlock.recurrence_until_date
                          ? ` It repeats ${detailBlockRecurrenceLabel.toLowerCase()} until ${formatDateHeading(detailBlock.recurrence_until_date)}.`
                          : ""}
                      </div>
                    ) : null}
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
                      label="Recurrence"
                      value={detailBlockRecurrenceLabel}
                    />
                    <FieldValue
                      label="Repeats until"
                      value={
                        detailBlock.recurrence_until_date
                          ? formatDateHeading(detailBlock.recurrence_until_date)
                          : "Single block"
                      }
                    />
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
                              {row.changed_by_name ? ` by ${row.changed_by_name}` : ""}
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
                    <div className="appointment-wizard-warning-inline">
                      {blockDetailError}
                    </div>
                  ) : null}

                  <div className="appointment-drawer-footer appointment-drawer-footer--contained">
                    {canManageSelectedBlock ? (
                      <button
                        className="appointment-drawer-action-button appointment-drawer-action-button--edit"
                        type="button"
                        onClick={() => {
                          setBlockDetailEditing(true);
                          setDetailBlockForm(
                            buildBlockDetailForm(detailBlock, detailBlockSiteId),
                          );
                          setBlockDetailError("");
                        }}
                      >
                        Edit
                      </button>
                    ) : null}

                    {canManageSelectedBlock ? (
                      <button
                        className="appointment-drawer-action-button"
                        type="button"
                        onClick={cancelBlock}
                        disabled={blockDetailSaving}
                        style={{
                          borderColor: "rgba(239,68,68,0.35)",
                          background: "rgba(239,68,68,0.12)",
                          opacity: blockDetailSaving ? 0.6 : 1,
                        }}
                      >
                        Remove this block
                      </button>
                    ) : null}

                    {canManageSelectedBlock && detailBlockIsRecurring ? (
                      <button
                        className="appointment-drawer-action-button"
                        type="button"
                        onClick={cancelRecurringBlockSeries}
                        disabled={blockDetailSaving}
                        style={{
                          borderColor: "rgba(190,24,93,0.35)",
                          background: "rgba(190,24,93,0.12)",
                          opacity: blockDetailSaving ? 0.6 : 1,
                        }}
                      >
                        Remove entire series
                      </button>
                    ) : null}

                    <button
                      className="appointment-drawer-action-button appointment-drawer-action-button--close"
                      type="button"
                      onClick={closeBlockDetailModal}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </>
    ) : null;

  const sideCardCreateActions = (
    <div className="appointment-drawer-empty-actions">
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
  );

  const appointmentPlaceholderDrawer = (
    <aside
      className={`appointment-drawer ${
        isDesktopToolsLayout
          ? "appointment-drawer--desktop"
          : "appointment-drawer--placeholder-stack"
      } appointment-drawer--placeholder`}
      aria-label="Appointment actions"
    >
      <div className="appointment-drawer-panel">
        <div className="appointment-drawer-empty appointment-drawer-empty--actions">
          {sideCardCreateActions}
          <div className="appointment-drawer-empty-title">
            Select an appointment
          </div>
        </div>
      </div>
    </aside>
  );

  const desktopDetailPanel = isDesktopToolsLayout ? (
    createWizardOpen ? (
      <div
        className="appointments-layout-side"
        style={{ height: desktopWorkspaceHeight }}
      >
        {appointmentWizardDrawer}
      </div>
    ) : quickCreateOpen ? (
      <div
        className="appointments-layout-side"
        style={{ height: desktopWorkspaceHeight }}
      >
        {quickCreateDrawer}
      </div>
    ) : blockModalOpen ? (
      <div
        className="appointments-layout-side"
        style={{ height: desktopWorkspaceHeight }}
      >
        {blockCreateDrawer}
      </div>
    ) : blockDetailOpen && detailBlock ? (
      <div
        className="appointments-layout-side"
        style={{ height: desktopWorkspaceHeight }}
      >
        {blockDetailDrawer}
      </div>
    ) : detailOpen && detailAppointment ? (
      <div
        className="appointments-layout-side"
        style={{ height: desktopWorkspaceHeight }}
      >
        {appointmentDetailDrawer}
      </div>
    ) : (
      <div
        className="appointments-layout-side"
        style={{ height: desktopWorkspaceHeight }}
      >
        {appointmentPlaceholderDrawer}
      </div>
    )
  ) : null;

  return (
    <div
      className="appointments-page"
      style={{
        width: "100%",
        color: ui.colors.text,
        fontFamily: ui.font.ui,
        "--appointments-text": ui.colors.text,
        "--appointments-muted": ui.colors.muted,
        "--appointments-border": ui.colors.border,
        "--appointments-card-bg": ui.colors.cardBg,
      }}
    >
      <div className="appointments-layout">
        <div className="appointments-layout-main">{calendarPanel}</div>
        {desktopDetailPanel}
      </div>

      {!isDesktopToolsLayout
        ? createWizardOpen
          ? appointmentWizardDrawer
          : quickCreateOpen
            ? quickCreateDrawer
            : blockModalOpen
              ? blockCreateDrawer
            : blockDetailOpen && detailBlock
              ? blockDetailDrawer
            : detailOpen && detailAppointment
              ? appointmentDetailDrawer
              : appointmentPlaceholderDrawer
        : null}

      {toast ? (
        <div
          className={`appointment-toast appointment-toast--${toast.type}`}
          role="status"
          aria-live={toast.type === "error" ? "assertive" : "polite"}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
