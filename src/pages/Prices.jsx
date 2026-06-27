import React from "react";
import {
  getPricesData,
  loadPriceColumnMappings,
  loadPricesData,
} from "../lib/pricesData";
import { invokeAuthed } from "../lib/invokeAuthed";
import "./Prices.css";

const categoryThemes = [
  {
    accent: "rgba(45, 212, 191, 0.82)",
    border: "rgba(45, 212, 191, 0.32)",
    fill: "rgba(45, 212, 191, 0.08)",
    strong: "rgba(45, 212, 191, 0.16)",
  },
  {
    accent: "rgba(96, 165, 250, 0.82)",
    border: "rgba(96, 165, 250, 0.3)",
    fill: "rgba(96, 165, 250, 0.08)",
    strong: "rgba(96, 165, 250, 0.16)",
  },
  {
    accent: "rgba(168, 85, 247, 0.82)",
    border: "rgba(168, 85, 247, 0.28)",
    fill: "rgba(168, 85, 247, 0.08)",
    strong: "rgba(168, 85, 247, 0.15)",
  },
  {
    accent: "rgba(251, 191, 36, 0.82)",
    border: "rgba(251, 191, 36, 0.3)",
    fill: "rgba(251, 191, 36, 0.08)",
    strong: "rgba(251, 191, 36, 0.16)",
  },
  {
    accent: "rgba(244, 114, 182, 0.82)",
    border: "rgba(244, 114, 182, 0.28)",
    fill: "rgba(244, 114, 182, 0.08)",
    strong: "rgba(244, 114, 182, 0.15)",
  },
];

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function formatDetailValue(value, fallback = "Not set") {
  if (value == null) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  return String(value);
}

function formatWeight(weight) {
  return typeof weight === "number" ? `${weight} oz` : String(weight);
}

function formatLookupRangeSummary(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) return "No mapped ranges";
  return ranges
    .map((range) => range.external_range_label || `Range ${range.external_range_id}`)
    .join(", ");
}

function getMappingDisplay(mappingSource, columnMapping) {
  if (mappingSource !== "supabase") {
    return {
      tone: "unavailable",
      summary: "Mapping unavailable",
      detail: null,
    };
  }

  if (!columnMapping || columnMapping.externalMappingCount < 1) {
    return {
      tone: "unmapped",
      summary: "Not mapped yet",
      detail: null,
    };
  }

  const labels = columnMapping.externalRanges
    .map((link) => link.externalRangeLabel || `Range ${link.externalRangeId}`)
    .filter(Boolean);

  return {
    tone: "connected",
    summary: "Connected",
    detail:
      labels.length > 1
        ? `External ranges: ${labels.join(", ")}`
        : `External range: ${labels[0] || `Range ${columnMapping.externalRangeId}`}`,
  };
}

