import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StaffProfile = {
  user_id: string;
  role: string | null;
  is_active: boolean | null;
};

type PriceListRow = {
  id: string;
  version: string | null;
};

type PriceColumnRow = {
  id: string;
  matrix_key: string | null;
  supplier: string;
  range: string;
  width: string | null;
  weight: string | null;
  external_weaver_id: number | null;
  external_range_id: number | null;
};

type MappingRow = {
  external_weaver_id: number | null;
  external_range_id: number;
  external_range_label: string | null;
  sort_order: number | null;
};

type TartanRow = {
  id: string;
  range_id: number;
  tartan_name: string | null;
  color_variation: string | null;
  clan: string | null;
  image_url: string | null;
  backup_url: string | null;
};

type RangeRow = {
  range_id: number;
  range_name: string | null;
  weaver_id: number | null;
  weight_id: number | null;
  width_id: number | null;
};

type WeaverRow = {
  id: number;
  name: string | null;
};

type WeightRow = {
  id: number;
  name: string | null;
  ounces: number | null;
};

type WidthRow = {
  id: number;
  width: string | number | null;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSearchQuery(value: unknown) {
  return normalizeText(value)
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 24;
  if (parsed < 1) return 1;
  if (parsed > 50) return 50;
  return parsed;
}

function clampOffset(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatWeight(weightRow: WeightRow | null | undefined) {
  if (!weightRow) return null;
  if (weightRow.ounces !== null && weightRow.ounces !== undefined) {
    return `${weightRow.ounces}oz`;
  }
  return normalizeText(weightRow.name) || null;
}

function formatWidth(widthRow: WidthRow | null | undefined) {
  if (!widthRow) return null;
  const value = widthRow.width;
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function uniqueNumberList(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => Number.isInteger(value)))];
}

