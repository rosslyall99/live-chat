import { supabase } from "../supabaseClient";

const SAMPLE_PRICES_MATRIX = {
  version: "2026-01",
  columns: [
    { id: "marton-balmoral", supplier: "Marton Mills", range: "Balmoral", width: "DW", weight: 8 },
    { id: "marton-bute", supplier: "Marton Mills", range: "Bute", width: "DW", weight: 13 },
    { id: "marton-jura", supplier: "Marton Mills", range: "Jura", width: "DW", weight: 16 },
    { id: "marton-tweed", supplier: "Marton Mills", range: "Tweed", width: "DW", weight: "Var" },
    { id: "loch-rv150", supplier: "Lochcarron", range: "Reiver", width: "DW", weight: 11 },
    { id: "loch-braeriach", supplier: "Lochcarron", range: "Braeriach", width: "DW", weight: 13 },
    { id: "loch-strome", supplier: "Lochcarron", range: "Strome", width: "DW", weight: 16 },
    { id: "edgar-med-old-rare", supplier: "House of Edgar", range: "Med/O&R", width: "SW", weight: 13 },
    { id: "edgar-nevis", supplier: "House of Edgar", range: "Nevis", width: "DW", weight: 16 },
    { id: "edgar-heavy", supplier: "House of Edgar", range: "Heavy", width: "SW", weight: 16 },
    { id: "edgar-hebridean", supplier: "House of Edgar", range: "Hebridean", width: "SW", weight: 13 },
    { id: "edgar-clunie", supplier: "House of Edgar", range: "Clunie", width: "DW", weight: 16 },
    { id: "strathmore-t7", supplier: "Strathmore", range: "T7", width: "DW", weight: 11 },
    { id: "strathmore-w60", supplier: "Strathmore", range: "W60", width: "DW", weight: 13 },
    { id: "welsh-rare", supplier: "Welsh", range: "Stock", width: "DW", weight: 13 },
  ],
  sections: [
    {
      name: "KILTS",
      products: [
        row("full-kilt-9-yard", "Full Kilt - 9 Yard", [420, 590, 590, 590, 640, 640, 650, 760, 590, 660, 600, 710, 550, 550, 660]),
        row("full-kilt-8-yard", "Full Kilt - 8 Yard", [400, 550, 550, 550, 600, 600, 600, 700, 550, 600, 550, 650, 500, 500, 550]),
        row("full-kilt-7-yard", "Full Kilt - 7 Yard", [380, 510, 515, 515, 560, 560, 575, 650, 515, 570, 520, 610, 475, 475, 520]),
        row("casual-kilt-6-yard", "Casual Kilt - 6 Yard", [290, 410, 400, 400, 450, 450, 440, 520, 400, 420, 390, 460, 340, 330, 410]),
        row("handfasting", "Handfasting", [35, 45, 45, 45, 45, 50, 50, 55, 50, 55, 55, 60, 45, 45, 55]),
        row("pocket-square", "Pocket Square", [18, 24, 24, 24, 25, 28, 28, 30, 28, 30, 30, 32, 25, 25, 30]),
        row("plaid", "Plaid", [160, 210, 220, 220, 235, 240, 250, 290, 245, 275, 255, 310, 230, 230, 275]),
        row("cloth-per-metre", "Cloth per metre", [45, 65, 72, 72, 76, 82, 88, 95, 86, 95, 90, 98, 72, 74, 95]),
      ],
    },
    {
      name: "TIES",
      products: [
        sparseRow("mto-tie-qty-1", "MTO Tie - qty 1", { "loch-rv150": 55, "loch-braeriach": 65, "loch-strome": 70, "edgar-med-old-rare": 60, "edgar-hebridean": 60, "welsh-rare": 65 }),
        sparseRow("mto-tie-qty-2", "MTO Tie - qty 2", { "loch-rv150": 95, "loch-braeriach": 115, "loch-strome": 125, "edgar-med-old-rare": 105, "edgar-hebridean": 105, "welsh-rare": 115 }),
        sparseRow("regular-tie", "Regular Tie", { "loch-rv150": 25, "loch-braeriach": 55, "loch-strome": 55, "edgar-med-old-rare": 30, "edgar-hebridean": 30, "welsh-rare": 30 }),
        sparseRow("ready-tied-bowtie", "Ready Tied Bowtie", { "marton-balmoral": 25, "marton-bute": 25, "marton-jura": 25, "marton-tweed": 25, "loch-rv150": 25, "loch-braeriach": 25, "loch-strome": 25, "edgar-med-old-rare": 25, "edgar-hebridean": 25, "strathmore-t7": 25, "strathmore-w60": 25, "welsh-rare": 25 }),
      ],
    },
    {
      name: "TROUSERS",
      products: [
        row("standard-up-to-waist-41", 'Standard (up to waist 41")', [180, 245, 255, 255, 270, 270, 285, 320, 270, 325, 285, 340, 285, 290, 335]),
        row("waistcoat-up-to-chest-47", 'Waistcoat (up to chest 47")', [185, 255, 265, 265, 275, 285, 300, 335, 285, 330, 295, 350, 290, 295, 340]),
      ],
    },
    {
      name: "CHILDREN",
      products: [
        row("baby-kilt-4-12m-l8", 'Baby Kilt 4-12m - L8"', [75, 105, 110, 110, 120, 120, 130, 145, 120, 150, 130, 165, 125, 125, 150]),
        row("wee-man-1", "Wee Man 1", [110, 160, 170, 170, 180, 180, 190, 210, 180, 220, 190, 280, 190, 190, 220]),
      ],
    },
    {
      name: "LADIESWEAR",
      products: [
        sparseRow("coorie", "Coorie", { "loch-rv150": 45, "strathmore-t7": 45 }),
        sparseRow("sash", "Sash", { "loch-rv150": 75 }),
        sparseRow("stole", "Stole", { "loch-rv150": 130 }),
        sparseRow("shawl", "Shawl", { "loch-rv150": 155 }),
      ],
    },
  ],
};

