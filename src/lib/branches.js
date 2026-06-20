const SITE_BRANCH_MAP = {
  duke: "DUK",
  duk: "DUK",
  "duke street": "DUK",
  sten: "STE",
  stenoch: "STE",
  "st enoch": "STE",
  "st enochs": "STE",
  ste: "STE",
};

const SITE_LABEL_MAP = {
  duke: "Duke Street",
  duk: "Duke Street",
  sten: "St Enoch",
  stenoch: "St Enoch",
  ste: "St Enoch",
  office: "Office",
  off: "Office",
  hire: "Hire",
};

const BRANCH_SITE_MAP = {
  DUK: "duke",
  STE: "sten",
};

export function normalizeSiteId(value) {
  return String(value || "").trim().toLowerCase();
}

export function siteIdToAppointmentBranch(siteId) {
  return SITE_BRANCH_MAP[normalizeSiteId(siteId)] || null;
}

export function isBookableAppointmentSite(siteId) {
  return !!siteIdToAppointmentBranch(siteId);
}

export function prettySiteName(siteId) {
  const normalized = normalizeSiteId(siteId);
  return SITE_LABEL_MAP[normalized] || siteId || "Unknown site";
}

export function appointmentBranchToSiteId(branchCode) {
  return BRANCH_SITE_MAP[String(branchCode || "").trim().toUpperCase()] || "";
}

export function canonicalAppointmentSiteId(siteId) {
  const branchCode = siteIdToAppointmentBranch(siteId);
  return appointmentBranchToSiteId(branchCode) || normalizeSiteId(siteId);
}

export function getBookableAppointmentSites(sites = []) {
  return (sites || []).filter((site) => isBookableAppointmentSite(site?.id));
}

export function getDefaultAppointmentSiteId({ sites = [], preferredSiteId, allowFallback = true }) {
  const bookableSites = getBookableAppointmentSites(sites);

  if (isBookableAppointmentSite(preferredSiteId)) {
    const matched = bookableSites.find(
      (site) => normalizeSiteId(site?.id) === normalizeSiteId(preferredSiteId)
    );
    if (matched) return matched.id;
  }

  if (!allowFallback) return preferredSiteId || "";
  return bookableSites[0]?.id || "";
}