function buildBaseSuccessBody(
  resolvedColumnId: string,
  query: string,
  limit: number,
  offset: number,
) {
  return {
    ok: true,
    column_id: resolvedColumnId,
    query,
    pagination: {
      limit,
      offset,
      returned: 0,
      has_more: false,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const hubUrl = Deno.env.get("SUPABASE_URL") || "";
    const hubAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const hubServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const tartanUrl = Deno.env.get("TARTAN_SUPABASE_URL") || "";
    const tartanServiceRoleKey =
      Deno.env.get("TARTAN_SUPABASE_SERVICE_ROLE_KEY") || "";

    if (
      !hubUrl ||
      !hubAnonKey ||
      !hubServiceRoleKey ||
      !tartanUrl ||
      !tartanServiceRoleKey
    ) {
      return json(500, { error: "Missing server configuration." });
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(401, { error: "Missing bearer token." });
    }

    const authClient = createClient(hubUrl, hubAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return json(401, { error: "Invalid token." });
    }

    const hubAdmin = createClient(hubUrl, hubServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const tartanAdmin = createClient(tartanUrl, tartanServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileError } = await hubAdmin
      .from("staff_profiles")
      .select("user_id, role, is_active")
      .eq("user_id", user.id)
      .maybeSingle<StaffProfile>();

    if (profileError || !profile) {
      return json(403, { error: "No staff profile." });
    }

    if (!profile.is_active) {
      return json(403, { error: "Inactive staff." });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(400, { error: "Request body must be a JSON object." });
    }

    const requestedColumnId = normalizeText((body as Record<string, unknown>).column_id);
    const requestedMatrixKey = normalizeText((body as Record<string, unknown>).matrix_key);
    const requestedIdentifier = requestedColumnId || requestedMatrixKey;
    const searchQuery = normalizeSearchQuery((body as Record<string, unknown>).query);
    const limit = clampLimit((body as Record<string, unknown>).limit);
    const offset = clampOffset((body as Record<string, unknown>).offset);

    if (!requestedIdentifier) {
      return json(400, { error: "column_id is required." });
    }

    const { data: activePriceList, error: priceListError } = await hubAdmin
      .from("price_lists")
      .select("id, version")
      .eq("is_active", true)
      .order("effective_from", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PriceListRow>();

    if (priceListError || !activePriceList) {
      console.error("search_tartans_for_price_column: active price list lookup failed", priceListError);
      return json(500, { error: "Could not load HUB pricing mapping." });
    }

    // The browser sends only the HUB column identifier. We resolve allowed tartan
    // ranges server-side from HUB pricing tables so external range ids never come
    // from the client.
    let resolvedColumn: PriceColumnRow | null = null;

    const { data: matrixKeyMatch, error: matrixKeyError } = await hubAdmin
      .from("price_matrix_columns")
      .select(
        "id, matrix_key, supplier, range, width, weight, external_weaver_id, external_range_id",
      )
      .eq("price_list_id", activePriceList.id)
      .eq("is_active", true)
      .eq("matrix_key", requestedIdentifier)
      .maybeSingle<PriceColumnRow>();

    if (matrixKeyError) {
      console.error("search_tartans_for_price_column: matrix key lookup failed", matrixKeyError);
      return json(500, { error: "Could not load HUB pricing mapping." });
    }

    resolvedColumn = matrixKeyMatch ?? null;

    if (!resolvedColumn && isUuid(requestedIdentifier)) {
      const { data: idMatch, error: idMatchError } = await hubAdmin
        .from("price_matrix_columns")
        .select(
          "id, matrix_key, supplier, range, width, weight, external_weaver_id, external_range_id",
        )
        .eq("price_list_id", activePriceList.id)
        .eq("is_active", true)
        .eq("id", requestedIdentifier)
        .maybeSingle<PriceColumnRow>();

      if (idMatchError) {
        console.error("search_tartans_for_price_column: id lookup failed", idMatchError);
        return json(500, { error: "Could not load HUB pricing mapping." });
      }

      resolvedColumn = idMatch ?? null;
    }

    if (!resolvedColumn) {
      return json(400, { error: "Unknown price column." });
    }

    const { data: bridgeRows, error: bridgeError } = await hubAdmin
      .from("price_column_external_ranges")
      .select(
        "external_weaver_id, external_range_id, external_range_label, sort_order",
      )
      .eq("column_id", resolvedColumn.id)
      .order("sort_order", { ascending: true })
      .order("external_range_id", { ascending: true });

    if (bridgeError) {
      console.error("search_tartans_for_price_column: bridge lookup failed", bridgeError);
      return json(500, { error: "Could not load HUB pricing mapping." });
    }

    const mappingRows: MappingRow[] =
      bridgeRows && bridgeRows.length > 0
        ? bridgeRows
        : resolvedColumn.external_range_id !== null
          ? [
              {
                external_weaver_id: resolvedColumn.external_weaver_id,
                external_range_id: resolvedColumn.external_range_id,
                external_range_label: resolvedColumn.range,
                sort_order: 0,
              },
            ]
          : [];

    const externalRangeIds = uniqueNumberList(
      mappingRows.map((row) => row.external_range_id),
    );

    const publicColumnId = resolvedColumn.matrix_key || resolvedColumn.id;
    const baseResponse = buildBaseSuccessBody(
      publicColumnId,
      searchQuery,
      limit,
      offset,
    );

    if (externalRangeIds.length === 0) {
      return json(200, {
        ...baseResponse,
        mapping: {
          status: "not_mapped",
          external_mapping_count: 0,
          ranges: [],
        },
        results: [],
        message: "This range is not mapped to the tartan database yet.",
      });
    }

    let tartanQuery = tartanAdmin
      .from("tartans")
      .select(
        "id, range_id, tartan_name, color_variation, clan, image_url, backup_url",
      )
      .in("range_id", externalRangeIds)
      .order("tartan_name", { ascending: true })
      .order("clan", { ascending: true })
      .order("color_variation", { ascending: true });

    if (searchQuery) {
      const pattern = `%${searchQuery}%`;
      tartanQuery = tartanQuery.or(
        `tartan_name.ilike.${pattern},clan.ilike.${pattern},color_variation.ilike.${pattern}`,
      );
    }

    const { data: tartanRows, error: tartanError } = await tartanQuery.range(
      offset,
      offset + limit,
    );

    if (tartanError) {
      console.error("search_tartans_for_price_column: tartan lookup failed", tartanError);
      return json(500, { error: "Could not search the tartan catalogue." });
    }

    const fetchedRows = tartanRows ?? [];
    const visibleRows = fetchedRows.slice(0, limit) as TartanRow[];
    const hasMore = fetchedRows.length > limit;

    if (visibleRows.length === 0) {
      return json(200, {
        ...baseResponse,
        mapping: {
          status: "mapped",
          external_mapping_count: mappingRows.length,
          ranges: mappingRows.map((row) => ({
            external_weaver_id: row.external_weaver_id,
            external_range_id: row.external_range_id,
            external_range_label:
              normalizeText(row.external_range_label) || null,
          })),
        },
        results: [],
        pagination: {
          limit,
          offset,
          returned: 0,
          has_more: false,
        },
      });
    }

    const visibleRangeIds = uniqueNumberList(
      visibleRows.map((row) => row.range_id),
    );

    const { data: rangeRows, error: rangeError } = await tartanAdmin
      .from("range")
      .select("range_id, range_name, weaver_id, weight_id, width_id")
      .in("range_id", visibleRangeIds);

    if (rangeError) {
      console.error("search_tartans_for_price_column: range lookup failed", rangeError);
      return json(500, { error: "Could not search the tartan catalogue." });
    }

    const rangeById = new Map<number, RangeRow>(
      (rangeRows ?? []).map((row: RangeRow) => [row.range_id, row]),
    );

    const weaverIds = uniqueNumberList(
      (rangeRows ?? []).map((row: RangeRow) => row.weaver_id),
    );
    const weightIds = uniqueNumberList(
      (rangeRows ?? []).map((row: RangeRow) => row.weight_id),
    );
    const widthIds = uniqueNumberList(
      (rangeRows ?? []).map((row: RangeRow) => row.width_id),
    );

    const [
      { data: weaverRows, error: weaverError },
      { data: weightRows, error: weightError },
      { data: widthRows, error: widthError },
    ] = await Promise.all([
      weaverIds.length > 0
        ? tartanAdmin.from("weavers").select("id, name").in("id", weaverIds)
        : Promise.resolve({ data: [], error: null }),
      weightIds.length > 0
        ? tartanAdmin.from("weight").select("id, name, ounces").in("id", weightIds)
        : Promise.resolve({ data: [], error: null }),
      widthIds.length > 0
        ? tartanAdmin.from("width").select("id, width").in("id", widthIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (weaverError || weightError || widthError) {
      console.error("search_tartans_for_price_column: metadata lookup failed", {
        weaverError,
        weightError,
        widthError,
      });
      return json(500, { error: "Could not search the tartan catalogue." });
    }

    const weaverById = new Map<number, WeaverRow>(
      ((weaverRows as WeaverRow[] | null) ?? []).map((row) => [row.id, row]),
    );
    const weightById = new Map<number, WeightRow>(
      ((weightRows as WeightRow[] | null) ?? []).map((row) => [row.id, row]),
    );
    const widthById = new Map<number, WidthRow>(
      ((widthRows as WidthRow[] | null) ?? []).map((row) => [row.id, row]),
    );

    const results = visibleRows.map((row) => {
      const range = rangeById.get(row.range_id) ?? null;
      const weaver = range?.weaver_id ? weaverById.get(range.weaver_id) ?? null : null;
      const weight = range?.weight_id ? weightById.get(range.weight_id) ?? null : null;
      const width = range?.width_id ? widthById.get(range.width_id) ?? null : null;

      return {
        tartan_id: row.id,
        name: normalizeText(row.tartan_name) || "Unnamed tartan",
        clan: normalizeText(row.clan) || null,
        variation: normalizeText(row.color_variation) || null,
        image_url: normalizeText(row.image_url) || null,
        backup_url: normalizeText(row.backup_url) || null,
        weaver: normalizeText(weaver?.name) || null,
        range: normalizeText(range?.range_name) || null,
        width: formatWidth(width),
        weight: formatWeight(weight),
      };
    });

    return json(200, {
      ...baseResponse,
      mapping: {
        status: "mapped",
        external_mapping_count: mappingRows.length,
        ranges: mappingRows.map((row) => ({
          external_weaver_id: row.external_weaver_id,
          external_range_id: row.external_range_id,
          external_range_label:
            normalizeText(row.external_range_label) || null,
        })),
      },
      results,
      pagination: {
        limit,
        offset,
        returned: results.length,
        has_more: hasMore,
      },
    });
  } catch (error) {
    console.error("search_tartans_for_price_column: unhandled error", error);
    return json(500, { error: "Unhandled error." });
  }
});