function row(id, name, values) {
  return { id, name, values };
}

function sparseRow(id, name, prices) {
  return { id, name, prices };
}

function normalizeOptionalString(value) {
  return value == null ? null : String(value);
}

function normalizeFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function filterFinitePriceEntries(entries) {
  return Object.fromEntries(entries.filter(([, value]) => Number.isFinite(value)));
}

function compareBySortOrder(a, b) {
  const aOrder = Number.isFinite(a?.sort_order) ? a.sort_order : Number.MAX_SAFE_INTEGER;
  const bOrder = Number.isFinite(b?.sort_order) ? b.sort_order : Number.MAX_SAFE_INTEGER;
  return aOrder - bOrder;
}

function normalizeColumn(column) {
  if (!column || !column.id || !column.supplier || !column.range) {
    throw new Error(
      "Prices data contract error: each column needs stable id, supplier, and range.",
    );
  }

  return {
    id: String(column.id),
    supplier: String(column.supplier),
    range: String(column.range),
    width: normalizeOptionalString(column.width),
    weight: column.weight,
  };
}

function normalizeSectionProduct(product, columns) {
  if (!product || !product.id || !product.name) {
    throw new Error("Prices data contract error: each product needs stable id and name.");
  }

  const normalizedMeta = {
    clothRequired: normalizeOptionalString(product.cloth_required),
    cmtPrice: normalizeFiniteNumber(product.cmt_price),
    deliveryWeeksMin: normalizeFiniteNumber(product.delivery_weeks_min),
    deliveryWeeksMax: normalizeFiniteNumber(product.delivery_weeks_max),
    notes: normalizeOptionalString(product.notes),
  };

  if (product.prices && typeof product.prices === "object" && !Array.isArray(product.prices)) {
    const prices = filterFinitePriceEntries(Object.entries(product.prices));

    return {
      id: product.id,
      name: product.name,
      prices,
      ...normalizedMeta,
    };
  }

  if (Array.isArray(product.values)) {
    const prices = filterFinitePriceEntries(
      columns
        .map((column, index) => [column.id, product.values[index]])
    );

    return {
      id: product.id,
      name: product.name,
      prices,
      ...normalizedMeta,
    };
  }

  return {
    id: product.id,
    name: product.name,
    prices: {},
    ...normalizedMeta,
  };
}

export function normalizePricesData(raw) {
  const columns = [...(raw?.columns || [])]
    .sort(compareBySortOrder)
    .map((column) => normalizeColumn(column));

  const sections = [...(raw?.sections || [])]
    .sort(compareBySortOrder)
    .map((section) => ({
      name: section.name,
      products: [...(section.products || [])]
        .sort(compareBySortOrder)
        .map((product) => normalizeSectionProduct(product, columns)),
    }));

  return {
    version: raw?.version || null,
    columns,
    sections,
  };
}

export function getLocalPricesData() {
  return normalizePricesData(SAMPLE_PRICES_MATRIX);
}

async function getRemotePricesData() {
  const { data, error } = await supabase.rpc("get_prices_matrix_staff");

  if (error) {
    throw error;
  }

  return normalizePricesData(data);
}

export async function loadPricesData() {
  const fallbackData = getLocalPricesData();

  try {
    const data = await getRemotePricesData();

    return {
      data,
      source: "supabase",
      error: null,
    };
  } catch (error) {
    console.error("prices: falling back to local sample data", error);

    return {
      data: fallbackData,
      source: "local",
      error,
    };
  }
}

function normalizeExternalRangeLink(link) {
  if (!link || !link.external_range_id) return null;

  return {
    externalWeaverId: normalizeFiniteNumber(link.external_weaver_id),
    externalRangeId: normalizeFiniteNumber(link.external_range_id),
    externalRangeLabel: normalizeOptionalString(link.external_range_label),
    sortOrder: Number.isFinite(link.sort_order) ? link.sort_order : 0,
  };
}

function normalizePriceColumnMappingRow(row) {
  if (!row || !row.matrix_key) {
    throw new Error("Prices mapping contract error: each row needs a matrix_key.");
  }

  const externalRanges = Array.isArray(row.external_ranges)
    ? row.external_ranges
        .map((link) => normalizeExternalRangeLink(link))
        .filter(Boolean)
    : [];

  return {
    matrixKey: String(row.matrix_key),
    externalWeaverId: normalizeFiniteNumber(row.external_weaver_id),
    externalRangeId: normalizeFiniteNumber(row.external_range_id),
    externalMappingCount: Number.isFinite(row.external_mapping_count)
      ? row.external_mapping_count
      : externalRanges.length,
    externalMappingComplete: Boolean(row.external_mapping_complete),
    externalRanges,
  };
}

export async function loadPriceColumnMappings() {
  try {
    const { data, error } = await supabase.rpc(
      "get_price_column_mapping_status_staff",
    );

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data)
      ? data.map((row) => normalizePriceColumnMappingRow(row))
      : [];

    return {
      data: rows,
      source: "supabase",
      error: null,
    };
  } catch (error) {
    console.error("prices: mapping status unavailable", error);

    return {
      data: [],
      source: "unavailable",
      error,
    };
  }
}

export function getPricesData() {
  return getLocalPricesData();
}

export { SAMPLE_PRICES_MATRIX };