function DetailPanel({
  product,
  column,
  version,
  columnMapping,
  mappingSource,
  onClose,
  isOpen,
  tartanLookupOpen,
  onToggleTartanLookup,
  tartanQuery,
  onTartanQueryChange,
  onTartanSearch,
  onTartanLoadMore,
  tartanSearchLoading,
  tartanSearchError,
  tartanResults,
  tartanMapping,
  tartanPagination,
  selectedTartanId,
  onSelectTartan,
}) {
  const hasContent = Boolean(isOpen && product && column);
  const value = hasContent ? product.prices[column.id] : null;
  const deliveryWindow = hasContent
    ? product.deliveryWeeksMin != null && product.deliveryWeeksMax != null
      ? `${product.deliveryWeeksMin}-${product.deliveryWeeksMax} weeks`
      : product.deliveryWeeksMin != null
        ? `${product.deliveryWeeksMin} weeks`
        : product.deliveryWeeksMax != null
          ? `${product.deliveryWeeksMax} weeks`
          : null
    : null;
  const mappingDisplay = getMappingDisplay(mappingSource, columnMapping);

  return (
    <aside
      className={`prices-detail prices-element ${isOpen ? "is-open" : "is-closed"}`}
      aria-label="Price details"
      aria-hidden={!isOpen}
    >
      {hasContent ? (
        <>
          <div className="prices-detail__actions">
            <PanelTitle kicker="Selected price" title={product.name} />
            <button
              type="button"
              className="prices-detail__close"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div className="prices-detail__hero">
            <div className="prices-detail__hero-block">
              <span className="prices-detail__hero-label">Retail price</span>
              <strong className="prices-detail__hero-value">
                {Number.isFinite(value) ? gbp.format(value) : "Unavailable"}
              </strong>
            </div>
            <div className="prices-detail__hero-block prices-detail__hero-block--meta">
              <span className="prices-detail__hero-label">Price list</span>
              <strong className="prices-detail__hero-meta">
                {formatDetailValue(version)}
              </strong>
            </div>
          </div>
          <DetailSection
            title="Selection"
            items={[
              ["Product", product.name],
              ["Category", product.section],
              ["Supplier", column.supplier],
              ["Range", column.range],
              ["Width", formatDetailValue(column.width)],
              ["Weight", formatDetailValue(formatWeight(column.weight))],
            ]}
          />
          <DetailSection
            title="Quote context"
            items={[
              ["Cloth required", formatDetailValue(product.clothRequired)],
              [
                "CMT price",
                product.cmtPrice != null ? gbp.format(product.cmtPrice) : "Not set",
              ],
              ["Delivery window", formatDetailValue(deliveryWindow)],
              ["Product notes", formatDetailValue(product.notes)],
            ]}
          />
          <DetailSection
            title="Tartan link"
            tone={mappingDisplay.tone}
            items={[
              ["Tartan link", mappingDisplay.summary],
              [
                "External link",
                mappingDisplay.detail || "Not set",
              ],
            ]}
          />
          <ActionSection
            title="Future tools"
            actions={[
              {
                label: "Generate quote email",
                disabled: true,
              },
              {
                label: tartanLookupOpen
                  ? "Hide tartan availability"
                  : "Check tartan availability",
                disabled: false,
                active: tartanLookupOpen,
                onClick: onToggleTartanLookup,
              },
              {
                label: "Supplier enquiry",
                disabled: true,
              },
            ]}
          />
          {tartanLookupOpen ? (
            <TartanLookupSection
              query={tartanQuery}
              onQueryChange={onTartanQueryChange}
              onSearch={onTartanSearch}
              onLoadMore={onTartanLoadMore}
              isLoading={tartanSearchLoading}
              error={tartanSearchError}
              results={tartanResults}
              mapping={tartanMapping}
              pagination={tartanPagination}
              selectedTartanId={selectedTartanId}
              onSelectTartan={onSelectTartan}
            />
          ) : null}
        </>
      ) : null}
    </aside>
  );
}

function PanelTitle({ kicker, title }) {
  return (
    <div className="prices-detail__title">
      <span>{kicker}</span>
      <h3>{title}</h3>
    </div>
  );
}

