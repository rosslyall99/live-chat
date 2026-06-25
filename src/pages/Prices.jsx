import React from "react";
import { getPricesData, loadPricesData } from "../lib/pricesData";
import "./Prices.css";

const SHOW_PRICES_DEBUG = false;

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

function DetailPanel({ product, column, version, onClose, isOpen }) {
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
          <ActionSection
            title="Future tools"
            actions={[
              "Generate quote email",
              "Check tartan availability",
              "Supplier enquiry",
            ]}
          />
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

function DetailSection({ title, items }) {
  return (
    <section className="prices-detail-section">
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
            key={action}
            type="button"
            className="prices-detail-action"
            disabled
          >
            {action}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Prices() {
  const [pricesData, setPricesData] = React.useState(() => getPricesData());
  const [dataSource, setDataSource] = React.useState("local");
  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [rowScope, setRowScope] = React.useState(null);
  const [columnScope, setColumnScope] = React.useState(null);
  const [selectedCell, setSelectedCell] = React.useState(null);
  const [dismissedDerivedCellKey, setDismissedDerivedCellKey] =
    React.useState(null);
  const matrixScrollRef = React.useRef(null);
  const priceCellRefs = React.useRef(new Map());

  const { priceColumns, supplierGroups, categoryLookup, themedSections, getProduct, getColumn, getRangeSupplier, getProductCategory, hasPrice, buildSelectedCell } =
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
      const categoryLookup = new Map();

      const themedSections = priceSections.map((section, index) => {
        const theme = categoryThemes[index % categoryThemes.length];
        categoryLookup.set(section.name, section);
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

      function hasPrice(productId, rangeId) {
        const product = getProduct(productId);
        return Boolean(product && Number.isFinite(product.prices[rangeId]));
      }

      function buildSelectedCell(productId, rangeId) {
        return hasPrice(productId, rangeId)
          ? { productId, columnId: rangeId }
          : null;
      }

      return {
        priceColumns,
        supplierGroups,
        categoryLookup,
        themedSections,
        getProduct,
        getColumn,
        getRangeSupplier,
        getProductCategory,
        hasPrice,
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

  function formatScope(scope) {
    return scope ? `${scope.type} ${scope.value}` : "none";
  }

  const debugCellLabel = finalSelectedCell
    ? `${finalSelectedCell.productId}/${finalSelectedCell.columnId}`
    : "none";
  const scopeDebugText = `Row: ${formatScope(rowScope)} | Column: ${formatScope(columnScope)} | Cell: ${debugCellLabel}`;

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
          {SHOW_PRICES_DEBUG && (
            <div
              className="prices-scope-debug"
              aria-label="Temporary Prices selection debug"
            >
              {scopeDebugText}
            </div>
          )}
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
                      const supplierFocused =
                        columnScope?.type === "weaver" &&
                        columnScope.value === column.supplier &&
                        !hasFinalCellSelection;
                      const rangeFocused =
                        columnScope?.type === "range" &&
                        columnScope.value === column.id &&
                        !hasFinalCellSelection;
                      const rangeDimmed =
                        (hasBroadFocus || hasFinalCellSelection) &&
                        !isRangeLabelRelevant(column.id);
                      const selectedOrImpliedCellColumn = false;
                      const selectionDimmed = rangeDimmed;

                      return (
                        <th
                          key={column.id}
                          className={[
                            "prices-range-heading",
                            supplierFocused ? "is-supplier-focused" : "",
                            rangeFocused ? "is-range-focused" : "",
                            rangeDimmed ? "is-range-dimmed" : "",
                            selectedOrImpliedCellColumn ? "is-cell-column" : "",
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
                        const cellInFocusedRow = false;
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
                              cellInFocusedRow ? "is-cell-row" : "",
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
          version={pricesData?.version}
          onClose={clearSelectedCell}
          isOpen={isDetailOpen}
        />
      </div>
    </div>
  );
}
