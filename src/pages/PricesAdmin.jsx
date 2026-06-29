import React from "react";
import { supabase } from "../supabaseClient";
import { getMeAndRole } from "../lib/me";
import { normalizePricesData } from "../lib/pricesData";
import "./PricesAdmin.css";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function formatDate(value) {
  if (!value) return "No effective date";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "Unknown time";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatStatus(status) {
  const text = String(status || "unknown").trim();
  if (!text) return "Unknown";

  return text
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCount(value, label) {
  const number = Number.isFinite(value) ? value : 0;
  return `${number} ${label}`;
}

function formatAuditLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "Unknown";

  return text
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toOptionalText(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function buildDraftDefaults(activeList) {
  const activeVersion = String(activeList?.version || "").trim();
  const activeName = String(activeList?.name || "").trim();

  return {
    version: activeVersion ? `${activeVersion}-draft` : "",
    name: activeName ? `${activeName} Draft` : "",
    reason: "",
  };
}

function formatDeliveryWindow(product) {
  if (
    Number.isFinite(product.deliveryWeeksMin) &&
    Number.isFinite(product.deliveryWeeksMax)
  ) {
    return `${product.deliveryWeeksMin}-${product.deliveryWeeksMax} weeks`;
  }

  if (Number.isFinite(product.deliveryWeeksMin)) {
    return `${product.deliveryWeeksMin} weeks`;
  }

  if (Number.isFinite(product.deliveryWeeksMax)) {
    return `${product.deliveryWeeksMax} weeks`;
  }

  return null;
}

function getListTone(list) {
  if (list?.is_active) return "active";
  if (String(list?.status || "").toLowerCase() === "draft") return "draft";
  return "idle";
}

function isDraftList(list) {
  return String(list?.status || "").toLowerCase() === "draft";
}

function isPublishedList(list) {
  return String(list?.status || "").toLowerCase() === "published";
}

function getPreviewState(list) {
  if (list?.is_active) {
    return {
      tone: "live",
      label: "LIVE ACTIVE",
      summary: "This is the current staff-facing published price list.",
    };
  }

  if (isDraftList(list)) {
    return {
      tone: "draft",
      label: "DRAFT",
      summary: "This is a safe draft preview and does not affect live staff prices.",
    };
  }

  if (isPublishedList(list)) {
    return {
      tone: "historical",
      label: "PUBLISHED INACTIVE",
      summary: "This is a published non-live version kept for reference.",
    };
  }

  return {
    tone: "readonly",
    label: formatStatus(list?.status || "read only"),
    summary: "This is a non-live read-only admin preview.",
  };
}

function getMatrixSummary(matrix) {
  const columns = Array.isArray(matrix?.columns) ? matrix.columns : [];
  const sections = Array.isArray(matrix?.sections) ? matrix.sections : [];
  const productCount = sections.reduce(
    (total, section) => total + (section.products?.length || 0),
    0,
  );
  const cellCount = sections.reduce(
    (total, section) =>
      total +
      (section.products || []).reduce(
        (sectionTotal, product) =>
          sectionTotal + Object.keys(product.prices || {}).length,
        0,
      ),
    0,
  );
  const mappedColumnCount = columns.filter(
    (column) =>
      Number.isFinite(column.external_weaver_id) ||
      Number.isFinite(column.external_range_id),
  ).length;

  return {
    columnCount: columns.length,
    sectionCount: sections.length,
    productCount,
    cellCount,
    mappedColumnCount,
  };
}

function getReadinessMetrics(matrixModel) {
  const columns = Array.isArray(matrixModel?.columns) ? matrixModel.columns : [];
  const sections = Array.isArray(matrixModel?.sections) ? matrixModel.sections : [];
  const products = sections.flatMap((section) => section.products || []);
  const productCount = products.length;
  const totalPossibleCells = productCount * columns.length;
  let pricedCellCount = 0;

  products.forEach((product) => {
    columns.forEach((column) => {
      const value = product?.prices?.[column.id];
      if (Number.isFinite(Number(value))) {
        pricedCellCount += 1;
      }
    });
  });

  return {
    productCount,
    totalPossibleCells,
    pricedCellCount,
    blankCellCount: Math.max(totalPossibleCells - pricedCellCount, 0),
  };
}

function getEditabilityLabel({ list, isAdmin, isDraftSelection }) {
  if (isDraftSelection && isAdmin) {
    return "Draft editable by admin";
  }

  if (isDraftSelection && !isAdmin) {
    return "Draft review only for managers";
  }

  if (list?.is_active) {
    return "Active list is read only";
  }

  return "Read-only reference list";
}

function getCapabilityNote({ list, isAdmin, isDraftSelection }) {
  if (isDraftSelection && isAdmin) {
    return "Admins can edit draft pricing here and publish this draft when ready.";
  }

  if (isDraftSelection && !isAdmin) {
    return "Managers can review draft pricing and audit history, but cannot edit or publish.";
  }

  if (list?.is_active) {
    return "Active lists are read-only in the CMS. Create a draft before editing or publishing changes.";
  }

  return "This list is available for review only.";
}

function canPublishList(list, isAdmin) {
  return Boolean(isAdmin && list && isDraftList(list) && !list.is_active);
}

function getHonestListDate(list, kind) {
  if (!list) {
    return {
      label: "Updated",
      value: "Unknown date",
    };
  }

  if (kind === "draft") {
    return {
      label: "Created",
      value: formatDateTime(list.created_at),
    };
  }

  if (kind === "inactive") {
    return {
      label: "Updated",
      value: formatDateTime(list.updated_at || list.created_at),
    };
  }

  return {
    label: "Updated",
    value: formatDateTime(list.updated_at || list.created_at),
  };
}

function formatArchivedDeliveryWindow(item) {
  if (
    Number.isFinite(item?.delivery_weeks_min) &&
    Number.isFinite(item?.delivery_weeks_max)
  ) {
    return `${item.delivery_weeks_min}-${item.delivery_weeks_max} weeks`;
  }

  if (Number.isFinite(item?.delivery_weeks_min)) {
    return `${item.delivery_weeks_min} weeks`;
  }

  if (Number.isFinite(item?.delivery_weeks_max)) {
    return `${item.delivery_weeks_max} weeks`;
  }

  return "";
}

function formatArchivedColumnMapping(item) {
  const parts = [];

  if (Number.isFinite(item?.external_weaver_id)) {
    parts.push(`Weaver ${item.external_weaver_id}`);
  }

  if (Number.isFinite(item?.external_range_id)) {
    parts.push(`Range ${item.external_range_id}`);
  }

  return parts.join(" / ");
}

function buildAdminMatrixModel(matrixData) {
  const normalized = normalizePricesData(matrixData || {});
  const rawColumns = Array.isArray(matrixData?.columns) ? matrixData.columns : [];
  const rawSections = Array.isArray(matrixData?.sections) ? matrixData.sections : [];
  const rawProductLookup = new Map();
  const rawColumnLookup = new Map();
  const rawSectionLookup = new Map();

  rawColumns.forEach((column) => {
    rawColumnLookup.set(String(column?.id || ""), {
      recordId: column?.record_id ? String(column.record_id) : "",
    });
  });

  rawSections.forEach((section) => {
    rawSectionLookup.set(String(section?.name || ""), {
      id: section?.id ? String(section.id) : "",
    });

    (section?.products || []).forEach((product) => {
      const rawPriceCells = product?.price_cells || {};
      const normalizedPriceCells = Object.fromEntries(
        Object.entries(rawPriceCells).map(([columnId, cell]) => [
          String(columnId),
          {
            recordId: cell?.record_id ? String(cell.record_id) : "",
            retailPrice:
              cell?.retail_price != null &&
              Number.isFinite(Number(cell.retail_price))
                ? Number(cell.retail_price)
                : null,
          },
        ]),
      );

      rawProductLookup.set(String(product.id), {
        recordId: product?.record_id ? String(product.record_id) : "",
        sectionName: section?.name || "",
        sectionId: section?.id ? String(section.id) : "",
        priceCells: normalizedPriceCells,
      });
    });
  });

  const columns = (normalized.columns || []).map((column) => ({
    ...column,
    publicId: column.id,
    recordId: rawColumnLookup.get(String(column.id))?.recordId || "",
  }));

  const sections = (normalized.sections || []).map((section) => ({
    ...section,
    id: rawSectionLookup.get(String(section?.name || ""))?.id || "",
    products: (section.products || []).map((product) => {
      const rawMeta = rawProductLookup.get(String(product.id));

      return {
        ...product,
        recordId: rawMeta?.recordId || "",
        priceCells: rawMeta?.priceCells || {},
        section: rawMeta?.sectionName || section.name,
        sectionId: rawMeta?.sectionId || "",
      };
    }),
  }));

  return {
    version: normalized.version,
    columns,
    sections,
  };
}

function buildProductFormState(product) {
  return {
    name: product?.name || "",
    clothRequired: product?.clothRequired || "",
    cmtPrice:
      product?.cmtPrice != null && Number.isFinite(product.cmtPrice)
        ? String(product.cmtPrice)
        : "",
    deliveryWeeksMin:
      product?.deliveryWeeksMin != null &&
      Number.isFinite(product.deliveryWeeksMin)
        ? String(product.deliveryWeeksMin)
        : "",
    deliveryWeeksMax:
      product?.deliveryWeeksMax != null &&
      Number.isFinite(product.deliveryWeeksMax)
        ? String(product.deliveryWeeksMax)
        : "",
    notes: product?.notes || "",
    reason: "",
  };
}

function buildCreateProductFormState(selectedProduct, matrixModel) {
  const sections = Array.isArray(matrixModel?.sections) ? matrixModel.sections : [];
  const fallbackSectionId = selectedProduct?.sectionId || sections[0]?.id || "";

  return {
    sectionId: fallbackSectionId,
    name: "",
    matrixKey: "",
    clothRequired: "",
    cmtPrice: "",
    deliveryWeeksMin: "",
    deliveryWeeksMax: "",
    notes: "",
    sortOrder: "",
    reason: "",
  };
}

function slugifyMatrixKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildCreateColumnFormState() {
  return {
    supplier: "",
    range: "",
    matrixKey: "",
    width: "",
    weight: "",
    supplierSortOrder: "",
    sortOrder: "",
    reason: "",
  };
}

function slugifyColumnMatrixKey(supplier, range) {
  return slugifyMatrixKey([supplier, range].filter(Boolean).join(" "));
}

function parseOptionalNumber(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const number = Number(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

function parseOptionalInteger(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  if (!/^-?\d+$/.test(text)) return Number.NaN;

  return Number(text);
}

function formatAuditValue(key, value) {
  if (value == null || value === "") return "Empty";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (
    (key === "cmt_price" || key === "retail_price") &&
    Number.isFinite(Number(value))
  ) {
    return gbp.format(Number(value));
  }

  if (
    key === "effective_from" &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(value))
  ) {
    return formatDate(String(value));
  }

  return String(value);
}

function getAuditSubject(entry) {
  const beforeData = entry?.before_data || {};
  const afterData = entry?.after_data || {};

  if (entry?.entity_type === "price_list") {
    return afterData.version || afterData.name || "Price list";
  }

  if (entry?.entity_type === "product") {
    return afterData.name || beforeData.name || "Product";
  }

  if (entry?.entity_type === "cell") {
    const productName = afterData.product_name || beforeData.product_name || "Product";
    const supplier = afterData.column_supplier || beforeData.column_supplier || "";
    const range = afterData.column_range || beforeData.column_range || "";
    const columnLabel = [supplier, range].filter(Boolean).join(" / ");

    return columnLabel ? `${productName} / ${columnLabel}` : productName;
  }

  return formatAuditLabel(entry?.entity_type);
}

function getAuditSummary(entry) {
  const subject = getAuditSubject(entry);
  const beforeData = entry?.before_data || {};
  const afterData = entry?.after_data || {};

  if (entry?.action === "draft_created") {
    const sourceVersion = beforeData.source_version || "active list";
    const draftVersion = afterData.version || subject;
    return `${draftVersion} created from ${sourceVersion}.`;
  }

  if (entry?.action === "product_updated") {
    return `${subject} product details updated.`;
  }

  if (entry?.action === "cell_updated") {
    return `${subject} retail price updated.`;
  }

  return `${subject} ${formatAuditLabel(entry?.action).toLowerCase()}.`;
}

function getAuditChanges(entry) {
  const beforeData = entry?.before_data || {};
  const afterData = entry?.after_data || {};

  if (entry?.action === "draft_created") {
    return [
      {
        label: "Source",
        before: beforeData.source_version || beforeData.source_name || "Unknown",
        after: afterData.version || afterData.name || "Draft",
      },
      {
        label: "Status",
        before: formatAuditValue("status", beforeData.source_status),
        after: formatAuditValue("status", afterData.status),
      },
    ];
  }

  const fieldsByAction = {
    product_updated: [
      ["name", "Name"],
      ["cloth_required", "Cloth required"],
      ["cmt_price", "CMT price"],
      ["delivery_weeks_min", "Delivery weeks min"],
      ["delivery_weeks_max", "Delivery weeks max"],
      ["notes", "Notes"],
    ],
    cell_updated: [["retail_price", "Retail price"]],
  };

  const fields = fieldsByAction[entry?.action] || [];

  return fields
    .filter(([key]) => {
      const beforeValue = beforeData[key] ?? null;
      const afterValue = afterData[key] ?? null;
      return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
    })
    .map(([key, label]) => ({
      label,
      before: formatAuditValue(key, beforeData[key]),
      after: formatAuditValue(key, afterData[key]),
    }));
}

function getProductValidationHints(formState) {
  const hints = [];
  const name = String(formState?.name || "").trim();
  const cmtPrice = parseOptionalNumber(formState?.cmtPrice);
  const deliveryWeeksMin = parseOptionalInteger(formState?.deliveryWeeksMin);
  const deliveryWeeksMax = parseOptionalInteger(formState?.deliveryWeeksMax);

  if (!name) {
    hints.push("Product name is required.");
  }

  if (Number.isNaN(cmtPrice)) {
    hints.push("CMT price must be a valid number.");
  } else if (cmtPrice != null && cmtPrice < 0) {
    hints.push("CMT price cannot be negative.");
  }

  if (Number.isNaN(deliveryWeeksMin)) {
    hints.push("Delivery weeks min must be a whole number.");
  } else if (deliveryWeeksMin != null && deliveryWeeksMin < 0) {
    hints.push("Delivery weeks min cannot be negative.");
  }

  if (Number.isNaN(deliveryWeeksMax)) {
    hints.push("Delivery weeks max must be a whole number.");
  } else if (deliveryWeeksMax != null && deliveryWeeksMax < 0) {
    hints.push("Delivery weeks max cannot be negative.");
  }

  if (
    !Number.isNaN(deliveryWeeksMin) &&
    !Number.isNaN(deliveryWeeksMax) &&
    deliveryWeeksMin != null &&
    deliveryWeeksMax != null &&
    deliveryWeeksMin > deliveryWeeksMax
  ) {
    hints.push("Delivery weeks min cannot be greater than delivery weeks max.");
  }

  return hints;
}

function getCreateProductValidationHints(formState) {
  const hints = [];
  const sectionId = String(formState?.sectionId || "").trim();
  const name = String(formState?.name || "").trim();
  const matrixKey = String(formState?.matrixKey || "").trim();
  const cmtPrice = parseOptionalNumber(formState?.cmtPrice);
  const deliveryWeeksMin = parseOptionalInteger(formState?.deliveryWeeksMin);
  const deliveryWeeksMax = parseOptionalInteger(formState?.deliveryWeeksMax);
  const sortOrder = parseOptionalInteger(formState?.sortOrder);

  if (!sectionId) hints.push("Section is required.");
  if (!name) hints.push("Product name is required.");
  if (!matrixKey) hints.push("Matrix key is required.");

  if (Number.isNaN(cmtPrice)) {
    hints.push("CMT price must be a valid number.");
  } else if (cmtPrice != null && cmtPrice < 0) {
    hints.push("CMT price cannot be negative.");
  }

  if (Number.isNaN(deliveryWeeksMin)) {
    hints.push("Delivery weeks min must be a whole number.");
  } else if (deliveryWeeksMin != null && deliveryWeeksMin < 0) {
    hints.push("Delivery weeks min cannot be negative.");
  }

  if (Number.isNaN(deliveryWeeksMax)) {
    hints.push("Delivery weeks max must be a whole number.");
  } else if (deliveryWeeksMax != null && deliveryWeeksMax < 0) {
    hints.push("Delivery weeks max cannot be negative.");
  }

  if (
    !Number.isNaN(deliveryWeeksMin) &&
    !Number.isNaN(deliveryWeeksMax) &&
    deliveryWeeksMin != null &&
    deliveryWeeksMax != null &&
    deliveryWeeksMin > deliveryWeeksMax
  ) {
    hints.push("Delivery weeks min cannot be greater than delivery weeks max.");
  }

  if (Number.isNaN(sortOrder)) {
    hints.push("Sort order must be a whole number.");
  }

  return hints;
}

function getCreateColumnValidationHints(formState) {
  const hints = [];
  const supplier = String(formState?.supplier || "").trim();
  const range = String(formState?.range || "").trim();
  const matrixKey = String(formState?.matrixKey || "").trim();
  const supplierSortOrder = parseOptionalInteger(formState?.supplierSortOrder);
  const sortOrder = parseOptionalInteger(formState?.sortOrder);

  if (!supplier) hints.push("Supplier is required.");
  if (!range) hints.push("Range is required.");
  if (!matrixKey) hints.push("Matrix key is required.");

  if (Number.isNaN(supplierSortOrder)) {
    hints.push("Supplier sort order must be a whole number.");
  }

  if (Number.isNaN(sortOrder)) {
    hints.push("Sort order must be a whole number.");
  }

  return hints;
}

function buildCellFormState(cellDetails) {
  return {
    retailPrice:
      cellDetails?.retailPrice != null && Number.isFinite(cellDetails.retailPrice)
        ? String(cellDetails.retailPrice)
        : "",
    reason: "",
  };
}

function getCellValidationHints(formState) {
  const hints = [];
  const retailPrice = parseOptionalNumber(formState?.retailPrice);

  if (retailPrice == null) {
    hints.push("Retail price is required.");
  } else if (Number.isNaN(retailPrice)) {
    hints.push("Retail price must be a valid number.");
  } else if (retailPrice < 0) {
    hints.push("Retail price cannot be negative.");
  }

  return hints;
}

function PriceListCard({ list, isSelected, onSelect, eyebrow, dateLabel, dateValue }) {
  const tone = getListTone(list);

  return (
    <button
      type="button"
      className={`prices-admin-list-card ${
        isSelected ? "prices-admin-list-card--selected" : ""
      } prices-admin-list-card--${tone}`}
      onClick={onSelect}
    >
      <div className="prices-admin-list-card__header">
        <div>
          <span className="prices-admin-list-card__eyebrow">
            {eyebrow || "Price list"}
          </span>
          <strong className="prices-admin-list-card__version">
            {list.name || "Unnamed price list"}
          </strong>
        </div>
      </div>

      <div className="prices-admin-list-card__meta">
        <span>
          {dateLabel}: {dateValue}
        </span>
      </div>
    </button>
  );
}

function PriceMatrixPreview({
  matrixData,
  matrixModel,
  selectedCellKey,
  selectedCellProductId,
  selectedCellColumnId,
  selectedProductId,
  selectedRangeId,
  onSelectProduct,
  onSelectCell,
  onSelectColumn,
}) {
  const matrix = matrixModel;
  const columns = matrix.columns || [];
  const sections = matrix.sections || [];
  const previewState = React.useMemo(
    () => getPreviewState(matrixData),
    [matrixData],
  );
  const hasSelectedCell = Boolean(
    selectedCellKey && selectedCellProductId && selectedCellColumnId,
  );
  const hasSelectedProduct = Boolean(selectedProductId);
  const hasSelectedRange = Boolean(selectedRangeId);
  const hasActiveSelection =
    hasSelectedCell || hasSelectedProduct || hasSelectedRange;
  const showStatusBadge =
    formatStatus(matrixData?.status).toLowerCase() !== previewState.label.toLowerCase();

  return (
    <div className="prices-admin-preview">
      <div className="prices-admin-preview__summary-strip">
        <div className="prices-admin-preview__intro">
          <div>
            <span className="prices-admin-preview__eyebrow">Selected list</span>
            <h3>{matrixData?.name || "Selected price list"}</h3>
          </div>
          <div className="prices-admin-preview__badges">
            <span
              className={`prices-admin-badge prices-admin-badge--${previewState.tone}`}
            >
              {previewState.label}
            </span>
            {showStatusBadge ? (
              <span className="prices-admin-badge">{formatStatus(matrixData?.status)}</span>
            ) : null}
          </div>
        </div>

        <div className="prices-admin-preview__identity">
          <div className="prices-admin-preview__identity-card">
            <span>Version</span>
            <strong>{matrix.version || "No version"}</strong>
          </div>
          <div className="prices-admin-preview__identity-card">
            <span>Effective</span>
            <strong>{formatDate(matrixData?.effective_from)}</strong>
          </div>
          <div className="prices-admin-preview__identity-card">
            <span>Status</span>
            <strong>{formatStatus(matrixData?.status)}</strong>
          </div>
        </div>
      </div>

      <div
        className={`prices-admin-matrix ${
          hasActiveSelection ? "prices-admin-matrix--has-selection" : ""
        } ${hasSelectedCell ? "prices-admin-matrix--cell-selection" : ""}`}
      >
        <div className="prices-admin-matrix__scroll">
          <table>
            <thead>
              <tr>
                <th className="prices-admin-matrix__product-heading">Product</th>
                {columns.map((column) => {
                  const isMapped =
                    Number.isFinite(column.external_weaver_id) ||
                    Number.isFinite(column.external_range_id);
                  const isSelectedRange = selectedRangeId === column.recordId;
                  const isRelevantColumn = hasSelectedCell
                    ? selectedCellColumnId === column.recordId
                    : hasSelectedRange
                      ? selectedRangeId === column.recordId
                      : true;
                  const isDimmedColumn = hasActiveSelection && !isRelevantColumn;

                  return (
                    <th
                      key={column.id}
                      className={[
                        isSelectedRange ? "prices-admin-matrix__column-heading--selected" : "",
                        isRelevantColumn ? "prices-admin-matrix__column-heading--active" : "",
                        isDimmedColumn ? "prices-admin-matrix__column-heading--dimmed" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className={`prices-admin-matrix__column ${
                          !isMapped ? "prices-admin-matrix__column--unmapped" : ""
                        } ${isSelectedRange ? "prices-admin-matrix__column--selected" : ""} ${
                          isDimmedColumn ? "prices-admin-matrix__column--dimmed" : ""
                        }`}
                        onClick={() => onSelectColumn(column.recordId)}
                        title={
                          isMapped ? "Mapped to tartan range" : "No tartan mapping"
                        }
                        aria-label={
                          isMapped
                            ? `${column.supplier} ${column.range} - Mapped to tartan range`
                            : `${column.supplier} ${column.range} - No tartan mapping`
                        }
                      >
                        <strong>{column.supplier}</strong>
                        <span>{column.range}</span>
                        <small>
                          {[column.width, column.weight].filter(Boolean).join(" / ") ||
                            "No spec"}
                        </small>
                        <span
                          className={`prices-admin-matrix__column-marker ${
                            isMapped
                              ? "prices-admin-matrix__column-marker--mapped"
                              : "prices-admin-matrix__column-marker--unmapped"
                          }`}
                          title={isMapped ? "Mapped to tartan range" : "No tartan mapping"}
                          aria-hidden="true"
                        >
                          {isMapped ? "•" : "!"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <React.Fragment key={section.name}>
                  <tr className="prices-admin-matrix__section-row">
                    <th colSpan={columns.length + 1}>{section.name}</th>
                  </tr>
                  {(section.products || []).map((product) => {
                    const isSelected = product.recordId === selectedProductId;
                    const isRelevantRow = hasSelectedCell
                      ? selectedCellProductId === product.recordId
                      : hasSelectedProduct
                        ? selectedProductId === product.recordId
                        : true;
                    const isDimmedRow = hasActiveSelection && !isRelevantRow;

                    return (
                      <tr
                        key={product.recordId || product.id}
                        className={`prices-admin-matrix__product-row ${
                          isSelected ? "prices-admin-matrix__product-row--selected" : ""
                        } ${isDimmedRow ? "prices-admin-matrix__product-row--dimmed" : ""}`}
                        onClick={() => onSelectProduct(product.recordId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectProduct(product.recordId);
                          }
                        }}
                        tabIndex={0}
                      >
                        <th
                          className={`prices-admin-matrix__product-cell ${
                            isRelevantRow ? "prices-admin-matrix__product-cell--active" : ""
                          } ${isDimmedRow ? "prices-admin-matrix__product-cell--dimmed" : ""}`}
                        >
                          <div className="prices-admin-matrix__product-name">
                            {product.name}
                          </div>
                        </th>
                        {columns.map((column) => {
                          const value = product.prices?.[column.id];
                          const cellMeta = product.priceCells?.[column.id] || null;
                          const cellKey =
                            cellMeta?.recordId ||
                            `${product.recordId}:${column.recordId}`;
                          const isSelectedCell = selectedCellKey === cellKey;
                          const isRelevantCell = hasSelectedCell
                            ? isSelectedCell
                            : isRelevantRow &&
                              (hasSelectedRange ? selectedRangeId === column.recordId : true);
                          const isDimmedCell = hasActiveSelection && !isRelevantCell;

                          return (
                            <td
                              key={`${product.id}:${column.id}`}
                              className={`prices-admin-matrix__price-cell ${
                                isSelectedCell
                                  ? "prices-admin-matrix__price-cell--selected"
                                  : ""
                              } ${isDimmedCell ? "prices-admin-matrix__price-cell--dimmed" : ""} ${
                                isRelevantCell
                                  ? "prices-admin-matrix__price-cell--relevant"
                                  : ""
                              }`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectCell({
                                  productRecordId: product.recordId,
                                  productName: product.name,
                                  productMatrixKey: product.id,
                                  columnRecordId: column.recordId,
                                  columnPublicId: column.id,
                                  columnLabel: `${column.supplier} ${column.range}`,
                                  cellRecordId: cellMeta?.recordId || "",
                                  retailPrice:
                                    cellMeta?.retailPrice != null
                                      ? cellMeta.retailPrice
                                      : Number.isFinite(value)
                                        ? Number(value)
                                        : null,
                                });
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  onSelectCell({
                                    productRecordId: product.recordId,
                                    productName: product.name,
                                    productMatrixKey: product.id,
                                    columnRecordId: column.recordId,
                                    columnPublicId: column.id,
                                    columnLabel: `${column.supplier} ${column.range}`,
                                    cellRecordId: cellMeta?.recordId || "",
                                    retailPrice:
                                      cellMeta?.retailPrice != null
                                        ? cellMeta.retailPrice
                                        : Number.isFinite(value)
                                          ? Number(value)
                                          : null,
                                  });
                                }
                              }}
                              tabIndex={0}
                            >
                              {Number.isFinite(value) ? gbp.format(value) : "-"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PriceAuditPanel({
  selectedList,
  loadingAudit,
  refreshingAudit,
  auditError,
  auditEntries,
  lastAuditLoadedAt,
  expanded,
  onToggleExpanded,
  onRefresh,
}) {
  return (
    <section className="prices-admin-audit-panel">
      <div className="prices-admin-audit-panel__header">
        <button
          type="button"
          className="prices-admin-audit-panel__toggle"
          onClick={onToggleExpanded}
        >
          <h3>History</h3>
          <span
            className={`prices-admin-audit-panel__chevron ${
              expanded ? "is-open" : ""
            }`}
            aria-hidden="true"
          >
            v
          </span>
        </button>
        <div className="prices-admin-audit-panel__side">
          {selectedList ? (
            <button
              type="button"
              className="prices-admin-secondary-button prices-admin-audit-panel__refresh"
              onClick={onRefresh}
              disabled={loadingAudit || refreshingAudit}
            >
              <span>{refreshingAudit ? "Refreshing..." : "Refresh"}</span>
              <small>
                {lastAuditLoadedAt
                  ? formatDateTime(lastAuditLoadedAt)
                  : "Not loaded yet"}
              </small>
            </button>
          ) : null}
        </div>
      </div>

      {!expanded ? null : (
        <>
          {loadingAudit ? (
            <div className="prices-admin-state">
              <strong>Loading history</strong>
              <p>Fetching the latest selected-list audit entries.</p>
            </div>
          ) : null}

          {!loadingAudit && auditError ? (
            <div className="prices-admin-state prices-admin-state--error">
              <strong>Could not load history</strong>
              <p>{auditError}</p>
            </div>
          ) : null}

          {!loadingAudit && !auditError && auditEntries.length === 0 ? (
            <div className="prices-admin-state">
              <strong>No history yet</strong>
              <p>No recorded admin audit entries were returned for this price list.</p>
            </div>
          ) : null}

          {!loadingAudit && !auditError && auditEntries.length > 0 ? (
            <div className="prices-admin-audit-log">
              {auditEntries.map((entry) => {
                const changes = getAuditChanges(entry);

                return (
                  <article key={entry.id} className="prices-admin-audit-entry">
                    <div className="prices-admin-audit-entry__top">
                      <div>
                        <div className="prices-admin-audit-entry__badges">
                          <span className="prices-admin-badge prices-admin-badge--readonly">
                            {formatAuditLabel(entry.entity_type)}
                          </span>
                          <span className="prices-admin-badge prices-admin-badge--historical">
                            {formatAuditLabel(entry.action)}
                          </span>
                        </div>
                        <h4>{getAuditSummary(entry)}</h4>
                      </div>
                      <div className="prices-admin-audit-entry__side">
                        <time
                          className="prices-admin-audit-entry__time"
                          dateTime={entry.created_at || undefined}
                        >
                          {formatDateTime(entry.created_at)}
                        </time>
                        <span className="prices-admin-audit-entry__actor">
                          By {entry.changed_by_name || "Unknown staff user"}
                        </span>
                      </div>
                    </div>

                    <div className="prices-admin-audit-entry__meta">
                      {entry.reason ? <span>Reason: {entry.reason}</span> : null}
                    </div>

                    {changes.length > 0 ? (
                      <dl className="prices-admin-audit-entry__changes">
                        {changes.map((change) => (
                          <div
                            key={`${entry.id}:${change.label}`}
                            className="prices-admin-audit-entry__change"
                          >
                            <dt>{change.label}</dt>
                            <dd>
                              <span>{change.before}</span>
                              <strong>{change.after}</strong>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function PriceStatusPanel({
  selectedList,
  matrixData,
  matrixModel,
  auditEntries,
  auditError,
  loadingAudit,
  isAdmin,
  publishActionError,
  publishActionSuccess,
  publishing,
  canManageProducts,
  onOpenProductCreate,
  canManageColumns,
  canBrowseArchivedItems,
  onOpenColumnCreate,
  onOpenArchivedItems,
  onOpenPublishModal,
}) {
  const readiness = React.useMemo(
    () => getReadinessMetrics(matrixModel),
    [matrixModel],
  );
  const latestAuditEntry = Array.isArray(auditEntries) ? auditEntries[0] || null : null;
  const isDraftSelection = Boolean(
    (matrixData || selectedList) &&
      isDraftList(matrixData || selectedList) &&
      !(matrixData || selectedList)?.is_active,
  );
  const canPublishSelectedList = canPublishList(matrixData || selectedList, isAdmin);

  if (!isDraftSelection) {
    return null;
  }

  return (
    <section className="prices-admin-status-panel">
      <div className="prices-admin-status-panel__header">
        <div>
          <span className="prices-admin-panel__eyebrow">Draft controls</span>
          <h3>Draft controls</h3>
        </div>
        <div className="prices-admin-status-panel__actions-inline">
          {canBrowseArchivedItems ? (
            <button
              type="button"
              className="prices-admin-secondary-button"
              onClick={onOpenArchivedItems}
            >
              Archived items
            </button>
          ) : null}
          {canManageColumns ? (
            <button
              type="button"
              className="prices-admin-secondary-button"
              onClick={onOpenColumnCreate}
            >
              Add column
            </button>
          ) : null}
          {canManageProducts ? (
            <button
              type="button"
              className="prices-admin-secondary-button"
              onClick={onOpenProductCreate}
            >
              Add product
            </button>
          ) : null}
          {canPublishSelectedList ? (
            <button
              type="button"
              className="prices-admin-warning-button"
              onClick={onOpenPublishModal}
              disabled={publishing}
            >
              {publishing ? "Publishing..." : "Publish draft"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="prices-admin-status-panel__grid">
        <div className="prices-admin-status-card">
          <span>Name</span>
          <strong>{selectedList?.name || matrixData?.name || "Unnamed price list"}</strong>
          <small>{selectedList?.version || matrixData?.version || "No version"}</small>
        </div>

        <div className="prices-admin-status-card">
          <span>Status</span>
          <strong>{formatStatus((matrixData || selectedList)?.status)}</strong>
          <small>{isAdmin ? "Draft editable by admin" : "Draft review only"}</small>
        </div>

        <div className="prices-admin-status-card">
          <span>Products and cells</span>
          <strong>
            {readiness.productCount} products / {readiness.totalPossibleCells} possible cells
          </strong>
          <small>
            {readiness.pricedCellCount} priced / {readiness.blankCellCount} blank
          </small>
        </div>

        <div className="prices-admin-status-card">
          <span>Audit history</span>
          <strong>
            {loadingAudit
              ? "Loading history"
              : auditError
                ? "History unavailable"
                : latestAuditEntry
                  ? formatDateTime(latestAuditEntry.created_at)
                  : "No history entries"}
          </strong>
          <small>
            {auditError
              ? "History can fail without blocking draft editing."
              : latestAuditEntry
                ? formatAuditLabel(latestAuditEntry.action)
                : "No recorded changes yet"}
          </small>
        </div>
      </div>

      {publishActionError ? (
        <div className="prices-admin-feedback prices-admin-feedback--error">
          {publishActionError}
        </div>
      ) : null}

      {publishActionSuccess ? (
        <div className="prices-admin-feedback prices-admin-feedback--success">
          {publishActionSuccess}
        </div>
      ) : null}
    </section>
  );
}

export default function PricesAdmin() {
  const [role, setRole] = React.useState("");
  const [loadingLists, setLoadingLists] = React.useState(true);
  const [listsError, setListsError] = React.useState("");
  const [priceLists, setPriceLists] = React.useState([]);
  const [selectedPriceListId, setSelectedPriceListId] = React.useState("");
  const [loadingMatrix, setLoadingMatrix] = React.useState(false);
  const [matrixError, setMatrixError] = React.useState("");
  const [matrixData, setMatrixData] = React.useState(null);
  const [loadingAudit, setLoadingAudit] = React.useState(false);
  const [refreshingAudit, setRefreshingAudit] = React.useState(false);
  const [auditError, setAuditError] = React.useState("");
  const [auditEntries, setAuditEntries] = React.useState([]);
  const [lastAuditLoadedAt, setLastAuditLoadedAt] = React.useState("");
  const [draftFormOpen, setDraftFormOpen] = React.useState(false);
  const [draftVersion, setDraftVersion] = React.useState("");
  const [draftName, setDraftName] = React.useState("");
  const [draftReason, setDraftReason] = React.useState("");
  const [creatingDraft, setCreatingDraft] = React.useState(false);
  const [draftActionError, setDraftActionError] = React.useState("");
  const [draftActionSuccess, setDraftActionSuccess] = React.useState("");
  const [productCreateOpen, setProductCreateOpen] = React.useState(false);
  const [productCreateForm, setProductCreateForm] = React.useState(() =>
    buildCreateProductFormState(null, null),
  );
  const [productCreateKeyTouched, setProductCreateKeyTouched] = React.useState(false);
  const [creatingProduct, setCreatingProduct] = React.useState(false);
  const [productCreateError, setProductCreateError] = React.useState("");
  const [productCreateSuccess, setProductCreateSuccess] = React.useState("");
  const [columnCreateOpen, setColumnCreateOpen] = React.useState(false);
  const [columnCreateForm, setColumnCreateForm] = React.useState(() =>
    buildCreateColumnFormState(),
  );
  const [columnCreateKeyTouched, setColumnCreateKeyTouched] = React.useState(false);
  const [creatingColumn, setCreatingColumn] = React.useState(false);
  const [columnCreateError, setColumnCreateError] = React.useState("");
  const [columnCreateSuccess, setColumnCreateSuccess] = React.useState("");
  const [archivedItemsOpen, setArchivedItemsOpen] = React.useState(false);
  const [loadingArchivedItems, setLoadingArchivedItems] = React.useState(false);
  const [archivedItemsError, setArchivedItemsError] = React.useState("");
  const [archivedItemsData, setArchivedItemsData] = React.useState(null);
  const [archivedRestoreConfirmOpen, setArchivedRestoreConfirmOpen] = React.useState(false);
  const [archivedRestoreTarget, setArchivedRestoreTarget] = React.useState(null);
  const [archivedRestoreReason, setArchivedRestoreReason] = React.useState("");
  const [restoringArchivedItem, setRestoringArchivedItem] = React.useState(false);
  const [archivedRestoreError, setArchivedRestoreError] = React.useState("");
  const [archivedRestoreSuccess, setArchivedRestoreSuccess] = React.useState("");
  const [columnArchiveConfirmOpen, setColumnArchiveConfirmOpen] = React.useState(false);
  const [columnArchiveTargetId, setColumnArchiveTargetId] = React.useState("");
  const [columnArchiveReason, setColumnArchiveReason] = React.useState("");
  const [archivingColumn, setArchivingColumn] = React.useState(false);
  const [columnArchiveError, setColumnArchiveError] = React.useState("");
  const [productArchiveConfirmOpen, setProductArchiveConfirmOpen] = React.useState(false);
  const [archiveReason, setArchiveReason] = React.useState("");
  const [archivingProduct, setArchivingProduct] = React.useState(false);
  const [productArchiveError, setProductArchiveError] = React.useState("");
  const [selectedContext, setSelectedContext] = React.useState("none");
  const [selectedProductId, setSelectedProductId] = React.useState("");
  const [selectedRangeId, setSelectedRangeId] = React.useState("");
  const [productForm, setProductForm] = React.useState(() =>
    buildProductFormState(null),
  );
  const [productActionError, setProductActionError] = React.useState("");
  const [productActionSuccess, setProductActionSuccess] = React.useState("");
  const [savingProduct, setSavingProduct] = React.useState(false);
  const [selectedCell, setSelectedCell] = React.useState(null);
  const [cellActionError, setCellActionError] = React.useState("");
  const [cellActionSuccess, setCellActionSuccess] = React.useState("");
  const [cellForm, setCellForm] = React.useState(() => buildCellFormState(null));
  const [savingCell, setSavingCell] = React.useState(false);
  const [publishModalOpen, setPublishModalOpen] = React.useState(false);
  const [publishReason, setPublishReason] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const [publishActionError, setPublishActionError] = React.useState("");
  const [publishActionSuccess, setPublishActionSuccess] = React.useState("");
  const [inactiveListsExpanded, setInactiveListsExpanded] = React.useState(false);
  const [historyExpanded, setHistoryExpanded] = React.useState(false);

  const loadListsSeq = React.useRef(0);
  const loadMatrixSeq = React.useRef(0);
  const loadAuditSeq = React.useRef(0);
  const loadArchivedSeq = React.useRef(0);

  const canView = role === "admin" || role === "manager";
  const isAdmin = role === "admin";
  const activePriceList = React.useMemo(
    () => priceLists.find((item) => item.is_active) || null,
    [priceLists],
  );
  const selectedPriceList = React.useMemo(
    () => priceLists.find((item) => item.id === selectedPriceListId) || null,
    [priceLists, selectedPriceListId],
  );
  const currentDraftList = React.useMemo(
    () =>
      priceLists.find(
        (item) => isDraftList(item) && !item.is_active,
      ) || null,
    [priceLists],
  );
  const inactiveLists = React.useMemo(
    () =>
      priceLists.filter(
        (item) =>
          !item.is_active &&
          (!currentDraftList || item.id !== currentDraftList.id),
      ),
    [priceLists, currentDraftList],
  );
  const matrixModel = React.useMemo(
    () => buildAdminMatrixModel(matrixData),
    [matrixData],
  );
  const allProducts = React.useMemo(
    () =>
      (matrixModel.sections || []).flatMap((section) => section.products || []),
    [matrixModel],
  );
  const selectedProduct = React.useMemo(
    () => allProducts.find((product) => product.recordId === selectedProductId) || null,
    [allProducts, selectedProductId],
  );
  const selectedCellKey = selectedCell
    ? selectedCell.cellRecordId ||
      `${selectedCell.productRecordId}:${selectedCell.columnRecordId}`
    : "";
  const isDraftSelection = Boolean(matrixData && isDraftList(matrixData) && !matrixData?.is_active);
  const canManageProducts = Boolean(isAdmin && isDraftSelection);
  const canManageColumns = Boolean(isAdmin && isDraftSelection);
  const canBrowseArchivedItems = Boolean(isDraftSelection);
  const canRestoreArchivedItems = Boolean(isAdmin && isDraftSelection);
  const draftSections = matrixModel.sections || [];
  const selectedColumnFromCell = React.useMemo(
    () =>
      (matrixModel.columns || []).find(
        (column) => column.recordId === selectedCell?.columnRecordId,
      ) || null,
    [matrixModel.columns, selectedCell?.columnRecordId],
  );
  const selectedRange = React.useMemo(
    () =>
      (matrixModel.columns || []).find(
        (column) => column.recordId === selectedRangeId,
      ) || null,
    [matrixModel.columns, selectedRangeId],
  );
  const columnArchiveTarget = React.useMemo(
    () =>
      (matrixModel.columns || []).find(
        (column) => column.recordId === columnArchiveTargetId,
      ) || null,
    [matrixModel.columns, columnArchiveTargetId],
  );
  const selectedProductIsDraftEditable = Boolean(
    isAdmin && isDraftSelection && selectedProduct && selectedContext === "product",
  );
  const selectedColumnIsDraftEditable = Boolean(
    isAdmin &&
      isDraftSelection &&
      (selectedRange || selectedColumnFromCell) &&
      (selectedContext === "range" || selectedContext === "cell"),
  );
  const canEditSelectedProduct = selectedProductIsDraftEditable;
  const productValidationHints = React.useMemo(
    () => getProductValidationHints(productForm),
    [productForm],
  );
  const createProductValidationHints = React.useMemo(
    () => getCreateProductValidationHints(productCreateForm),
    [productCreateForm],
  );
  const createColumnValidationHints = React.useMemo(
    () => getCreateColumnValidationHints(columnCreateForm),
    [columnCreateForm],
  );
  const canEditSelectedCell = Boolean(
    isAdmin &&
      isDraftSelection &&
      selectedCell &&
      selectedCell.productRecordId &&
      selectedCell.columnRecordId,
  );
  const cellValidationHints = React.useMemo(
    () => getCellValidationHints(cellForm),
    [cellForm],
  );
  const canPublishSelectedList = canPublishList(matrixData || selectedPriceList, isAdmin);
  const archivedProducts = Array.isArray(archivedItemsData?.products)
    ? archivedItemsData.products
    : [];
  const archivedColumns = Array.isArray(archivedItemsData?.columns)
    ? archivedItemsData.columns
    : [];

  const loadPriceLists = React.useCallback(
    async ({ preferredSelectionId } = {}) => {
      const seq = ++loadListsSeq.current;

      setLoadingLists(true);
      setListsError("");

      try {
        const { role: nextRole } = await getMeAndRole();
        if (seq !== loadListsSeq.current) return;

        const normalizedRole = String(nextRole || "").toLowerCase();
        setRole(normalizedRole);

        if (!["admin", "manager"].includes(normalizedRole)) {
          setPriceLists([]);
          setSelectedPriceListId("");
          setMatrixData(null);
          return;
        }

        const { data, error } = await supabase.rpc("get_price_lists_admin");
        if (seq !== loadListsSeq.current) return;
        if (error) throw error;

        const nextLists = Array.isArray(data) ? data : [];
        setPriceLists(nextLists);
        setSelectedPriceListId((current) => {
          if (
            preferredSelectionId &&
            nextLists.some((item) => item.id === preferredSelectionId)
          ) {
            return preferredSelectionId;
          }

          if (current && nextLists.some((item) => item.id === current)) {
            return current;
          }

          const nextActiveList = nextLists.find((item) => item.is_active);
          return nextActiveList?.id || nextLists[0]?.id || "";
        });
      } catch (error) {
        console.error("prices admin: failed to load price lists", error);
        if (seq !== loadListsSeq.current) return;

        setListsError(error?.message || "Could not load HUB price lists.");
        setPriceLists([]);
        setSelectedPriceListId("");
        setMatrixData(null);
      } finally {
        if (seq === loadListsSeq.current) {
          setLoadingLists(false);
        }
      }
    },
    [],
  );

  React.useEffect(() => {
    loadPriceLists();
  }, [loadPriceLists]);

  const loadSelectedMatrix = React.useCallback(async () => {
    if (!canView || !selectedPriceListId) {
      setLoadingMatrix(false);
      setMatrixError("");
      setMatrixData(null);
      return;
    }

    const seq = ++loadMatrixSeq.current;

    setLoadingMatrix(true);
    setMatrixError("");

    try {
      const { data, error } = await supabase.rpc("get_price_list_matrix_admin", {
        p_price_list_id: selectedPriceListId,
      });

      if (seq !== loadMatrixSeq.current) return;
      if (error) throw error;

      setMatrixData(data || null);
    } catch (error) {
      console.error("prices admin: failed to load matrix", error);
      if (seq !== loadMatrixSeq.current) return;

      setMatrixError(error?.message || "Could not load the selected matrix.");
      setMatrixData(null);
    } finally {
      if (seq === loadMatrixSeq.current) {
        setLoadingMatrix(false);
      }
    }
  }, [canView, selectedPriceListId]);

  React.useEffect(() => {
    loadSelectedMatrix();
  }, [loadSelectedMatrix]);

  const loadSelectedAudit = React.useCallback(
    async ({ background = false, priceListId } = {}) => {
      const targetPriceListId = priceListId || selectedPriceListId;

      if (!canView || !targetPriceListId) {
        setLoadingAudit(false);
        setRefreshingAudit(false);
        setAuditError("");
        setAuditEntries([]);
        setLastAuditLoadedAt("");
        return;
      }

      const seq = ++loadAuditSeq.current;

      if (background) {
        setRefreshingAudit(true);
      } else {
        setLoadingAudit(true);
      }
      setAuditError("");

      try {
        const { data, error } = await supabase.rpc("get_price_audit_log_admin", {
          p_price_list_id: targetPriceListId,
          p_limit: 50,
          p_offset: 0,
        });

        if (seq !== loadAuditSeq.current) return;
        if (error) throw error;

        setAuditEntries(Array.isArray(data) ? data : []);
        setLastAuditLoadedAt(new Date().toISOString());
      } catch (error) {
        console.error("prices admin: failed to load audit history", error);
        if (seq !== loadAuditSeq.current) return;

        setAuditError(error?.message || "Could not load the selected audit history.");
        if (!background) {
          setAuditEntries([]);
          setLastAuditLoadedAt("");
        }
      } finally {
        if (seq === loadAuditSeq.current) {
          if (background) {
            setRefreshingAudit(false);
          } else {
            setLoadingAudit(false);
          }
        }
      }
    },
    [canView, selectedPriceListId],
  );

  React.useEffect(() => {
    loadSelectedAudit();
  }, [loadSelectedAudit]);

  const loadArchivedItems = React.useCallback(
    async ({ priceListId } = {}) => {
      const targetPriceListId = priceListId || selectedPriceListId;

      if (!canView || !targetPriceListId) {
        setLoadingArchivedItems(false);
        setArchivedItemsError("");
        setArchivedItemsData(null);
        return;
      }

      const seq = ++loadArchivedSeq.current;

      setLoadingArchivedItems(true);
      setArchivedItemsError("");

      try {
        const { data, error } = await supabase.rpc(
          "get_price_archived_structure_admin",
          {
            p_price_list_id: targetPriceListId,
          },
        );

        if (seq !== loadArchivedSeq.current) return;
        if (error) throw error;

        setArchivedItemsData(data || null);
      } catch (error) {
        console.error("prices admin: failed to load archived items", error);
        if (seq !== loadArchivedSeq.current) return;

        setArchivedItemsError(
          error?.message || "Could not load archived items for this draft.",
        );
        setArchivedItemsData(null);
      } finally {
        if (seq === loadArchivedSeq.current) {
          setLoadingArchivedItems(false);
        }
      }
    },
    [canView, selectedPriceListId],
  );

  React.useEffect(() => {
    setSelectedContext("none");
    setSelectedProductId("");
    setSelectedRangeId("");
    setSelectedCell(null);
    setCellForm(buildCellFormState(null));
    setCellActionError("");
    setCellActionSuccess("");
    setProductForm(buildProductFormState(null));
    setProductActionError("");
    setProductActionSuccess("");
    setProductCreateOpen(false);
    setProductCreateForm(buildCreateProductFormState(null, null));
    setProductCreateKeyTouched(false);
    setProductCreateError("");
    setProductCreateSuccess("");
    setColumnCreateOpen(false);
    setColumnCreateForm(buildCreateColumnFormState());
    setColumnCreateKeyTouched(false);
    setColumnCreateError("");
    setColumnCreateSuccess("");
    setArchivedItemsOpen(false);
    setLoadingArchivedItems(false);
    setArchivedItemsError("");
    setArchivedItemsData(null);
    setArchivedRestoreConfirmOpen(false);
    setArchivedRestoreTarget(null);
    setArchivedRestoreReason("");
    setRestoringArchivedItem(false);
    setArchivedRestoreError("");
    setArchivedRestoreSuccess("");
    setColumnArchiveConfirmOpen(false);
    setColumnArchiveTargetId("");
    setColumnArchiveReason("");
    setColumnArchiveError("");
    setProductArchiveConfirmOpen(false);
    setArchiveReason("");
    setProductArchiveError("");
    setPublishModalOpen(false);
    setPublishReason("");
    setPublishActionError("");
    setPublishActionSuccess("");
    setInactiveListsExpanded(false);
    setHistoryExpanded(false);
  }, [selectedPriceListId]);

  const refreshAuditAfterSuccess = React.useCallback(
    (priceListId) => {
      loadSelectedAudit({ background: true, priceListId }).catch((error) => {
        console.error("prices admin: background audit refresh failed", error);
      });
    },
    [loadSelectedAudit],
  );

  React.useEffect(() => {
    if (!selectedProductId) return;
    if (selectedProduct) return;

    setSelectedContext("none");
    setSelectedProductId("");
    setSelectedRangeId("");
    setSelectedCell(null);
    setCellForm(buildCellFormState(null));
    setProductForm(buildProductFormState(null));
  }, [selectedProduct, selectedProductId]);

  React.useEffect(() => {
    setProductForm(buildProductFormState(selectedProduct));
  }, [selectedProduct]);

  React.useEffect(() => {
    if (!selectedRangeId) return;
    if (selectedRange) return;

    setSelectedContext("none");
    setSelectedRangeId("");
  }, [selectedRange, selectedRangeId]);

  React.useEffect(() => {
    if (!selectedCell?.productRecordId || !selectedCell?.columnRecordId) return;

    const refreshedProduct = allProducts.find(
      (product) => product.recordId === selectedCell.productRecordId,
    );
    const refreshedColumn = (matrixModel.columns || []).find(
      (column) => column.recordId === selectedCell.columnRecordId,
    );

    if (!refreshedProduct || !refreshedColumn) {
      setSelectedCell(null);
      setCellForm(buildCellFormState(null));
      return;
    }

    const nextRetailPrice = refreshedProduct.prices?.[refreshedColumn.id];
    const nextCellMeta = refreshedProduct.priceCells?.[refreshedColumn.id] || null;
    const nextRetailValue =
      nextCellMeta?.retailPrice != null
        ? nextCellMeta.retailPrice
        : Number.isFinite(nextRetailPrice)
          ? Number(nextRetailPrice)
          : null;
    const nextCellRecordId = nextCellMeta?.recordId || "";
    const nextColumnLabel = `${refreshedColumn.supplier} ${refreshedColumn.range}`;

    setSelectedCell((current) =>
      current
        ? current.productName === refreshedProduct.name &&
          current.columnLabel === nextColumnLabel &&
          current.retailPrice === nextRetailValue &&
          current.cellRecordId === nextCellRecordId
          ? current
          : {
              ...current,
              productName: refreshedProduct.name,
              columnLabel: nextColumnLabel,
              cellRecordId: nextCellRecordId,
              retailPrice: nextRetailValue,
            }
        : current,
    );
  }, [allProducts, matrixModel.columns, selectedCell]);

  React.useEffect(() => {
    setCellForm(buildCellFormState(selectedCell));
  }, [selectedCell]);

  function openDraftForm() {
    const defaults = buildDraftDefaults(activePriceList);
    setDraftVersion(defaults.version);
    setDraftName(defaults.name);
    setDraftReason(defaults.reason);
    setDraftActionError("");
    setDraftActionSuccess("");
    setDraftFormOpen(true);
  }

  function closeDraftForm() {
    if (creatingDraft) return;
    setDraftFormOpen(false);
    setDraftActionError("");
  }

  async function createDraftFromActive(event) {
    event.preventDefault();
    if (!isAdmin || creatingDraft) return;

    setCreatingDraft(true);
    setDraftActionError("");
    setDraftActionSuccess("");

    try {
      const { data, error } = await supabase.rpc(
        "create_price_list_draft_from_active_admin",
        {
          p_version: toOptionalText(draftVersion),
          p_name: toOptionalText(draftName),
          p_reason: toOptionalText(draftReason),
        },
      );

      if (error) throw error;

      const createdDraft = Array.isArray(data) ? data[0] || null : data || null;
      const createdDraftId = createdDraft?.id || "";
      const createdDraftVersion = createdDraft?.version || "";

      await loadPriceLists({
        preferredSelectionId:
          createdDraftId || activePriceList?.id || undefined,
      });
      refreshAuditAfterSuccess(createdDraftId || activePriceList?.id || "");

      setDraftFormOpen(false);
      setDraftActionError("");
      setDraftActionSuccess(
        createdDraftVersion
          ? `Draft ${createdDraftVersion} created from the active price list.`
          : "Draft created from the active price list.",
      );
    } catch (error) {
      console.error("prices admin: failed to create draft", error);
      setDraftActionError(
        error?.message || "Could not create a draft from the active price list.",
      );
    } finally {
      setCreatingDraft(false);
    }
  }

  function updateProductForm(key, value) {
    setProductForm((current) => ({ ...current, [key]: value }));
  }

  function openProductCreate() {
    if (!canManageProducts) return;
    setProductCreateForm(buildCreateProductFormState(selectedProduct, matrixModel));
    setProductCreateKeyTouched(false);
    setProductCreateError("");
    setProductCreateSuccess("");
    setProductArchiveError("");
    setProductCreateOpen(true);
  }

  function openArchivedItems() {
    if (!canBrowseArchivedItems || !selectedPriceList) return;
    setArchivedItemsOpen(true);
    setArchivedItemsError("");
    setArchivedRestoreError("");
    setArchivedRestoreSuccess("");
    loadArchivedItems({ priceListId: selectedPriceList.id }).catch((error) => {
      console.error("prices admin: initial archived items load failed", error);
    });
  }

  function closeArchivedItems() {
    if (restoringArchivedItem) return;
    setArchivedItemsOpen(false);
    setArchivedItemsError("");
  }

  function openColumnCreate() {
    if (!canManageColumns) return;
    setColumnCreateForm(buildCreateColumnFormState());
    setColumnCreateKeyTouched(false);
    setColumnCreateError("");
    setColumnCreateSuccess("");
    setColumnArchiveError("");
    setColumnCreateOpen(true);
  }

  function closeColumnCreate() {
    if (creatingColumn) return;
    setColumnCreateOpen(false);
    setColumnCreateError("");
    setColumnCreateKeyTouched(false);
  }

  function closeProductCreate() {
    if (creatingProduct) return;
    setProductCreateOpen(false);
    setProductCreateError("");
    setProductCreateKeyTouched(false);
  }

  function updateProductCreateForm(key, value) {
    setProductCreateForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "name" && !productCreateKeyTouched) {
        next.matrixKey = slugifyMatrixKey(value);
      }

      return next;
    });

    if (key === "matrixKey") {
      setProductCreateKeyTouched(true);
    }
  }

  function updateColumnCreateForm(key, value) {
    setColumnCreateForm((current) => {
      const next = { ...current, [key]: value };

      if ((key === "supplier" || key === "range") && !columnCreateKeyTouched) {
        next.matrixKey = slugifyColumnMatrixKey(
          key === "supplier" ? value : current.supplier,
          key === "range" ? value : current.range,
        );
      }

      return next;
    });

    if (key === "matrixKey") {
      setColumnCreateKeyTouched(true);
    }
  }

  function handleSelectProduct(nextProductId) {
    setSelectedContext("product");
    setSelectedProductId(nextProductId);
    setSelectedRangeId("");
    setSelectedCell(null);
    setProductActionError("");
    setProductActionSuccess("");
    setCellActionError("");
    setCellActionSuccess("");
  }

  function handleSelectCell(nextCell) {
    if (!nextCell?.productRecordId || !nextCell?.columnRecordId) return;
    setSelectedContext("cell");
    setSelectedProductId("");
    setSelectedRangeId("");
    setSelectedCell(nextCell);
    setCellActionError("");
    setCellActionSuccess("");
    setProductActionError("");
    setProductActionSuccess("");
  }

  function handleSelectColumn(nextColumnRecordId) {
    if (!nextColumnRecordId) return;
    setSelectedContext("range");
    setSelectedRangeId(nextColumnRecordId);
    setSelectedProductId("");
    setSelectedCell(null);
    setCellActionError("");
    setCellActionSuccess("");
    setProductActionError("");
    setProductActionSuccess("");
  }

  function updateCellForm(key, value) {
    setCellForm((current) => ({ ...current, [key]: value }));
  }

  function openArchiveProductConfirm() {
    if (!selectedProductIsDraftEditable || savingProduct || archivingProduct) return;
    setArchiveReason("");
    setProductArchiveError("");
    setProductArchiveConfirmOpen(true);
  }

  function closeArchiveProductConfirm() {
    if (archivingProduct) return;
    setProductArchiveConfirmOpen(false);
    setArchiveReason("");
    setProductArchiveError("");
  }

  function openArchiveColumnConfirm() {
    const targetColumn = selectedContext === "range" ? selectedRange : selectedColumnFromCell;
    if (!selectedColumnIsDraftEditable || !targetColumn || savingCell || archivingColumn) return;
    setColumnArchiveReason("");
    setColumnArchiveError("");
    setColumnArchiveTargetId(targetColumn.recordId || "");
    setColumnArchiveConfirmOpen(true);
  }

  function openArchivedRestoreConfirm(type, item) {
    if (!canRestoreArchivedItems || !item?.id || !selectedPriceList) return;
    setArchivedRestoreTarget({ type, item });
    setArchivedRestoreReason("");
    setArchivedRestoreError("");
    setArchivedRestoreConfirmOpen(true);
  }

  function closeArchivedRestoreConfirm() {
    if (restoringArchivedItem) return;
    setArchivedRestoreConfirmOpen(false);
    setArchivedRestoreTarget(null);
    setArchivedRestoreReason("");
    setArchivedRestoreError("");
  }

  function closeArchiveColumnConfirm() {
    if (archivingColumn) return;
    setColumnArchiveConfirmOpen(false);
    setColumnArchiveTargetId("");
    setColumnArchiveReason("");
    setColumnArchiveError("");
  }

  function openPublishModal() {
    if (!canPublishSelectedList || publishing) return;
    setPublishActionError("");
    setPublishActionSuccess("");
    setPublishModalOpen(true);
  }

  function closePublishModal() {
    if (publishing) return;
    setPublishModalOpen(false);
  }

  async function confirmPublishDraft(event) {
    event.preventDefault();

    if (!isAdmin) {
      setPublishActionError("Only admins can publish draft price lists.");
      return;
    }

    if (!selectedPriceList) {
      setPublishActionError("Select a draft price list before publishing.");
      return;
    }

    if (!isDraftList(selectedPriceList) || selectedPriceList.is_active) {
      setPublishActionError("Only inactive draft price lists can be published.");
      return;
    }

    if (publishing) return;

    setPublishing(true);
    setPublishActionError("");
    setPublishActionSuccess("");

    try {
      const { data, error } = await supabase.rpc("publish_price_list_admin", {
        p_price_list_id: selectedPriceList.id,
        p_reason: toOptionalText(publishReason),
      });

      if (error) throw error;

      const publishedVersion =
        data?.published?.version || selectedPriceList.version || "Selected draft";

      await Promise.all([
        loadPriceLists({ preferredSelectionId: selectedPriceList.id }),
        loadSelectedMatrix(),
        loadSelectedAudit({ priceListId: selectedPriceList.id }),
      ]);

      setPublishModalOpen(false);
      setPublishReason("");
      setPublishActionError("");
      setPublishActionSuccess(`${publishedVersion} is now live on staff Prices.`);
    } catch (error) {
      console.error("prices admin: failed to publish draft", error);
      setPublishActionError(error?.message || "Could not publish the selected draft.");
    } finally {
      setPublishing(false);
    }
  }

  async function saveSelectedProduct(event) {
    event.preventDefault();
    if (!canEditSelectedProduct || savingProduct || !selectedProduct) return;
    if (productValidationHints.length > 0) {
      setProductActionError(productValidationHints[0]);
      setProductActionSuccess("");
      return;
    }

    setSavingProduct(true);
    setProductActionError("");
    setProductActionSuccess("");

    try {
      const { error } = await supabase.rpc("update_price_product_admin", {
        p_product_id: selectedProduct.recordId,
        p_name: productForm.name,
        p_cloth_required: toOptionalText(productForm.clothRequired),
        p_cmt_price: parseOptionalNumber(productForm.cmtPrice),
        p_delivery_weeks_min: parseOptionalInteger(productForm.deliveryWeeksMin),
        p_delivery_weeks_max: parseOptionalInteger(productForm.deliveryWeeksMax),
        p_notes: toOptionalText(productForm.notes),
        p_reason: toOptionalText(productForm.reason),
      });

      if (error) throw error;

      await loadSelectedMatrix();
      refreshAuditAfterSuccess();
      setProductActionSuccess("Product details saved to this draft.");
    } catch (error) {
      console.error("prices admin: failed to update product", error);
      setProductActionError(
        error?.message || "Could not update the selected draft product.",
      );
    } finally {
      setSavingProduct(false);
    }
  }

  async function createProduct(event) {
    event.preventDefault();
    if (!canManageProducts || creatingProduct || !selectedPriceList) return;
    if (createProductValidationHints.length > 0) {
      setProductCreateError(createProductValidationHints[0]);
      setProductCreateSuccess("");
      return;
    }

    setCreatingProduct(true);
    setProductCreateError("");
    setProductCreateSuccess("");
    setProductArchiveError("");

    try {
      const { data, error } = await supabase.rpc("create_price_product_admin", {
        p_price_list_id: selectedPriceList.id,
        p_section_id: productCreateForm.sectionId,
        p_matrix_key: productCreateForm.matrixKey.trim(),
        p_name: productCreateForm.name.trim(),
        p_cloth_required: toOptionalText(productCreateForm.clothRequired),
        p_cmt_price: parseOptionalNumber(productCreateForm.cmtPrice),
        p_delivery_weeks_min: parseOptionalInteger(productCreateForm.deliveryWeeksMin),
        p_delivery_weeks_max: parseOptionalInteger(productCreateForm.deliveryWeeksMax),
        p_notes: toOptionalText(productCreateForm.notes),
        p_sort_order: parseOptionalInteger(productCreateForm.sortOrder),
        p_reason: toOptionalText(productCreateForm.reason),
      });

      if (error) throw error;

      const createdProduct = Array.isArray(data) ? data[0] || null : data || null;
      const createdProductId = createdProduct?.id ? String(createdProduct.id) : "";

      setSelectedCell(null);
      if (createdProductId) {
        setSelectedProductId(createdProductId);
      }

      await Promise.all([
        loadPriceLists({ preferredSelectionId: selectedPriceList.id }),
        loadSelectedMatrix(),
      ]);
      refreshAuditAfterSuccess(selectedPriceList.id);

      setProductCreateOpen(false);
      setProductCreateKeyTouched(false);
      setProductCreateForm(buildCreateProductFormState(null, null));
      setProductCreateSuccess("Product added to this draft.");
    } catch (error) {
      console.error("prices admin: failed to create product", error);
      setProductCreateError(error?.message || "Could not add a product to this draft.");
    } finally {
      setCreatingProduct(false);
    }
  }

  async function createColumn(event) {
    event.preventDefault();
    if (!canManageColumns || creatingColumn || !selectedPriceList) return;
    if (createColumnValidationHints.length > 0) {
      setColumnCreateError(createColumnValidationHints[0]);
      setColumnCreateSuccess("");
      return;
    }

    setCreatingColumn(true);
    setColumnCreateError("");
    setColumnCreateSuccess("");
    setColumnArchiveError("");

    try {
      const { error } = await supabase.rpc("create_price_matrix_column_admin", {
        p_price_list_id: selectedPriceList.id,
        p_matrix_key: columnCreateForm.matrixKey.trim(),
        p_supplier: columnCreateForm.supplier.trim(),
        p_range: columnCreateForm.range.trim(),
        p_width: toOptionalText(columnCreateForm.width),
        p_weight: toOptionalText(columnCreateForm.weight),
        p_supplier_sort_order: parseOptionalInteger(columnCreateForm.supplierSortOrder),
        p_sort_order: parseOptionalInteger(columnCreateForm.sortOrder),
        p_reason: toOptionalText(columnCreateForm.reason),
      });

      if (error) throw error;

      await Promise.all([
        loadPriceLists({ preferredSelectionId: selectedPriceList.id }),
        loadSelectedMatrix(),
      ]);
      refreshAuditAfterSuccess(selectedPriceList.id);

      setColumnCreateOpen(false);
      setColumnCreateKeyTouched(false);
      setColumnCreateForm(buildCreateColumnFormState());
      setColumnCreateSuccess("Column added to this draft.");
    } catch (error) {
      console.error("prices admin: failed to create column", error);
      setColumnCreateError(error?.message || "Could not add a column to this draft.");
    } finally {
      setCreatingColumn(false);
    }
  }

  async function archiveSelectedProduct(event) {
    event.preventDefault();
    if (!selectedProductIsDraftEditable || archivingProduct || !selectedPriceList) {
      return;
    }

    setArchivingProduct(true);
    setProductArchiveError("");
    setProductCreateSuccess("");

    try {
      const { error } = await supabase.rpc("set_price_product_active_admin", {
        p_product_id: selectedProduct.recordId,
        p_is_active: false,
        p_reason: toOptionalText(archiveReason),
      });

      if (error) throw error;

      setProductArchiveConfirmOpen(false);
      setArchiveReason("");
      setSelectedProductId("");
      setSelectedCell(null);
      setCellForm(buildCellFormState(null));
      setProductForm(buildProductFormState(null));

      await Promise.all([
        loadPriceLists({ preferredSelectionId: selectedPriceList.id }),
        loadSelectedMatrix(),
      ]);
      refreshAuditAfterSuccess(selectedPriceList.id);

      setProductCreateSuccess("Product archived from this draft.");
    } catch (error) {
      console.error("prices admin: failed to archive product", error);
      setProductArchiveError(
        error?.message || "Could not archive the selected draft product.",
      );
    } finally {
      setArchivingProduct(false);
    }
  }

  async function archiveSelectedColumn(event) {
    event.preventDefault();
    if (
      !selectedColumnIsDraftEditable ||
      archivingColumn ||
      !selectedPriceList ||
      !columnArchiveTarget
    ) {
      return;
    }

    setArchivingColumn(true);
    setColumnArchiveError("");
    setColumnCreateSuccess("");

    try {
      const { error } = await supabase.rpc("set_price_matrix_column_active_admin", {
        p_column_id: columnArchiveTarget.recordId,
        p_is_active: false,
        p_reason: toOptionalText(columnArchiveReason),
      });

      if (error) throw error;

      setColumnArchiveConfirmOpen(false);
      setColumnArchiveTargetId("");
      setColumnArchiveReason("");
      setSelectedContext("none");
      setSelectedRangeId("");
      setSelectedCell(null);
      setSelectedProductId("");
      setCellForm(buildCellFormState(null));

      await Promise.all([
        loadPriceLists({ preferredSelectionId: selectedPriceList.id }),
        loadSelectedMatrix(),
      ]);
      refreshAuditAfterSuccess(selectedPriceList.id);

      setColumnCreateSuccess("Column archived from this draft.");
    } catch (error) {
      console.error("prices admin: failed to archive column", error);
      setColumnArchiveError(
        error?.message || "Could not archive the selected draft column.",
      );
    } finally {
      setArchivingColumn(false);
    }
  }

  async function restoreArchivedItem(event) {
    event.preventDefault();

    if (
      !canRestoreArchivedItems ||
      restoringArchivedItem ||
      !selectedPriceList ||
      !archivedRestoreTarget?.item?.id
    ) {
      return;
    }

    setRestoringArchivedItem(true);
    setArchivedRestoreError("");
    setArchivedRestoreSuccess("");

    const isProductRestore = archivedRestoreTarget.type === "product";
    const rpcName = isProductRestore
      ? "set_price_product_active_admin"
      : "set_price_matrix_column_active_admin";
    const rpcArgs = isProductRestore
      ? {
          p_product_id: archivedRestoreTarget.item.id,
          p_is_active: true,
          p_reason: toOptionalText(archivedRestoreReason),
        }
      : {
          p_column_id: archivedRestoreTarget.item.id,
          p_is_active: true,
          p_reason: toOptionalText(archivedRestoreReason),
        };

    try {
      const { error } = await supabase.rpc(rpcName, rpcArgs);

      if (error) throw error;

      await Promise.all([
        loadPriceLists({ preferredSelectionId: selectedPriceList.id }),
        loadSelectedMatrix(),
        loadArchivedItems({ priceListId: selectedPriceList.id }),
      ]);
      refreshAuditAfterSuccess(selectedPriceList.id);

      setArchivedItemsOpen(false);
      setArchivedItemsError("");
      setArchivedRestoreConfirmOpen(false);
      setArchivedRestoreTarget(null);
      setArchivedRestoreReason("");
      setArchivedRestoreError("");
      setArchivedRestoreSuccess(
        isProductRestore
          ? "Product restored to this draft."
          : "Column restored to this draft.",
      );
    } catch (error) {
      console.error("prices admin: failed to restore archived item", error);
      setArchivedRestoreError(
        error?.message ||
          (isProductRestore
            ? "Could not restore the selected archived product."
            : "Could not restore the selected archived column."),
      );
    } finally {
      setRestoringArchivedItem(false);
    }
  }

  async function saveSelectedCell(event) {
    event.preventDefault();
    if (
      !canEditSelectedCell ||
      savingCell ||
      !selectedCell?.productRecordId ||
      !selectedCell?.columnRecordId ||
      !selectedPriceList
    ) {
      return;
    }
    if (cellValidationHints.length > 0) {
      setCellActionError(cellValidationHints[0]);
      setCellActionSuccess("");
      return;
    }

    setSavingCell(true);
    setCellActionError("");
    setCellActionSuccess("");

    try {
      const rpcName = selectedCell.cellRecordId
        ? "update_price_cell_admin"
        : "upsert_price_cell_admin";
      const rpcArgs = selectedCell.cellRecordId
        ? {
            p_cell_id: selectedCell.cellRecordId,
            p_retail_price: parseOptionalNumber(cellForm.retailPrice),
            p_reason: toOptionalText(cellForm.reason),
          }
        : {
            p_price_list_id: selectedPriceList.id,
            p_product_id: selectedCell.productRecordId,
            p_column_id: selectedCell.columnRecordId,
            p_retail_price: parseOptionalNumber(cellForm.retailPrice),
            p_reason: toOptionalText(cellForm.reason),
          };

      const { error } = await supabase.rpc(rpcName, rpcArgs);

      if (error) throw error;

      await loadSelectedMatrix();
      refreshAuditAfterSuccess(selectedPriceList.id);
      setCellForm((current) => ({ ...current, reason: "" }));
      setCellActionSuccess("Retail price saved to this draft.");
    } catch (error) {
      console.error("prices admin: failed to update cell", error);
      setCellActionError(
        error?.message || "Could not update the selected draft retail price.",
      );
    } finally {
      setSavingCell(false);
    }
  }

  return (
    <section className="prices-admin-page">
      <header className="prices-admin-header">
        <div className="prices-admin-header__top">
          <div>
            <h2>Prices Admin</h2>
          </div>

          {isAdmin ? (
            <div className="prices-admin-header__actions">
              <button
                type="button"
                className="prices-admin-primary-button"
                onClick={openDraftForm}
                disabled={loadingLists || !activePriceList || creatingDraft}
              >
                Create draft from active
              </button>
            </div>
          ) : null}
        </div>

        {draftActionSuccess ? (
          <div className="prices-admin-feedback prices-admin-feedback--success">
            {draftActionSuccess}
          </div>
        ) : null}

        {isAdmin && draftFormOpen ? (
          <form className="prices-admin-draft-form" onSubmit={createDraftFromActive}>
            <div className="prices-admin-draft-form__header">
              <div>
                <span className="prices-admin-panel__eyebrow">Draft creation</span>
                <h3>Create draft from active</h3>
                <p>
                  This creates a draft copy from the active published price list.
                  Live staff prices stay unchanged.
                </p>
              </div>
              <div className="prices-admin-draft-form__active">
                {activePriceList ? (
                  <>
                    <strong>{activePriceList.version || "Active list"}</strong>
                    <span>{activePriceList.name || "Published price list"}</span>
                  </>
                ) : (
                  <span>No active list available</span>
                )}
              </div>
            </div>

            <div className="prices-admin-draft-form__grid">
              <label className="prices-admin-field">
                <span>Draft version</span>
                <input
                  value={draftVersion}
                  onChange={(event) => setDraftVersion(event.target.value)}
                  placeholder="2026-01-draft"
                  disabled={creatingDraft}
                />
              </label>

              <label className="prices-admin-field">
                <span>Draft name</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="January 2026 Draft"
                  disabled={creatingDraft}
                />
              </label>

              <label className="prices-admin-field prices-admin-field--full">
                <span>Reason / note</span>
                <textarea
                  value={draftReason}
                  onChange={(event) => setDraftReason(event.target.value)}
                  placeholder="Optional note for why this draft is being created."
                  rows={3}
                  disabled={creatingDraft}
                />
              </label>
            </div>

            {draftActionError ? (
              <div className="prices-admin-feedback prices-admin-feedback--error">
                {draftActionError}
              </div>
            ) : null}

            <div className="prices-admin-draft-form__footer">
              <button
                type="button"
                className="prices-admin-secondary-button"
                onClick={closeDraftForm}
                disabled={creatingDraft}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="prices-admin-primary-button"
                disabled={creatingDraft || !activePriceList}
              >
                {creatingDraft ? "Creating draft..." : "Confirm draft creation"}
              </button>
            </div>
          </form>
        ) : null}
      </header>

      {!loadingLists && !canView ? (
        <div className="prices-admin-state prices-admin-state--error">
          <strong>Access restricted</strong>
          <p>Only admin and manager staff can open the Prices admin preview.</p>
        </div>
      ) : null}

      {canView ? (
        <div className="prices-admin-layout">
          <aside className="prices-admin-panel prices-admin-panel--list">
            <div className="prices-admin-panel__header">
              <div>
                <span className="prices-admin-panel__eyebrow">Available Price Lists</span>
              </div>
            </div>

            {loadingLists ? (
              <div className="prices-admin-state">
                <strong>Loading price lists</strong>
                <p>Checking available HUB price versions and drafts.</p>
              </div>
            ) : null}

            {!loadingLists && listsError ? (
              <div className="prices-admin-state prices-admin-state--error">
                <strong>Could not load price lists</strong>
                <p>{listsError}</p>
              </div>
            ) : null}

            {!loadingLists && !listsError && priceLists.length === 0 ? (
              <div className="prices-admin-state">
                <strong>No price lists found</strong>
                <p>No HUB price list versions are available to preview yet.</p>
              </div>
            ) : null}

            {!loadingLists && !listsError && priceLists.length > 0 ? (
              <div className="prices-admin-list">
                {activePriceList ? (
                  <section className="prices-admin-list-section">
                    <div className="prices-admin-list-section__header">
                      <h4>Active List</h4>
                    </div>
                    <PriceListCard
                      list={activePriceList}
                      eyebrow="Active list"
                      dateLabel={getHonestListDate(activePriceList, "active").label}
                      dateValue={getHonestListDate(activePriceList, "active").value}
                      isSelected={activePriceList.id === selectedPriceListId}
                      onSelect={() => setSelectedPriceListId(activePriceList.id)}
                    />
                  </section>
                ) : null}

                <section className="prices-admin-list-section">
                  <div className="prices-admin-list-section__header">
                    <h4>Current Draft</h4>
                  </div>
                  {currentDraftList ? (
                    <PriceListCard
                      list={currentDraftList}
                      eyebrow="Current draft"
                      dateLabel={getHonestListDate(currentDraftList, "draft").label}
                      dateValue={getHonestListDate(currentDraftList, "draft").value}
                      isSelected={currentDraftList.id === selectedPriceListId}
                      onSelect={() => setSelectedPriceListId(currentDraftList.id)}
                    />
                  ) : (
                    <div className="prices-admin-state">
                      <strong>No current draft</strong>
                    </div>
                  )}
                </section>

                <section className="prices-admin-list-section">
                  <button
                    type="button"
                    className="prices-admin-list-section__toggle"
                    onClick={() => setInactiveListsExpanded((current) => !current)}
                  >
                    <h4>Inactive Lists</h4>
                    <span
                      className={`prices-admin-list-section__chevron ${
                        inactiveListsExpanded ? "is-open" : ""
                      }`}
                      aria-hidden="true"
                    >
                      v
                    </span>
                  </button>
                  {inactiveListsExpanded ? (
                    inactiveLists.length > 0 ? (
                      <div className="prices-admin-list-section__stack">
                        {inactiveLists.map((list) => (
                          <PriceListCard
                            key={list.id}
                            list={list}
                            eyebrow="Inactive list"
                            dateLabel={getHonestListDate(list, "inactive").label}
                            dateValue={getHonestListDate(list, "inactive").value}
                            isSelected={list.id === selectedPriceListId}
                            onSelect={() => setSelectedPriceListId(list.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="prices-admin-state">
                        <strong>No inactive lists</strong>
                      </div>
                    )
                  ) : null}
                </section>
              </div>
            ) : null}
          </aside>

          <section className="prices-admin-panel prices-admin-panel--preview">
            <div className="prices-admin-panel__header">
              <div>
                <span className="prices-admin-panel__eyebrow">Selected Price List</span>
              </div>
            </div>

            {loadingMatrix ? (
              <div className="prices-admin-state">
                <strong>Loading matrix preview</strong>
                <p>Fetching the selected version and assembling its matrix.</p>
              </div>
            ) : null}

            {!loadingMatrix && matrixError ? (
              <div className="prices-admin-state prices-admin-state--error">
                <strong>Could not load matrix preview</strong>
                <p>{matrixError}</p>
              </div>
            ) : null}

            {!loadingMatrix && !matrixError && !selectedPriceListId ? (
              <div className="prices-admin-state">
                <strong>Select a price list</strong>
                <p>Choose a version or draft to open its read-only matrix preview.</p>
              </div>
            ) : null}

            {!loadingMatrix && !matrixError && matrixData ? (
              <>
                {publishModalOpen && selectedPriceList ? (
                  <div
                    className="prices-admin-modal-backdrop"
                    role="presentation"
                    onClick={closePublishModal}
                  >
                    <div
                      className="prices-admin-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="prices-admin-publish-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <form
                        className="prices-admin-modal__content"
                        onSubmit={confirmPublishDraft}
                      >
                        <div className="prices-admin-modal__header">
                          <div>
                            <span className="prices-admin-panel__eyebrow">
                              Publish draft
                            </span>
                            <h3 id="prices-admin-publish-title">Publish to live Prices</h3>
                            <p>
                              This will replace the live staff Prices matrix. Staff
                              using /prices will see this draft after publishing.
                            </p>
                          </div>
                        </div>

                        <div className="prices-admin-modal__summary">
                          <div className="prices-admin-status-card">
                            <span>Draft version</span>
                            <strong>{selectedPriceList.version || "No version"}</strong>
                            <small>{selectedPriceList.name || "Unnamed price list"}</small>
                          </div>

                          <div className="prices-admin-status-card">
                            <span>Draft status</span>
                            <strong>{formatStatus(selectedPriceList.status)}</strong>
                            <small>
                              {selectedPriceList.is_active
                                ? "Already active"
                                : "Ready to publish"}
                            </small>
                          </div>

                          <div className="prices-admin-status-card prices-admin-status-card--full">
                            <span>Replacing live list</span>
                            <strong>
                              {activePriceList?.version || "No active list found"}
                            </strong>
                            <small>
                              {activePriceList?.name || "The current live staff price list"}
                            </small>
                          </div>
                        </div>

                        <label className="prices-admin-field">
                          <span>Reason / note for audit</span>
                          <textarea
                            rows={3}
                            value={publishReason}
                            onChange={(event) => setPublishReason(event.target.value)}
                            placeholder="Optional note for why this draft is going live."
                            disabled={publishing}
                          />
                        </label>

                        {publishActionError ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {publishActionError}
                          </div>
                        ) : null}

                        <div className="prices-admin-modal__footer">
                          <button
                            type="button"
                            className="prices-admin-secondary-button"
                            onClick={closePublishModal}
                            disabled={publishing}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="prices-admin-warning-button"
                            disabled={publishing}
                          >
                            {publishing ? "Publishing..." : "Publish to live Prices"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : null}

                {columnCreateOpen ? (
                  <div
                    className="prices-admin-modal-backdrop"
                    role="presentation"
                    onClick={closeColumnCreate}
                  >
                    <div
                      className="prices-admin-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="prices-admin-column-create-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <form className="prices-admin-modal__content" onSubmit={createColumn}>
                        <div className="prices-admin-modal__header">
                          <div>
                            <span className="prices-admin-panel__eyebrow">
                              Draft column
                            </span>
                            <h3 id="prices-admin-column-create-title">Add column</h3>
                            <p>
                              This adds a column to the selected draft matrix only.
                              Live staff prices stay unchanged until a draft is published.
                            </p>
                          </div>
                        </div>

                        <div className="prices-admin-modal__summary">
                          <div className="prices-admin-status-card">
                            <span>Selected draft</span>
                            <strong>{selectedPriceList?.version || "No version"}</strong>
                            <small>{selectedPriceList?.name || "Unnamed price list"}</small>
                          </div>

                          <div className="prices-admin-status-card">
                            <span>Current columns</span>
                            <strong>{matrixModel.columns?.length || 0}</strong>
                            <small>New columns start empty and use sparse pricing.</small>
                          </div>
                        </div>

                        <div className="prices-admin-modal-form-grid">
                          <label className="prices-admin-field">
                            <span>Supplier</span>
                            <input
                              value={columnCreateForm.supplier}
                              onChange={(event) =>
                                updateColumnCreateForm("supplier", event.target.value)
                              }
                              placeholder="Lochcarron"
                              disabled={creatingColumn}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Range</span>
                            <input
                              value={columnCreateForm.range}
                              onChange={(event) =>
                                updateColumnCreateForm("range", event.target.value)
                              }
                              placeholder="Reiver"
                              disabled={creatingColumn}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Matrix key</span>
                            <input
                              value={columnCreateForm.matrixKey}
                              onChange={(event) =>
                                updateColumnCreateForm("matrixKey", event.target.value)
                              }
                              placeholder="lochcarron-reiver"
                              disabled={creatingColumn}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Width</span>
                            <input
                              value={columnCreateForm.width}
                              onChange={(event) =>
                                updateColumnCreateForm("width", event.target.value)
                              }
                              placeholder="DW"
                              disabled={creatingColumn}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Weight</span>
                            <input
                              value={columnCreateForm.weight}
                              onChange={(event) =>
                                updateColumnCreateForm("weight", event.target.value)
                              }
                              placeholder="16"
                              disabled={creatingColumn}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Supplier sort order</span>
                            <input
                              type="number"
                              step="1"
                              value={columnCreateForm.supplierSortOrder}
                              onChange={(event) =>
                                updateColumnCreateForm(
                                  "supplierSortOrder",
                                  event.target.value,
                                )
                              }
                              placeholder="Optional"
                              disabled={creatingColumn}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Sort order</span>
                            <input
                              type="number"
                              step="1"
                              value={columnCreateForm.sortOrder}
                              onChange={(event) =>
                                updateColumnCreateForm("sortOrder", event.target.value)
                              }
                              placeholder="Optional"
                              disabled={creatingColumn}
                            />
                          </label>

                          <label className="prices-admin-field prices-admin-field--full">
                            <span>Reason / note for audit</span>
                            <textarea
                              rows={2}
                              value={columnCreateForm.reason}
                              onChange={(event) =>
                                updateColumnCreateForm("reason", event.target.value)
                              }
                              placeholder="Optional note for why this column is being added."
                              disabled={creatingColumn}
                            />
                          </label>
                        </div>

                        {columnCreateError ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {columnCreateError}
                          </div>
                        ) : createColumnValidationHints.length > 0 ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {createColumnValidationHints[0]}
                          </div>
                        ) : null}

                        <div className="prices-admin-modal__footer">
                          <button
                            type="button"
                            className="prices-admin-secondary-button"
                            onClick={closeColumnCreate}
                            disabled={creatingColumn}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="prices-admin-primary-button"
                            disabled={creatingColumn || createColumnValidationHints.length > 0}
                          >
                            {creatingColumn ? "Adding column..." : "Add column"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : null}

                {productCreateOpen ? (
                  <div
                    className="prices-admin-modal-backdrop"
                    role="presentation"
                    onClick={closeProductCreate}
                  >
                    <div
                      className="prices-admin-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="prices-admin-product-create-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <form className="prices-admin-modal__content" onSubmit={createProduct}>
                        <div className="prices-admin-modal__header">
                          <div>
                            <span className="prices-admin-panel__eyebrow">
                              Draft product
                            </span>
                            <h3 id="prices-admin-product-create-title">Add product</h3>
                            <p>
                              This adds a product row to the selected draft only.
                              Live staff prices stay unchanged until a draft is published.
                            </p>
                          </div>
                        </div>

                        <div className="prices-admin-modal__summary">
                          <div className="prices-admin-status-card">
                            <span>Selected draft</span>
                            <strong>{selectedPriceList?.version || "No version"}</strong>
                            <small>{selectedPriceList?.name || "Unnamed price list"}</small>
                          </div>

                          <div className="prices-admin-status-card">
                            <span>Available sections</span>
                            <strong>{draftSections.length}</strong>
                            <small>Products must be added to an existing section.</small>
                          </div>
                        </div>

                        <div className="prices-admin-modal-form-grid">
                          <label className="prices-admin-field">
                            <span>Section</span>
                            <select
                              value={productCreateForm.sectionId}
                              onChange={(event) =>
                                updateProductCreateForm("sectionId", event.target.value)
                              }
                              disabled={creatingProduct}
                            >
                              <option value="">Select a section</option>
                              {draftSections.map((section) => (
                                <option key={section.id} value={section.id}>
                                  {section.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="prices-admin-field">
                            <span>Product name</span>
                            <input
                              value={productCreateForm.name}
                              onChange={(event) =>
                                updateProductCreateForm("name", event.target.value)
                              }
                              placeholder="Full Kilt - 6 Yard"
                              disabled={creatingProduct}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Matrix key</span>
                            <input
                              value={productCreateForm.matrixKey}
                              onChange={(event) =>
                                updateProductCreateForm("matrixKey", event.target.value)
                              }
                              placeholder="full-kilt-6-yard"
                              disabled={creatingProduct}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Sort order</span>
                            <input
                              type="number"
                              step="1"
                              value={productCreateForm.sortOrder}
                              onChange={(event) =>
                                updateProductCreateForm("sortOrder", event.target.value)
                              }
                              placeholder="Optional"
                              disabled={creatingProduct}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Cloth required</span>
                            <input
                              value={productCreateForm.clothRequired}
                              onChange={(event) =>
                                updateProductCreateForm("clothRequired", event.target.value)
                              }
                              disabled={creatingProduct}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>CMT price</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={productCreateForm.cmtPrice}
                              onChange={(event) =>
                                updateProductCreateForm("cmtPrice", event.target.value)
                              }
                              disabled={creatingProduct}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Delivery weeks min</span>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={productCreateForm.deliveryWeeksMin}
                              onChange={(event) =>
                                updateProductCreateForm("deliveryWeeksMin", event.target.value)
                              }
                              disabled={creatingProduct}
                            />
                          </label>

                          <label className="prices-admin-field">
                            <span>Delivery weeks max</span>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={productCreateForm.deliveryWeeksMax}
                              onChange={(event) =>
                                updateProductCreateForm("deliveryWeeksMax", event.target.value)
                              }
                              disabled={creatingProduct}
                            />
                          </label>

                          <label className="prices-admin-field prices-admin-field--full">
                            <span>Notes</span>
                            <textarea
                              rows={3}
                              value={productCreateForm.notes}
                              onChange={(event) =>
                                updateProductCreateForm("notes", event.target.value)
                              }
                              disabled={creatingProduct}
                            />
                          </label>

                          <label className="prices-admin-field prices-admin-field--full">
                            <span>Reason / note for audit</span>
                            <textarea
                              rows={2}
                              value={productCreateForm.reason}
                              onChange={(event) =>
                                updateProductCreateForm("reason", event.target.value)
                              }
                              placeholder="Optional note for why this product is being added."
                              disabled={creatingProduct}
                            />
                          </label>
                        </div>

                        {productCreateError ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {productCreateError}
                          </div>
                        ) : createProductValidationHints.length > 0 ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {createProductValidationHints[0]}
                          </div>
                        ) : null}

                        <div className="prices-admin-modal__footer">
                          <button
                            type="button"
                            className="prices-admin-secondary-button"
                            onClick={closeProductCreate}
                            disabled={creatingProduct}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="prices-admin-primary-button"
                            disabled={
                              creatingProduct ||
                              draftSections.length === 0 ||
                              createProductValidationHints.length > 0
                            }
                          >
                            {creatingProduct ? "Adding product..." : "Add product"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : null}

                {archivedItemsOpen && selectedPriceList ? (
                  <div
                    className="prices-admin-modal-backdrop"
                    role="presentation"
                    onClick={closeArchivedItems}
                  >
                    <div
                      className="prices-admin-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="prices-admin-archived-items-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="prices-admin-modal__content">
                        <div className="prices-admin-modal__header">
                          <div>
                            <span className="prices-admin-panel__eyebrow">
                              Archived structure
                            </span>
                            <h3 id="prices-admin-archived-items-title">
                              Archived items
                            </h3>
                            <p>
                              Archived items are hidden from this draft matrix but
                              kept for history.
                            </p>
                            {!isAdmin ? (
                              <p>
                                Managers can review archived items but only admins
                                can restore them.
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="prices-admin-modal__summary">
                          <div className="prices-admin-summary-card">
                            <span>Draft</span>
                            <strong>{selectedPriceList.version || "Selected draft"}</strong>
                            <small>{selectedPriceList.name || "Unnamed price list"}</small>
                          </div>
                          <div className="prices-admin-summary-card">
                            <span>Archived totals</span>
                            <strong>
                              {archivedProducts.length} products / {archivedColumns.length} columns
                            </strong>
                            <small>Restore returns items to this draft only.</small>
                          </div>
                        </div>

                        {archivedItemsError ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {archivedItemsError}
                          </div>
                        ) : null}

                        {loadingArchivedItems ? (
                          <div className="prices-admin-state">
                            <strong>Loading archived items...</strong>
                          </div>
                        ) : null}

                        {!loadingArchivedItems &&
                        !archivedItemsError &&
                        archivedProducts.length === 0 &&
                        archivedColumns.length === 0 ? (
                          <div className="prices-admin-state">
                            <strong>No archived products or columns for this draft.</strong>
                          </div>
                        ) : null}

                        {!loadingArchivedItems &&
                        !archivedItemsError &&
                        (archivedProducts.length > 0 || archivedColumns.length > 0) ? (
                          <div className="prices-admin-archived-browser">
                            <section className="prices-admin-archived-browser__section">
                              <div className="prices-admin-archived-browser__section-header">
                                <div>
                                  <span className="prices-admin-panel__eyebrow">
                                    Archived products
                                  </span>
                                  <h4>Products</h4>
                                </div>
                                <span className="prices-admin-badge">
                                  {formatCount(archivedProducts.length, "items")}
                                </span>
                              </div>

                              {archivedProducts.length === 0 ? (
                                <div className="prices-admin-product-detail__helper">
                                  No archived products for this draft.
                                </div>
                              ) : (
                                <div className="prices-admin-archived-browser__list">
                                  {archivedProducts.map((product) => {
                                    const deliveryWindow =
                                      formatArchivedDeliveryWindow(product);

                                    return (
                                      <article
                                        key={`archived-product:${product.id}`}
                                        className="prices-admin-archived-browser__item"
                                      >
                                        <div className="prices-admin-archived-browser__item-copy">
                                          <div className="prices-admin-archived-browser__item-top">
                                            <strong>{product.name || "Archived product"}</strong>
                                            <span>{product.section_name || "Unassigned section"}</span>
                                          </div>
                                          <div className="prices-admin-archived-browser__meta">
                                            <span>Key: {product.matrix_key || product.id}</span>
                                            <span>
                                              Sort: {Number.isFinite(product.sort_order) ? product.sort_order : "-"}
                                            </span>
                                            {product.cloth_required ? (
                                              <span>Cloth: {product.cloth_required}</span>
                                            ) : null}
                                            {Number.isFinite(Number(product.cmt_price)) ? (
                                              <span>CMT: {gbp.format(Number(product.cmt_price))}</span>
                                            ) : null}
                                            {deliveryWindow ? (
                                              <span>Delivery: {deliveryWindow}</span>
                                            ) : null}
                                            {product.updated_at ? (
                                              <span>Updated: {formatDateTime(product.updated_at)}</span>
                                            ) : null}
                                          </div>
                                          {product.notes ? (
                                            <p className="prices-admin-archived-browser__notes">
                                              {product.notes}
                                            </p>
                                          ) : null}
                                        </div>
                                        <div className="prices-admin-archived-browser__actions">
                                          <button
                                            type="button"
                                            className="prices-admin-secondary-button"
                                            onClick={() =>
                                              openArchivedRestoreConfirm("product", product)
                                            }
                                            disabled={!canRestoreArchivedItems}
                                          >
                                            Restore
                                          </button>
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                            </section>

                            <section className="prices-admin-archived-browser__section">
                              <div className="prices-admin-archived-browser__section-header">
                                <div>
                                  <span className="prices-admin-panel__eyebrow">
                                    Archived columns
                                  </span>
                                  <h4>Columns</h4>
                                </div>
                                <span className="prices-admin-badge">
                                  {formatCount(archivedColumns.length, "items")}
                                </span>
                              </div>

                              {archivedColumns.length === 0 ? (
                                <div className="prices-admin-product-detail__helper">
                                  No archived columns for this draft.
                                </div>
                              ) : (
                                <div className="prices-admin-archived-browser__list">
                                  {archivedColumns.map((column) => {
                                    const mappingSummary =
                                      formatArchivedColumnMapping(column);

                                    return (
                                      <article
                                        key={`archived-column:${column.id}`}
                                        className="prices-admin-archived-browser__item"
                                      >
                                        <div className="prices-admin-archived-browser__item-copy">
                                          <div className="prices-admin-archived-browser__item-top">
                                            <strong>{column.supplier || "Archived column"}</strong>
                                            <span>{column.range || "Unnamed range"}</span>
                                          </div>
                                          <div className="prices-admin-archived-browser__meta">
                                            <span>Key: {column.matrix_key || column.id}</span>
                                            <span>
                                              Supplier sort: {Number.isFinite(column.supplier_sort_order) ? column.supplier_sort_order : "-"}
                                            </span>
                                            <span>
                                              Column sort: {Number.isFinite(column.sort_order) ? column.sort_order : "-"}
                                            </span>
                                            {column.width ? <span>Width: {column.width}</span> : null}
                                            {column.weight ? <span>Weight: {column.weight}</span> : null}
                                            {mappingSummary ? (
                                              <span>Mapping: {mappingSummary}</span>
                                            ) : null}
                                            {column.updated_at ? (
                                              <span>Updated: {formatDateTime(column.updated_at)}</span>
                                            ) : null}
                                          </div>
                                        </div>
                                        <div className="prices-admin-archived-browser__actions">
                                          <button
                                            type="button"
                                            className="prices-admin-secondary-button"
                                            onClick={() =>
                                              openArchivedRestoreConfirm("column", column)
                                            }
                                            disabled={!canRestoreArchivedItems}
                                          >
                                            Restore
                                          </button>
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                            </section>
                          </div>
                        ) : null}

                        <div className="prices-admin-modal__footer">
                          <button
                            type="button"
                            className="prices-admin-secondary-button"
                            onClick={() =>
                              loadArchivedItems({ priceListId: selectedPriceList.id })
                            }
                            disabled={loadingArchivedItems}
                          >
                            {loadingArchivedItems ? "Refreshing..." : "Refresh"}
                          </button>
                          <button
                            type="button"
                            className="prices-admin-secondary-button"
                            onClick={closeArchivedItems}
                            disabled={restoringArchivedItem}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {columnArchiveConfirmOpen && columnArchiveTarget ? (
                  <div
                    className="prices-admin-modal-backdrop"
                    role="presentation"
                    onClick={closeArchiveColumnConfirm}
                  >
                    <div
                      className="prices-admin-modal prices-admin-modal--compact"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="prices-admin-archive-column-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <form
                        className="prices-admin-modal__content"
                        onSubmit={archiveSelectedColumn}
                      >
                        <div className="prices-admin-modal__header">
                          <div>
                            <span className="prices-admin-panel__eyebrow">
                              Draft column
                            </span>
                            <h3 id="prices-admin-archive-column-title">
                              Archive column
                            </h3>
                            <p>
                              This will hide this column from the draft price matrix.
                              Existing prices, mapping links, history and audit records
                              will be kept.
                            </p>
                          </div>
                        </div>

                        <div className="prices-admin-status-card prices-admin-status-card--full">
                          <span>Selected column</span>
                          <strong>{columnArchiveTarget.supplier}</strong>
                          <small>{columnArchiveTarget.range || "Unnamed range"}</small>
                        </div>

                        <label className="prices-admin-field">
                          <span>Reason / note for audit</span>
                          <textarea
                            rows={3}
                            value={columnArchiveReason}
                            onChange={(event) => setColumnArchiveReason(event.target.value)}
                            placeholder="Optional note for why this column is being archived."
                            disabled={archivingColumn}
                          />
                        </label>

                        {columnArchiveError ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {columnArchiveError}
                          </div>
                        ) : null}

                        <div className="prices-admin-modal__footer">
                          <button
                            type="button"
                            className="prices-admin-secondary-button"
                            onClick={closeArchiveColumnConfirm}
                            disabled={archivingColumn}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="prices-admin-danger-button"
                            disabled={archivingColumn}
                          >
                            {archivingColumn ? "Archiving..." : "Archive column"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : null}

                {archivedRestoreConfirmOpen && archivedRestoreTarget ? (
                  <div
                    className="prices-admin-modal-backdrop"
                    role="presentation"
                    onClick={closeArchivedRestoreConfirm}
                  >
                    <div
                      className="prices-admin-modal prices-admin-modal--compact"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="prices-admin-restore-archived-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <form
                        className="prices-admin-modal__content"
                        onSubmit={restoreArchivedItem}
                      >
                        <div className="prices-admin-modal__header">
                          <div>
                            <span className="prices-admin-panel__eyebrow">
                              Restore archived item
                            </span>
                            <h3 id="prices-admin-restore-archived-title">
                              {archivedRestoreTarget.type === "product"
                                ? "Restore product"
                                : "Restore column"}
                            </h3>
                            <p>
                              {archivedRestoreTarget.type === "product"
                                ? "Restoring makes this product visible again in this draft matrix."
                                : "Restoring makes this column visible again in this draft matrix."}
                            </p>
                          </div>
                        </div>

                        <div className="prices-admin-modal__summary">
                          <div className="prices-admin-summary-card">
                            <span>
                              {archivedRestoreTarget.type === "product"
                                ? "Product"
                                : "Column"}
                            </span>
                            <strong>
                              {archivedRestoreTarget.type === "product"
                                ? archivedRestoreTarget.item.name || "Archived product"
                                : archivedRestoreTarget.item.supplier || "Archived column"}
                            </strong>
                            <small>
                              {archivedRestoreTarget.type === "product"
                                ? archivedRestoreTarget.item.section_name ||
                                  "Unassigned section"
                                : archivedRestoreTarget.item.range || "Unnamed range"}
                            </small>
                          </div>
                          <div className="prices-admin-summary-card">
                            <span>Matrix key</span>
                            <strong>
                              {archivedRestoreTarget.item.matrix_key ||
                                archivedRestoreTarget.item.id}
                            </strong>
                            <small>Restore returns this item to the selected draft only.</small>
                          </div>
                        </div>

                        <label className="prices-admin-field prices-admin-field--full">
                          <span>Reason / note for audit</span>
                          <textarea
                            rows={3}
                            value={archivedRestoreReason}
                            onChange={(event) =>
                              setArchivedRestoreReason(event.target.value)
                            }
                            placeholder="Optional note for why this archived item is being restored."
                          />
                        </label>

                        {archivedRestoreError ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {archivedRestoreError}
                          </div>
                        ) : null}

                        <div className="prices-admin-modal__footer">
                          <button
                            type="button"
                            className="prices-admin-secondary-button"
                            onClick={closeArchivedRestoreConfirm}
                            disabled={restoringArchivedItem}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="prices-admin-primary-button"
                            disabled={restoringArchivedItem}
                          >
                            {restoringArchivedItem ? "Restoring..." : "Restore"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : null}

                {productArchiveConfirmOpen && selectedProduct ? (
                  <div
                    className="prices-admin-modal-backdrop"
                    role="presentation"
                    onClick={closeArchiveProductConfirm}
                  >
                    <div
                      className="prices-admin-modal prices-admin-modal--compact"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="prices-admin-archive-product-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <form
                        className="prices-admin-modal__content"
                        onSubmit={archiveSelectedProduct}
                      >
                        <div className="prices-admin-modal__header">
                          <div>
                            <span className="prices-admin-panel__eyebrow">
                              Draft product
                            </span>
                            <h3 id="prices-admin-archive-product-title">
                              Archive product
                            </h3>
                            <p>
                              This will hide the product from this draft price matrix.
                              Existing price history and audit records will be kept.
                            </p>
                          </div>
                        </div>

                        <div className="prices-admin-status-card prices-admin-status-card--full">
                          <span>Selected product</span>
                          <strong>{selectedProduct.name}</strong>
                          <small>{selectedProduct.section || "Unassigned section"}</small>
                        </div>

                        <label className="prices-admin-field">
                          <span>Reason / note for audit</span>
                          <textarea
                            rows={3}
                            value={archiveReason}
                            onChange={(event) => setArchiveReason(event.target.value)}
                            placeholder="Optional note for why this product is being archived."
                            disabled={archivingProduct}
                          />
                        </label>

                        {productArchiveError ? (
                          <div className="prices-admin-feedback prices-admin-feedback--error">
                            {productArchiveError}
                          </div>
                        ) : null}

                        <div className="prices-admin-modal__footer">
                          <button
                            type="button"
                            className="prices-admin-secondary-button"
                            onClick={closeArchiveProductConfirm}
                            disabled={archivingProduct}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="prices-admin-danger-button"
                            disabled={archivingProduct}
                          >
                            {archivingProduct ? "Archiving..." : "Archive product"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : null}

                <PriceMatrixPreview
                  matrixData={matrixData}
                  matrixModel={matrixModel}
                  selectedCellKey={selectedCellKey}
                  selectedCellProductId={selectedCell?.productRecordId || ""}
                  selectedCellColumnId={selectedCell?.columnRecordId || ""}
                  selectedProductId={selectedContext === "product" ? selectedProductId : ""}
                  selectedRangeId={selectedContext === "range" ? selectedRangeId : ""}
                  onSelectProduct={handleSelectProduct}
                  onSelectCell={handleSelectCell}
                  onSelectColumn={handleSelectColumn}
                />

                {(columnCreateSuccess || productCreateSuccess || archivedRestoreSuccess) ? (
                  <div className="prices-admin-feedback-stack">
                    {archivedRestoreSuccess ? (
                      <div className="prices-admin-feedback prices-admin-feedback--success">
                        {archivedRestoreSuccess}
                      </div>
                    ) : null}

                    {columnCreateSuccess ? (
                      <div className="prices-admin-feedback prices-admin-feedback--success">
                        {columnCreateSuccess}
                      </div>
                    ) : null}

                    {productCreateSuccess ? (
                      <div className="prices-admin-feedback prices-admin-feedback--success">
                        {productCreateSuccess}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <section className="prices-admin-selection-workspace">
                  <div className="prices-admin-selection-workspace__header">
                    <span className="prices-admin-panel__eyebrow">Selection workspace</span>
                  </div>

                  <div className="prices-admin-selection-grid prices-admin-selection-grid--single">
                    {selectedContext === "none" ? (
                      <section className="prices-admin-product-panel">
                        <div className="prices-admin-state">
                          <strong>Select item</strong>
                          <p>
                            Click a row, price cell, or column header to open the
                            relevant editor for this selected price list.
                          </p>
                        </div>
                      </section>
                    ) : null}

                    {selectedContext === "product" && selectedProduct ? (
                      <section className="prices-admin-product-panel">
                        <form
                          className="prices-admin-product-detail"
                          onSubmit={saveSelectedProduct}
                        >
                          <div className="prices-admin-product-detail__header">
                            <div>
                              <span className="prices-admin-panel__eyebrow">
                                Selected product
                              </span>
                              <h3>{selectedProduct.name}</h3>
                            </div>
                            <div className="prices-admin-product-detail__badges">
                              <span className="prices-admin-badge prices-admin-badge--readonly">
                                {selectedProduct.id}
                              </span>
                              {selectedProductIsDraftEditable ? (
                                <span className="prices-admin-badge prices-admin-badge--draft">
                                  DRAFT EDIT
                                </span>
                              ) : (
                                <span className="prices-admin-badge prices-admin-badge--readonly">
                                  READ ONLY
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="prices-admin-product-detail__grid">
                            <label className="prices-admin-field">
                              <span>Name</span>
                              <input
                                value={productForm.name}
                                onChange={(event) =>
                                  updateProductForm("name", event.target.value)
                                }
                                readOnly={!canEditSelectedProduct}
                              />
                            </label>

                            <label className="prices-admin-field">
                              <span>Cloth required</span>
                              <input
                                value={productForm.clothRequired}
                                onChange={(event) =>
                                  updateProductForm("clothRequired", event.target.value)
                                }
                                readOnly={!canEditSelectedProduct}
                              />
                            </label>

                            <label className="prices-admin-field">
                              <span>CMT price</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={productForm.cmtPrice}
                                onChange={(event) =>
                                  updateProductForm("cmtPrice", event.target.value)
                                }
                                readOnly={!canEditSelectedProduct}
                              />
                            </label>

                            <label className="prices-admin-field">
                              <span>Delivery weeks min</span>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={productForm.deliveryWeeksMin}
                                onChange={(event) =>
                                  updateProductForm("deliveryWeeksMin", event.target.value)
                                }
                                readOnly={!canEditSelectedProduct}
                              />
                            </label>

                            <label className="prices-admin-field">
                              <span>Delivery weeks max</span>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={productForm.deliveryWeeksMax}
                                onChange={(event) =>
                                  updateProductForm("deliveryWeeksMax", event.target.value)
                                }
                                readOnly={!canEditSelectedProduct}
                              />
                            </label>

                            <label className="prices-admin-field prices-admin-field--full">
                              <span>Notes</span>
                              <textarea
                                rows={3}
                                value={productForm.notes}
                                onChange={(event) =>
                                  updateProductForm("notes", event.target.value)
                                }
                                readOnly={!canEditSelectedProduct}
                              />
                            </label>

                            <label className="prices-admin-field prices-admin-field--full">
                              <span>Reason / note for audit</span>
                              <textarea
                                rows={2}
                                value={productForm.reason}
                                onChange={(event) =>
                                  updateProductForm("reason", event.target.value)
                                }
                                readOnly={!canEditSelectedProduct}
                              />
                            </label>
                          </div>

                          {selectedProductIsDraftEditable ? (
                            <div className="prices-admin-product-detail__helper">
                              Optional blank fields preserve their current values.
                            </div>
                          ) : null}

                          {productValidationHints.length > 0 &&
                          selectedProductIsDraftEditable ? (
                            <div className="prices-admin-feedback prices-admin-feedback--error">
                              {productValidationHints[0]}
                            </div>
                          ) : null}

                          {productActionError ? (
                            <div className="prices-admin-feedback prices-admin-feedback--error">
                              {productActionError}
                            </div>
                          ) : null}

                          {productActionSuccess ? (
                            <div className="prices-admin-feedback prices-admin-feedback--success">
                              {productActionSuccess}
                            </div>
                          ) : null}

                          {selectedProductIsDraftEditable ? (
                            <div className="prices-admin-product-detail__footer">
                              <button
                                type="submit"
                                className="prices-admin-primary-button"
                                disabled={savingProduct || productValidationHints.length > 0}
                              >
                                {savingProduct
                                  ? "Saving product..."
                                  : "Save product details"}
                              </button>
                              <button
                                type="button"
                                className="prices-admin-danger-button"
                                onClick={openArchiveProductConfirm}
                                disabled={savingProduct || archivingProduct}
                              >
                                Archive product
                              </button>
                            </div>
                          ) : null}
                        </form>
                      </section>
                    ) : null}

                    {selectedContext === "cell" && selectedCell ? (
                      <section className="prices-admin-product-panel">
                        <form
                          className="prices-admin-product-detail"
                          onSubmit={saveSelectedCell}
                        >
                          <div className="prices-admin-product-detail__header">
                            <div>
                              <span className="prices-admin-panel__eyebrow">
                                Selected price cell
                              </span>
                              <h3>
                                {selectedCell.productName} / {selectedCell.columnLabel}
                              </h3>
                              <p>
                                {canEditSelectedCell
                                  ? "Review or update the selected draft retail price."
                                  : "Review the current retail price for this matrix intersection."}
                              </p>
                            </div>
                            <div className="prices-admin-product-detail__badges">
                              <span className="prices-admin-badge prices-admin-badge--readonly">
                                {selectedCell.columnPublicId}
                              </span>
                              {canEditSelectedCell ? (
                                <span className="prices-admin-badge prices-admin-badge--draft">
                                  DRAFT EDIT
                                </span>
                              ) : (
                                <span className="prices-admin-badge prices-admin-badge--readonly">
                                  READ ONLY
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="prices-admin-selection-context">
                            <div className="prices-admin-selection-context__item">
                              <span>Selected product</span>
                              <strong>{selectedCell.productName}</strong>
                            </div>
                            <div className="prices-admin-selection-context__item">
                              <span>Selected range</span>
                              <strong>{selectedCell.columnLabel}</strong>
                            </div>
                            <div className="prices-admin-selection-context__item">
                              <span>Price state</span>
                              <strong>
                                {selectedCell.cellRecordId
                                  ? "Existing price cell"
                                  : "First sparse price"}
                              </strong>
                            </div>
                          </div>

                          <div className="prices-admin-product-detail__grid">
                            <label className="prices-admin-field">
                              <span>Retail price</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={cellForm.retailPrice}
                                onChange={(event) =>
                                  updateCellForm("retailPrice", event.target.value)
                                }
                                readOnly={!canEditSelectedCell}
                              />
                            </label>

                            <label className="prices-admin-field">
                              <span>Current matrix value</span>
                              <input
                                value={
                                  selectedCell.retailPrice != null
                                    ? gbp.format(selectedCell.retailPrice)
                                    : "-"
                                }
                                readOnly
                                tabIndex={-1}
                              />
                            </label>

                            <label className="prices-admin-field prices-admin-field--full">
                              <span>Reason / note for audit</span>
                              <textarea
                                rows={2}
                                value={cellForm.reason}
                                onChange={(event) =>
                                  updateCellForm("reason", event.target.value)
                                }
                                readOnly={!canEditSelectedCell}
                              />
                            </label>
                          </div>

                          {!selectedCell.cellRecordId ? (
                            <div className="prices-admin-product-detail__helper">
                              {canEditSelectedCell
                                ? "Saving here will create the missing draft price cell for this product and column."
                                : "Cell record details are unavailable in this matrix payload, so this selection can only be reviewed read-only."}
                            </div>
                          ) : null}

                          {cellValidationHints.length > 0 && canEditSelectedCell ? (
                            <div className="prices-admin-feedback prices-admin-feedback--error">
                              {cellValidationHints[0]}
                            </div>
                          ) : null}

                          {cellActionError ? (
                            <div className="prices-admin-feedback prices-admin-feedback--error">
                              {cellActionError}
                            </div>
                          ) : null}

                          {cellActionSuccess ? (
                            <div className="prices-admin-feedback prices-admin-feedback--success">
                              {cellActionSuccess}
                            </div>
                          ) : null}

                          {canEditSelectedCell ? (
                            <div className="prices-admin-product-detail__footer">
                              <button
                                type="submit"
                                className="prices-admin-primary-button"
                                disabled={savingCell || cellValidationHints.length > 0}
                              >
                                {savingCell ? "Saving retail price..." : "Save retail price"}
                              </button>
                              {selectedColumnIsDraftEditable ? (
                                <button
                                  type="button"
                                  className="prices-admin-danger-button"
                                  onClick={openArchiveColumnConfirm}
                                  disabled={savingCell || archivingColumn}
                                >
                                  Archive column
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </form>
                      </section>
                    ) : null}

                    {selectedContext === "range" && selectedRange ? (
                      <section className="prices-admin-product-panel">
                        <div className="prices-admin-product-detail">
                          <div className="prices-admin-product-detail__header">
                            <div>
                              <span className="prices-admin-panel__eyebrow">
                                Selected range
                              </span>
                              <h3>{selectedRange.supplier} / {selectedRange.range}</h3>
                            </div>
                            <div className="prices-admin-product-detail__badges">
                              <span className="prices-admin-badge prices-admin-badge--readonly">
                                {selectedRange.publicId}
                              </span>
                              {selectedColumnIsDraftEditable ? (
                                <span className="prices-admin-badge prices-admin-badge--draft">
                                  DRAFT EDIT
                                </span>
                              ) : (
                                <span className="prices-admin-badge prices-admin-badge--readonly">
                                  READ ONLY
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="prices-admin-selection-context">
                            <div className="prices-admin-selection-context__item">
                              <span>Supplier</span>
                              <strong>{selectedRange.supplier}</strong>
                            </div>
                            <div className="prices-admin-selection-context__item">
                              <span>Range</span>
                              <strong>{selectedRange.range}</strong>
                            </div>
                            <div className="prices-admin-selection-context__item">
                              <span>Mapping</span>
                              <strong>
                                {Number.isFinite(selectedRange.external_weaver_id) ||
                                Number.isFinite(selectedRange.external_range_id)
                                  ? "Mapped"
                                  : "No tartan mapping"}
                              </strong>
                            </div>
                          </div>

                          <div className="prices-admin-product-detail__grid">
                            <label className="prices-admin-field">
                              <span>Width</span>
                              <input value={selectedRange.width || "-"} readOnly />
                            </label>
                            <label className="prices-admin-field">
                              <span>Weight</span>
                              <input value={selectedRange.weight || "-"} readOnly />
                            </label>
                          </div>

                          {selectedColumnIsDraftEditable ? (
                            <div className="prices-admin-product-detail__footer">
                              <button
                                type="button"
                                className="prices-admin-danger-button"
                                onClick={openArchiveColumnConfirm}
                                disabled={archivingColumn}
                              >
                                Archive column
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </section>

                <PriceStatusPanel
                  selectedList={selectedPriceList}
                  matrixData={matrixData}
                  matrixModel={matrixModel}
                  auditEntries={auditEntries}
                  auditError={auditError}
                  loadingAudit={loadingAudit}
                  isAdmin={isAdmin}
                  publishActionError={publishActionError}
                  publishActionSuccess={publishActionSuccess}
                  publishing={publishing}
                  canManageProducts={canManageProducts}
                  onOpenProductCreate={openProductCreate}
                  canManageColumns={canManageColumns}
                  canBrowseArchivedItems={canBrowseArchivedItems}
                  onOpenColumnCreate={openColumnCreate}
                  onOpenArchivedItems={openArchivedItems}
                  onOpenPublishModal={openPublishModal}
                />

                <PriceAuditPanel
                  selectedList={selectedPriceList}
                  loadingAudit={loadingAudit}
                  refreshingAudit={refreshingAudit}
                  auditError={auditError}
                  auditEntries={auditEntries}
                  lastAuditLoadedAt={lastAuditLoadedAt}
                  expanded={historyExpanded}
                  onToggleExpanded={() => setHistoryExpanded((current) => !current)}
                  onRefresh={() => loadSelectedAudit({ background: true })}
                />
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