function DetailGrid({ items }) {
  return (
    <dl className="prices-detail-grid">
      {items.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt>{label}</dt>
          <dd className={value === "Not set" ? "is-muted" : ""}>{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function DetailSection({ title, items, tone = "default" }) {
  return (
    <section
      className={`prices-detail-section ${
        tone === "connected"
          ? "prices-detail-section--connected"
          : tone === "unmapped"
            ? "prices-detail-section--muted"
            : tone === "unavailable"
              ? "prices-detail-section--unavailable"
              : ""
      }`}
    >
      <h4>{title}</h4>
      <DetailGrid items={items} />
    </section>
  );
}

function ActionSection({ title, actions }) {
  return (
    <section className="prices-detail-section prices-detail-section--actions">
      <h4>{title}</h4>
      <div className="prices-detail-actions-grid">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`prices-detail-action ${
              action.disabled ? "" : "prices-detail-action--enabled"
            } ${action.active ? "prices-detail-action--active" : ""}`}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function TartanLookupSection({
  query,
  onQueryChange,
  onSearch,
  onLoadMore,
  isLoading,
  error,
  results,
  mapping,
  pagination,
  selectedTartanId,
  onSelectTartan,
  canSubmitSearch,
  helperText,
}) {
  const isNotMapped = mapping?.status === "not_mapped";
  const hasResults = Array.isArray(results) && results.length > 0;
  const hasSearched =
    Boolean(mapping) || Boolean(error) || isLoading || hasResults;
  const mappedRanges = Array.isArray(mapping?.ranges) ? mapping.ranges : [];
  const isMultiRange = mappedRanges.length > 1;
  const trimmedQuery = query.trim();

  return (
    <section className="prices-detail-section prices-detail-section--lookup">
      <div className="prices-detail-section__header">
        <h4>Tartan availability</h4>
        {mapping?.status === "mapped" ? (
          <span className="prices-lookup-status">
            {isMultiRange ? "Mapped multi-range" : "Mapped single-range"}
          </span>
        ) : null}
      </div>

      <form className="prices-lookup-form" onSubmit={onSearch}>
        <label className="prices-lookup-form__field">
          <span>Search tartans</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name, clan, or variation"
          />
        </label>
        <button
          type="submit"
          className="prices-lookup-form__submit"
          disabled={!canSubmitSearch || isLoading}
        >
          {isLoading ? "Searching..." : "Search"}
        </button>
      </form>

      <p className="prices-lookup-helper">{helperText}</p>

      {error ? <p className="prices-lookup-banner is-error">{error}</p> : null}

      {isNotMapped ? (
        <div className="prices-lookup-banner is-info">
          This range is not mapped to the tartan database yet.
        </div>
      ) : null}

      {mapping?.status === "mapped" ? (
        <div className="prices-lookup-summary">
          <p>
            {isMultiRange ? "Linked ranges" : "Linked range"}:{" "}
            {formatLookupRangeSummary(mappedRanges)}
          </p>
        </div>
      ) : null}

      {isLoading && !hasResults ? (
        <p className="prices-lookup-state">Searching the tartan catalogue...</p>
      ) : null}

      {!error &&
      !isNotMapped &&
      mapping?.status === "mapped" &&
      !hasResults &&
      !isLoading ? (
        <p className="prices-lookup-state">
          No tartans matched this search for the mapped range.
        </p>
      ) : null}

      {!hasSearched && !isNotMapped ? (
        <p className="prices-lookup-state">
          {trimmedQuery.length > 0 && trimmedQuery.length < 3
            ? "Keep typing - tartan search starts after 3 characters."
            : "Type at least 3 characters to search tartans, or run a blank lookup to browse this mapped range."}
        </p>
      ) : null}

      {hasResults ? (
        <div className="prices-tartan-results">
          {results.map((result) => {
            const imageUrl = result.image_url || result.backup_url || "";
            const isSelected = selectedTartanId === result.tartan_id;
            return (
              <button
                key={result.tartan_id}
                type="button"
                className={`prices-tartan-card ${isSelected ? "is-selected" : ""}`}
                onClick={() => onSelectTartan(result.tartan_id)}
              >
                <div className="prices-tartan-card__media">
                  {imageUrl ? (
                    <img src={imageUrl} alt={result.name} />
                  ) : (
                    <div className="prices-tartan-card__placeholder">
                      No image
                    </div>
                  )}
                </div>
                <div className="prices-tartan-card__content">
                  <div className="prices-tartan-card__heading">
                    <div className="prices-tartan-card__title-block">
                      <strong>{result.name}</strong>
                      {result.clan ? (
                        <p className="prices-tartan-card__clan">{result.clan}</p>
                      ) : null}
                    </div>
                    {isSelected ? (
                      <span className="prices-tartan-card__selected">
                        Selected
                      </span>
                    ) : null}
                  </div>
                  {result.variation ? (
                    <p className="prices-tartan-card__variation">
                      {result.variation}
                    </p>
                  ) : null}
                  <dl className="prices-tartan-card__meta">
                    <div>
                      <dt>Weaver</dt>
                      <dd>{formatDetailValue(result.weaver)}</dd>
                    </div>
                    <div>
                      <dt>Range</dt>
                      <dd>{formatDetailValue(result.range)}</dd>
                    </div>
                    <div>
                      <dt>Width</dt>
                      <dd>{formatDetailValue(result.width)}</dd>
                    </div>
                    <div>
                      <dt>Weight</dt>
                      <dd>{formatDetailValue(result.weight)}</dd>
                    </div>
                  </dl>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {pagination?.has_more && !isNotMapped ? (
        <button
          type="button"
          className="prices-lookup-load-more"
          onClick={onLoadMore}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </section>
  );
}

export default function Prices() {
  const [pricesData, setPricesData] = React.useState(() => getPricesData());
  const [dataSource, setDataSource] = React.useState("local");
  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [columnMappings, setColumnMappings] = React.useState([]);
  const [mappingSource, setMappingSource] = React.useState("unavailable");
  const [rowScope, setRowScope] = React.useState(null);
  const [columnScope, setColumnScope] = React.useState(null);
  const [selectedCell, setSelectedCell] = React.useState(null);
  const [dismissedDerivedCellKey, setDismissedDerivedCellKey] =
    React.useState(null);
  const [isTartanLookupOpen, setIsTartanLookupOpen] = React.useState(false);
  const [tartanQuery, setTartanQuery] = React.useState("");
  const [tartanSearchLoading, setTartanSearchLoading] = React.useState(false);
  const [tartanSearchError, setTartanSearchError] = React.useState("");
  const [tartanResults, setTartanResults] = React.useState([]);
  const [tartanMapping, setTartanMapping] = React.useState(null);
  const [tartanPagination, setTartanPagination] = React.useState(null);
  const [selectedTartanId, setSelectedTartanId] = React.useState(null);
  const latestTartanRequestRef = React.useRef(0);
  const lastExecutedLookupKeyRef = React.useRef("");
  const matrixScrollRef = React.useRef(null);
  const priceCellRefs = React.useRef(new Map());

  const {
    priceColumns,
    supplierGroups,
    themedSections,
    getProduct,
    getColumn,
    getRangeSupplier,
    getProductCategory,
    buildSelectedCell,
  } =
    React.useMemo(() => {
      const priceColumns = pricesData?.columns || [];
      const priceSections = pricesData?.sections || [];
      const supplierGroups = priceColumns.reduce((groups, column) => {
        const last = groups[groups.length - 1];
        if (last?.supplier === column.supplier) {
          last.columns.push(column);
        } else {
          groups.push({ supplier: column.supplier, columns: [column] });
        }
        return groups;
      }, []);

      const productLookup = new Map();

      const themedSections = priceSections.map((section, index) => {
        const theme = categoryThemes[index % categoryThemes.length];
        section.products.forEach((product) => {
          productLookup.set(product.id, { ...product, section: section.name });
        });
        return {
          ...section,
          themeStyle: {
            "--prices-category-accent": theme.accent,
            "--prices-category-border": theme.border,
            "--prices-category-fill": theme.fill,
            "--prices-category-strong": theme.strong,
          },
        };
      });

      function getProduct(productId) {
        return productLookup.get(productId) || null;
      }

      function getColumn(columnId) {
        return priceColumns.find((column) => column.id === columnId) || null;
      }

      function getRangeSupplier(rangeId) {
        return getColumn(rangeId)?.supplier || null;
      }

      function getProductCategory(productId) {
        return getProduct(productId)?.section || null;
      }

      function buildSelectedCell(productId, rangeId) {
        const product = getProduct(productId);
        return product && Number.isFinite(product.prices[rangeId])
          ? { productId, columnId: rangeId }
          : null;
      }

      return {
        priceColumns,
        supplierGroups,
        themedSections,
        getProduct,
        getColumn,
        getRangeSupplier,
        getProductCategory,
        buildSelectedCell,
      };
    }, [pricesData]);

  React.useEffect(() => {
    let cancelled = false;

    async function hydratePricesData() {
      setIsLoadingData(true);

      const result = await loadPricesData();
      if (cancelled) return;

      setPricesData(result.data);
      setDataSource(result.source);
      setLoadError(result.error?.message || "");
      setIsLoadingData(false);
    }

    hydratePricesData();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function hydratePriceMappings() {
      const result = await loadPriceColumnMappings();
      if (cancelled) return;

      setColumnMappings(result.data);
      setMappingSource(result.source);
    }

    hydratePriceMappings();

    return () => {
      cancelled = true;
    };
  }, []);

  const derivedCell = React.useMemo(() => {
    if (rowScope?.type !== "product" || columnScope?.type !== "range")
      return null;
    return buildSelectedCell(rowScope.value, columnScope.value);
  }, [columnScope, rowScope]);

  const derivedCellKey = derivedCell
    ? `${derivedCell.productId}:${derivedCell.columnId}`
    : null;

  React.useEffect(() => {
    if (!derivedCellKey) {
      setDismissedDerivedCellKey(null);
      return;
    }

    setDismissedDerivedCellKey((current) =>
      current === derivedCellKey ? current : null,
    );
  }, [derivedCellKey]);

  const finalSelectedCell =
    selectedCell ||
    (derivedCellKey && dismissedDerivedCellKey !== derivedCellKey
      ? derivedCell
      : null);
  const detailProduct = finalSelectedCell
    ? getProduct(finalSelectedCell.productId)
    : null;
  const detailColumn = finalSelectedCell
    ? getColumn(finalSelectedCell.columnId)
    : null;
  const detailColumnMapping = detailColumn
    ? columnMappings.find((mapping) => mapping.matrixKey === detailColumn.id) ||
      null
    : null;
  const detailCell =
    finalSelectedCell && detailProduct && detailColumn
      ? finalSelectedCell
      : null;
  const isDetailOpen = Boolean(detailCell);
  const hasFinalCellSelection = Boolean(finalSelectedCell);
  const isManualCellSelected = Boolean(selectedCell);
  const hasBroadFocus = Boolean(
    !hasFinalCellSelection && (rowScope || columnScope),
  );
  const hasActiveState = Boolean(
    rowScope || columnScope || selectedCell || derivedCellKey,
  );

  function rowMatchesSelection(product, sectionName) {
    if (!rowScope) return true;
    if (rowScope.type === "product") return product.id === rowScope.value;
    if (rowScope.type === "category") return sectionName === rowScope.value;
    return true;
  }

  function columnMatchesSelection(column) {
    if (!columnScope) return true;
    if (columnScope.type === "range") return column.id === columnScope.value;
    if (columnScope.type === "weaver")
      return column.supplier === columnScope.value;
    return true;
  }

  function isSelectedFinalCell(productId, columnId) {
    return (
      finalSelectedCell?.productId === productId &&
      finalSelectedCell?.columnId === columnId
    );
  }

  function isRelevantPriceCell(product, sectionName, column) {
    if (hasFinalCellSelection) {
      return isSelectedFinalCell(product.id, column.id);
    }

    return (
      rowMatchesSelection(product, sectionName) &&
      columnMatchesSelection(column)
    );
  }

  function isProductLabelRelevant(productId) {
    if (hasFinalCellSelection) {
      return finalSelectedCell?.productId === productId;
    }

    if (!rowScope) return true;
    if (rowScope.type === "product") return productId === rowScope.value;
    if (rowScope.type === "category")
      return getProductCategory(productId) === rowScope.value;
    return true;
  }

  function isCategoryLabelRelevant(categoryName) {
    if (hasFinalCellSelection) {
      return finalSelectedCell
        ? getProductCategory(finalSelectedCell.productId) === categoryName
        : false;
    }

    if (!rowScope) return true;
    if (rowScope.type === "category") return rowScope.value === categoryName;
    if (rowScope.type === "product")
      return getProductCategory(rowScope.value) === categoryName;
    return true;
  }

  function isSupplierLabelRelevant(supplier) {
    if (hasFinalCellSelection) {
      return finalSelectedCell
        ? getRangeSupplier(finalSelectedCell.columnId) === supplier
        : false;
    }

    if (!columnScope) return true;
    if (columnScope.type === "weaver") return columnScope.value === supplier;
    if (columnScope.type === "range")
      return getRangeSupplier(columnScope.value) === supplier;
    return true;
  }

  function isRangeLabelRelevant(columnId) {
    if (hasFinalCellSelection) {
      return finalSelectedCell?.columnId === columnId;
    }

    if (!columnScope) return true;
    if (columnScope.type === "range") return columnScope.value === columnId;
    if (columnScope.type === "weaver")
      return getRangeSupplier(columnId) === columnScope.value;
    return true;
  }

  React.useEffect(() => {
    if (!finalSelectedCell) return;

    const cellKey = `${finalSelectedCell.productId}:${finalSelectedCell.columnId}`;
    const scrollContainer = matrixScrollRef.current;
    const cellElement = priceCellRefs.current.get(cellKey);

    if (!scrollContainer || !cellElement) return;

    const keepCellVisible = () => {
      const containerRect = scrollContainer.getBoundingClientRect();
      const cellRect = cellElement.getBoundingClientRect();

      const stickyColumnWidth = 220;
      const leftBoundary = containerRect.left + stickyColumnWidth;
      const rightBoundary = containerRect.right;
      const topBoundary = containerRect.top + 68;
      const bottomBoundary = containerRect.bottom;

      if (cellRect.left < leftBoundary) {
        scrollContainer.scrollBy({
          left: cellRect.left - leftBoundary - 8,
          behavior: "auto",
        });
      } else if (cellRect.right > rightBoundary) {
        scrollContainer.scrollBy({
          left: cellRect.right - rightBoundary + 8,
          behavior: "auto",
        });
      }

      if (cellRect.top < topBoundary) {
        scrollContainer.scrollBy({
          top: cellRect.top - topBoundary - 8,
          behavior: "auto",
        });
      } else if (cellRect.bottom > bottomBoundary) {
        scrollContainer.scrollBy({
          top: cellRect.bottom - bottomBoundary + 8,
          behavior: "auto",
        });
      }
    };

    const frameId = window.requestAnimationFrame(keepCellVisible);
    const timeoutId = isDetailOpen
      ? window.setTimeout(keepCellVisible, 240)
      : null;

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [finalSelectedCell, isDetailOpen]);

  const resetTartanLookup = React.useCallback(() => {
    setIsTartanLookupOpen(false);
    setTartanQuery("");
    setTartanSearchLoading(false);
    setTartanSearchError("");
    setTartanResults([]);
    setTartanMapping(null);
    setTartanPagination(null);
    setSelectedTartanId(null);
    latestTartanRequestRef.current += 1;
    lastExecutedLookupKeyRef.current = "";
  }, []);

  React.useEffect(() => {
    resetTartanLookup();
  }, [finalSelectedCell?.columnId, resetTartanLookup]);

  function resetDerivedDismissal() {
    setDismissedDerivedCellKey(null);
  }

  function toggleSupplierFocus(supplier) {
    setColumnScope((current) =>
      current?.type === "weaver" && current.value === supplier
        ? null
        : { type: "weaver", value: supplier },
    );
    setSelectedCell(null);
    resetDerivedDismissal();
  }

  function toggleRangeFocus(columnId) {
    setColumnScope((current) =>
      current?.type === "range" && current.value === columnId
        ? null
        : { type: "range", value: columnId },
    );
    setSelectedCell(null);
    resetDerivedDismissal();
  }

  function toggleCategoryFocus(categoryName) {
    setRowScope((current) =>
      current?.type === "category" && current.value === categoryName
        ? null
        : { type: "category", value: categoryName },
    );
    setSelectedCell(null);
    resetDerivedDismissal();
  }

  function toggleProductFocus(productId) {
    setRowScope((current) =>
      current?.type === "product" && current.value === productId
        ? null
        : { type: "product", value: productId },
    );
    setSelectedCell(null);
    resetDerivedDismissal();
  }

  function selectCell(productId, columnId) {
    setRowScope(null);
    setColumnScope(null);
    setSelectedCell(
      buildSelectedCell(productId, columnId) || { productId, columnId },
    );
    resetDerivedDismissal();
  }

  function clearSelectedCell() {
    if (selectedCell) {
      setSelectedCell(null);
      return;
    }

    if (derivedCellKey) {
      setDismissedDerivedCellKey(derivedCellKey);
      return;
    }
  }

  function clearAllSelections() {
    setRowScope(null);
    setColumnScope(null);
    setSelectedCell(null);
    setDismissedDerivedCellKey(null);
  }

  const trimmedTartanQuery = tartanQuery.trim();
  const canRunDefaultLookup = trimmedTartanQuery.length === 0;
  const meetsTypedSearchThreshold = trimmedTartanQuery.length >= 3;
  const canSubmitTartanSearch =
    canRunDefaultLookup || meetsTypedSearchThreshold;
  const hasActiveTartanLookupState =
    tartanSearchLoading ||
    Boolean(tartanSearchError) ||
    tartanResults.length > 0 ||
    Boolean(tartanMapping) ||
    Boolean(tartanPagination) ||
    selectedTartanId != null;
  const tartanLookupHelperText = canRunDefaultLookup
    ? "Type at least 3 characters to search tartans, or run a blank lookup to browse this mapped range."
    : meetsTypedSearchThreshold
      ? "Searching tartans as you type."
      : "Keep typing - tartan search starts after 3 characters.";

  const clearActiveTartanResults = React.useCallback(() => {
    latestTartanRequestRef.current += 1;
    lastExecutedLookupKeyRef.current = "";
    setTartanSearchLoading(false);
    setTartanSearchError("");
    setTartanResults([]);
    setTartanMapping(null);
    setTartanPagination(null);
    setSelectedTartanId(null);
  }, []);

  async function runTartanLookup({
    offset = 0,
    append = false,
    query = trimmedTartanQuery,
    force = false,
  } = {}) {
    if (!detailColumn?.id) return;

    const normalizedQuery = query.trim();
    const lookupKey = `${detailColumn.id}::${normalizedQuery}::${offset}`;

    if (!force && !append && lastExecutedLookupKeyRef.current === lookupKey) {
      return;
    }

    const requestId = latestTartanRequestRef.current + 1;
    latestTartanRequestRef.current = requestId;

    setTartanSearchLoading(true);
    setTartanSearchError("");

    const { data, error } = await invokeAuthed(
      "search_tartans_for_price_column",
      {
        column_id: detailColumn.id,
        query: normalizedQuery,
        limit: 24,
        offset,
      },
    );

    if (latestTartanRequestRef.current !== requestId) {
      return;
    }

    if (error) {
      lastExecutedLookupKeyRef.current = lookupKey;
      setTartanSearchError(
        error.message || "Could not search the tartan catalogue.",
      );
      if (!append) {
        setTartanResults([]);
        setTartanMapping(null);
        setTartanPagination(null);
        setSelectedTartanId(null);
      }
      setTartanSearchLoading(false);
      return;
    }

    const incomingResults = Array.isArray(data?.results) ? data.results : [];
    lastExecutedLookupKeyRef.current = lookupKey;

    setTartanMapping(data?.mapping || null);
    setTartanPagination(data?.pagination || null);
    setTartanResults((current) => {
      const nextResults = append
        ? [...current, ...incomingResults]
        : incomingResults;
      setSelectedTartanId((selectedId) =>
        nextResults.some((result) => result.tartan_id === selectedId)
          ? selectedId
          : null,
      );
      return nextResults;
    });
    setTartanSearchLoading(false);
  }

  React.useEffect(() => {
    if (!isTartanLookupOpen || !detailColumn?.id) return;

    if (trimmedTartanQuery.length === 0) {
      if (hasActiveTartanLookupState) {
        clearActiveTartanResults();
      }
      return;
    }

    if (trimmedTartanQuery.length < 3) {
      if (hasActiveTartanLookupState) {
        clearActiveTartanResults();
      }
      return;
    }

    const debounceId = window.setTimeout(() => {
      runTartanLookup({
        offset: 0,
        append: false,
        query: trimmedTartanQuery,
      });
    }, 350);

    return () => {
      window.clearTimeout(debounceId);
    };
  }, [
    clearActiveTartanResults,
    detailColumn?.id,
    hasActiveTartanLookupState,
    isTartanLookupOpen,
    trimmedTartanQuery,
  ]);

  function handleToggleTartanLookup() {
    setIsTartanLookupOpen((current) => {
      const next = !current;
      if (!next) {
        setTartanQuery("");
        clearActiveTartanResults();
      }
      return next;
    });
  }

  async function handleTartanSearch(event) {
    event.preventDefault();
    if (!canSubmitTartanSearch) return;
    await runTartanLookup({
      offset: 0,
      append: false,
      query: trimmedTartanQuery,
      force: true,
    });
  }

  async function handleTartanLoadMore() {
    const nextOffset =
      (tartanPagination?.offset || 0) + (tartanPagination?.returned || 0);
    await runTartanLookup({
      offset: nextOffset,
      append: true,
      query: trimmedTartanQuery,
    });
  }

  const statusLabel =
    dataSource === "supabase"
      ? "Live Supabase matrix"
      : isLoadingData
        ? "Loading staff price list..."
        : loadError
          ? "Sample local matrix fallback"
          : "Sample local matrix";

  return (
    <div className="prices-page">
      <header className="prices-header prices-element">
        <div>
          <h2>Prices</h2>
        </div>
        <div className="prices-header__controls">
          <div
            className="prices-header__status"
            aria-live="polite"
            title={loadError || statusLabel}
          >
            <span />
            {statusLabel}
          </div>
          <button
            type="button"
            className="prices-header__clear"
            onClick={clearAllSelections}
            disabled={!hasActiveState}
          >
            Clear all
          </button>
        </div>
      </header>

      <div
        className={`prices-layout ${isDetailOpen ? "prices-layout--detail-open" : "prices-layout--detail-closed"}`}
        style={{
          "--prices-column-count": priceColumns.length,
        }}
      >
        <section
          className={`prices-matrix prices-element ${hasFinalCellSelection ? "prices-matrix--cell-selected" : ""} ${isManualCellSelected ? "prices-matrix--manual-cell-selected" : ""}`}
          aria-label="Price list matrix"
        >
          <div className="prices-matrix__scroll" ref={matrixScrollRef}>
            <table>
              <thead>
                <tr>
                  <th className="prices-corner-heading" scope="col">
                    Items
                  </th>
                  {supplierGroups.map((group) => {
                    const isFocused =
                      columnScope?.type === "weaver" &&
                      columnScope.value === group.supplier &&
                      !hasFinalCellSelection;
                    const isDimmed =
                      (hasBroadFocus || hasFinalCellSelection) &&
                      !isSupplierLabelRelevant(group.supplier);
                    return (
                      <th
                        key={group.supplier}
                        className={`prices-supplier-heading ${isFocused ? "is-focused" : ""} ${isDimmed ? "is-dimmed" : ""}`}
                        colSpan={group.columns.length}
                        scope="colgroup"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSupplierFocus(group.supplier)}
                        >
                          <span>{group.supplier}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  <th className="prices-product-subheading" scope="col">
                    Range
                  </th>
                  {supplierGroups.flatMap((group) =>
                    group.columns.map((column) => {
                      const rangeFocused =
                        columnScope?.type === "range" &&
                        columnScope.value === column.id &&
                        !hasFinalCellSelection;
                      const rangeDimmed =
                        (hasBroadFocus || hasFinalCellSelection) &&
                        !isRangeLabelRelevant(column.id);
                      const selectionDimmed = rangeDimmed;

                      return (
                        <th
                          key={column.id}
                          className={[
                            "prices-range-heading",
                            rangeFocused ? "is-range-focused" : "",
                            rangeDimmed ? "is-range-dimmed" : "",
                            selectionDimmed ? "is-selection-dimmed" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          scope="col"
                        >
                          <button
                            type="button"
                            onClick={() => toggleRangeFocus(column.id)}
                          >
                            <span>{column.range}</span>
                          </button>
                        </th>
                      );
                    }),
                  )}
                </tr>
              </thead>

              <tbody>
                {themedSections.map((section) => {
                  const categoryFocused =
                    !hasFinalCellSelection &&
                    ((rowScope?.type === "category" &&
                      rowScope.value === section.name) ||
                      (rowScope?.type === "product" &&
                        getProductCategory(rowScope.value) === section.name));
                  const categoryDimmed =
                    (hasBroadFocus || hasFinalCellSelection) &&
                    !isCategoryLabelRelevant(section.name);
                  const categorySelectionDimmed = categoryDimmed;

                  return (
                    <React.Fragment key={section.name}>
                      <tr
                        className={`prices-category-row ${categoryFocused ? "is-category-focused" : ""} ${categoryDimmed ? "is-category-dimmed" : ""} ${categorySelectionDimmed ? "is-selection-dimmed" : ""}`}
                        style={section.themeStyle}
                      >
                        <th
                          className="prices-category-merged-cell"
                          colSpan={priceColumns.length + 1}
                          scope="rowgroup"
                        >
                          <button
                            type="button"
                            className="prices-category-merged-button"
                            onClick={() => toggleCategoryFocus(section.name)}
                            aria-pressed={categoryFocused}
                          >
                            <span>{section.name}</span>
                          </button>
                        </th>
                      </tr>

                      {section.products.map((product) => {
                        const productFocused =
                          rowScope?.type === "product" &&
                          rowScope.value === product.id &&
                          !hasFinalCellSelection;
                        const productDimmed =
                          (hasBroadFocus || hasFinalCellSelection) &&
                          !isProductLabelRelevant(product.id);
                        const productSelectionDimmed = productDimmed;

                        return (
                          <tr
                            key={product.id}
                            className={[
                              "prices-product-row",
                              categoryFocused ? "is-category-focused" : "",
                              categoryDimmed ? "is-category-dimmed" : "",
                              productFocused ? "is-product-focused" : "",
                              productDimmed ? "is-product-dimmed" : "",
                              productSelectionDimmed
                                ? "is-selection-dimmed"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={section.themeStyle}
                          >
                            <th className="prices-product-cell" scope="row">
                              <button
                                type="button"
                                onClick={() => toggleProductFocus(product.id)}
                              >
                                {product.name}
                              </button>
                            </th>

                            {priceColumns.map((column) => {
                              const value = product.prices[column.id];
                              const available = Number.isFinite(value);
                              const isSelectedCell = isSelectedFinalCell(
                                product.id,
                                column.id,
                              );
                              const isImpliedCell =
                                !selectedCell && isSelectedCell;
                              const cellKey = `${product.id}:${column.id}`;
                              const isRelevantCell = isRelevantPriceCell(
                                product,
                                section.name,
                                column,
                              );
                              const selectionDimmed =
                                hasActiveState &&
                                !isSelectedCell &&
                                !isRelevantCell;

                              return (
                                <td
                                  key={`${product.id}-${column.id}`}
                                  ref={(element) => {
                                    if (element) {
                                      priceCellRefs.current.set(
                                        cellKey,
                                        element,
                                      );
                                    } else {
                                      priceCellRefs.current.delete(cellKey);
                                    }
                                  }}
                                  className={[
                                    "prices-price-cell",
                                    available ? "has-price" : "is-empty",
                                    isSelectedCell ? "is-cell-selected" : "",
                                    isImpliedCell ? "is-cell-derived" : "",
                                    selectionDimmed
                                      ? "is-selection-dimmed"
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                >
                                  {available ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        selectCell(product.id, column.id)
                                      }
                                    >
                                      {gbp.format(value)}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="prices-unavailable-button"
                                      onClick={() =>
                                        selectCell(product.id, column.id)
                                      }
                                    >
                                      -
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <DetailPanel
          product={detailProduct}
          column={detailColumn}
          columnMapping={detailColumnMapping}
          mappingSource={mappingSource}
          version={pricesData?.version}
          onClose={clearSelectedCell}
          isOpen={isDetailOpen}
          tartanLookupOpen={isTartanLookupOpen}
          onToggleTartanLookup={handleToggleTartanLookup}
          tartanQuery={tartanQuery}
          onTartanQueryChange={setTartanQuery}
          onTartanSearch={handleTartanSearch}
          onTartanLoadMore={handleTartanLoadMore}
          tartanSearchLoading={tartanSearchLoading}
          tartanSearchError={tartanSearchError}
          tartanResults={tartanResults}
          tartanMapping={tartanMapping}
          tartanPagination={tartanPagination}
          selectedTartanId={selectedTartanId}
          onSelectTartan={setSelectedTartanId}
          canSubmitSearch={canSubmitTartanSearch}
          helperText={tartanLookupHelperText}
        />
      </div>
    </div>
  );
}
