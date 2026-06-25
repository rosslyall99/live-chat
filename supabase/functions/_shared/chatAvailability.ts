export type SiteId = "duke" | "sten" | "off" | "web";

export type DayName =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type DayHours = { open: number; close: number } | null;
export type OpeningHours = Partial<Record<DayName, DayHours>>;

export type ChatAvailabilityReason =
  | "global_disabled"
  | "branch_disabled"
  | "manual_offline"
  | "out_of_hours";

export type ChatAvailability =
  | { mode: "live" }
  | { mode: "offline"; reason: ChatAvailabilityReason };

type TimeZone = "Europe/London";

type ChatAvailabilityOptions = {
  now?: Date;
  timeZone?: TimeZone;
};

function nowInTimeZoneParts(
  now: Date = new Date(),
  timeZone: TimeZone = "Europe/London",
): { dayName: DayName; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(now);
  const weekdayRaw = (parts.find((p) => p.type === "weekday")?.value ?? "monday").toLowerCase();
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const dayNameMap: Record<string, DayName> = {
    monday: "monday",
    tuesday: "tuesday",
    wednesday: "wednesday",
    thursday: "thursday",
    friday: "friday",
    saturday: "saturday",
    sunday: "sunday",
  };

  return {
    dayName: dayNameMap[weekdayRaw] ?? "monday",
    minutes: hour * 60 + minute,
  };
}

export function isOpenNow(
  openingHours: OpeningHours,
  opts: ChatAvailabilityOptions = {},
): boolean {
  const { dayName, minutes } = nowInTimeZoneParts(opts.now, opts.timeZone);
  const day = openingHours?.[dayName] ?? null;

  if (!day) return false;
  return minutes >= day.open && minutes < day.close;
}

export async function getChatAvailability(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: any; error: { message: string } | null }>;
        };
      };
    };
  },
  siteId: SiteId,
  opts: ChatAvailabilityOptions = {},
): Promise<ChatAvailability> {
  const { data: chatSettings, error: chatSettingsErr } = await supabase
    .from("chat_settings")
    .select("enabled, global_enabled")
    .eq("site_id", siteId)
    .maybeSingle();

  if (chatSettingsErr) {
    throw new Error(`chat_settings lookup failed for ${siteId}: ${chatSettingsErr.message}`);
  }

  const { data: siteSettings, error: siteSettingsErr } = await supabase
    .from("site_settings")
    .select("manual_status, opening_hours")
    .eq("site_id", siteId)
    .maybeSingle();

  if (siteSettingsErr) {
    throw new Error(`site_settings lookup failed for ${siteId}: ${siteSettingsErr.message}`);
  }

  const branchEnabled = chatSettings?.enabled ?? true;
  const globalEnabled = chatSettings?.global_enabled ?? true;
  const manualStatus = String(siteSettings?.manual_status ?? "online").toLowerCase();
  const openingHours = (siteSettings?.opening_hours ?? {}) as OpeningHours;

  if (!globalEnabled) {
    return { mode: "offline", reason: "global_disabled" };
  }

  if (!branchEnabled) {
    return { mode: "offline", reason: "branch_disabled" };
  }

  if (manualStatus === "offline") {
    return { mode: "offline", reason: "manual_offline" };
  }

  if (!isOpenNow(openingHours, opts)) {
    return { mode: "offline", reason: "out_of_hours" };
  }

  return { mode: "live" };
}

export async function getLiveBranches(
  supabase: Parameters<typeof getChatAvailability>[0],
  siteIds: SiteId[],
  opts: ChatAvailabilityOptions = {},
): Promise<SiteId[]> {
  const liveBranches: SiteId[] = [];

  for (const siteId of siteIds) {
    const availability = await getChatAvailability(supabase, siteId, opts);
    if (availability.mode === "live") {
      liveBranches.push(siteId);
    }
  }

  return liveBranches;
}

