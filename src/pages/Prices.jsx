import React from "react";
import "./Prices.css";

const SHOW_PRICES_DEBUG = false;

const priceColumns = [
  {
    id: "marton-balmoral",
    supplier: "Marton Mills",
    range: "Balmoral",
    width: "DW",
    weight: 8,
  },
  {
    id: "marton-bute",
    supplier: "Marton Mills",
    range: "Bute",
    width: "DW",
    weight: 13,
  },
  {
    id: "marton-jura",
    supplier: "Marton Mills",
    range: "Jura",
    width: "DW",
    weight: 16,
  },
  {
    id: "marton-tweed",
    supplier: "Marton Mills",
    range: "Tweed",
    width: "DW",
    weight: "Var",
  },
  {
    id: "loch-rv150",
    supplier: "Lochcarron",
    range: "RV150",
    width: "DW",
    weight: 11,
  },
  {
    id: "loch-braeriach",
    supplier: "Lochcarron",
    range: "Braeriach",
    width: "DW",
    weight: 13,
  },
  {
    id: "loch-strome",
    supplier: "Lochcarron",
    range: "Strome",
    width: "DW",
    weight: 16,
  },
  {
    id: "edgar-med-old-rare",
    supplier: "House of Edgar",
    range: "Med/O&R",
    width: "SW",
    weight: 13,
  },
  {
    id: "edgar-nevis",
    supplier: "House of Edgar",
    range: "Nevis",
    width: "DW",
    weight: 16,
  },
  {
    id: "edgar-heavy",
    supplier: "House of Edgar",
    range: "Heavy",
    width: "SW",
    weight: 16,
  },
  {
    id: "edgar-hebridean",
    supplier: "House of Edgar",
    range: "Hebridean",
    width: "SW",
    weight: 13,
  },
  {
    id: "edgar-clunie",
    supplier: "House of Edgar",
    range: "Clunie",
    width: "DW",
    weight: 16,
  },
  {
    id: "strathmore-t7",
    supplier: "Strathmore",
    range: "T7",
    width: "DW",
    weight: 11,
  },
  {
    id: "strathmore-w60",
    supplier: "Strathmore",
    range: "W60",
    width: "DW",
    weight: 13,
  },
  {
    id: "strathmore-stock",
    supplier: "Strathmore",
    range: "Stock",
    width: "DW",
    weight: 13,
  },
  {
    id: "welsh-rare",
    supplier: "Welsh",
    range: "Rare",
    width: "DW",
    weight: 13,
  },
];

const priceSections = [
  {
    name: "KILTS",
    products: [
      row(
        "full-kilt-9-yard",
        "Full Kilt - 9 Yard",
        [
          420, 590, 590, 590, 640, 640, 650, 760, 590, 660, 600, 710, 550, 550,
          600, 660,
        ],
      ),
      row(
        "full-kilt-8-yard",
        "Full Kilt - 8 Yard",
        [
          400, 550, 550, 550, 600, 600, 600, 700, 550, 600, 550, 650, 500, 500,
          500, 550,
        ],
      ),
      row(
        "full-kilt-7-yard",
        "Full Kilt - 7 Yard",
        [
          380, 510, 515, 515, 560, 560, 575, 650, 515, 570, 520, 610, 475, 475,
          485, 520,
        ],
      ),
      row(
        "casual-kilt-6-yard",
        "Casual Kilt - 6 Yard",
        [
          290, 410, 400, 400, 450, 450, 440, 520, 400, 420, 390, 460, 340, 330,
          390, 410,
        ],
      ),
      row(
        "handfasting",
        "Handfasting",
        [35, 45, 45, 45, 45, 50, 50, 55, 50, 55, 55, 60, 45, 45, 45, 55],
      ),
      row(
        "pocket-square",
        "Pocket Square",
        [18, 24, 24, 24, 25, 28, 28, 30, 28, 30, 30, 32, 25, 25, 25, 30],
      ),
      row(
        "plaid",
        "Plaid",
        [
          160, 210, 220, 220, 235, 240, 250, 290, 245, 275, 255, 310, 230, 230,
          240, 275,
        ],
      ),
      row(
        "cloth-per-metre",
        "Cloth per metre",
        [45, 65, 72, 72, 76, 82, 88, 95, 86, 95, 90, 98, 72, 74, 74, 95],
      ),
    ],
  },
  {
    name: "TIES",
    products: [
      sparseRow("mto-tie-qty-1", "MTO Tie - qty 1", {
        "loch-rv150": 55,
        "loch-braeriach": 65,
        "loch-strome": 70,
        "edgar-med-old-rare": 60,
        "edgar-hebridean": 60,
        "strathmore-stock": 60,
        "welsh-rare": 65,
      }),
      sparseRow("mto-tie-qty-2", "MTO Tie - qty 2", {
        "loch-rv150": 95,
        "loch-braeriach": 115,
        "loch-strome": 125,
        "edgar-med-old-rare": 105,
        "edgar-hebridean": 105,
        "strathmore-stock": 105,
        "welsh-rare": 115,
      }),
      sparseRow("regular-tie", "Regular Tie", {
        "loch-rv150": 25,
        "loch-braeriach": 55,
        "loch-strome": 55,
        "edgar-med-old-rare": 30,
        "edgar-hebridean": 30,
        "strathmore-stock": 30,
        "welsh-rare": 30,
      }),
      sparseRow("ready-tied-bowtie", "Ready Tied Bowtie", {
        "marton-balmoral": 25,
        "marton-bute": 25,
        "marton-jura": 25,
        "marton-tweed": 25,
        "loch-rv150": 25,
        "loch-braeriach": 25,
        "loch-strome": 25,
        "edgar-med-old-rare": 25,
        "edgar-hebridean": 25,
        "strathmore-t7": 25,
        "strathmore-w60": 25,
        "strathmore-stock": 25,
        "welsh-rare": 25,
      }),
    ],
  },
  {
    name: "TROUSERS",
    products: [
      row(
        "standard-up-to-waist-41",
        'Standard (up to waist 41")',
        [
          180, 245, 255, 255, 270, 270, 285, 320, 270, 325, 285, 340, 285, 290,
          285, 335,
        ],
      ),
      row(
        "waistcoat-up-to-chest-47",
        'Waistcoat (up to chest 47")',
        [
          185, 255, 265, 265, 275, 285, 300, 335, 285, 330, 295, 350, 290, 295,
          290, 340,
        ],
      ),
    ],
  },
  {
    name: "CHILDREN",
    products: [
      row(
        "baby-kilt-4-12m-l8",
        'Baby Kilt 4-12m - L8"',
        [
          75, 105, 110, 110, 120, 120, 130, 145, 120, 150, 130, 165, 125, 125,
          125, 150,
        ],
      ),
      row(
        "wee-man-1",
        "Wee Man 1",
        [
          110, 160, 170, 170, 180, 180, 190, 210, 180, 220, 190, 280, 190, 190,
          190, 220,
        ],
      ),
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
];

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

function row(id, name, values) {
  return {
    id,
    name,
    prices: Object.fromEntries(
      priceColumns
        .map((column, index) => [column.id, values[index]])
        .filter(([, value]) => value != null),
    ),
  };
}

function sparseRow(id, name, prices) {
  return { id, name, prices };
}

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

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function getProduct(productId) {
  return productLookup.get(productId) || null;
}

function getColumn(columnId) {
  return priceColumns.find((column) => column.id === columnId) || null;
}

function getRangeById(rangeId) {
  return getColumn(rangeId);
}

function getRangeSupplier(rangeId) {
  return getRangeById(rangeId)?.supplier || null;
}

function getProductCategory(productId) {
  return getProduct(productId)?.section || null;
}

function hasPrice(productId, rangeId) {
  const product = getProduct(productId);
  return Boolean(product && Number.isFinite(product.prices[rangeId]));
}

function buildSelectedCell(productId, rangeId) {
  return hasPrice(productId, rangeId) ? { productId, columnId: rangeId } : null;
}

function formatWeight(weight) {
  return typeof weight === "number" ? `${weight} oz` : String(weight);
}

function DetailPanel({ selectedCell, onClose, isOpen }) {
  const product = getProduct(selectedCell?.productId);
  const column = getColumn(selectedCell?.columnId);
  const hasContent = Boolean(selectedCell && product && column);

  const value = hasContent ? product.prices[column.id] : null;

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
          <DetailGrid
            items={[
              ["Product", product.name],
              ["Category", product.section],
              ["Supplier", column.supplier],
              ["Range", column.range],
              ["Width", column.width],
              ["Weight", formatWeight(column.weight)],
              [
                "Retail price",
                Number.isFinite(value) ? gbp.format(value) : "Unavailable",
              ],
            ]}
          />
          <PlaceholderList
            title="Later data"
            items={[
              "Cloth required - coming later",
              "Approx. lead/make time - coming later",
              "Supplier contact details - coming later",
              "Internal notes - coming later",
            ]}
          />
          <PlaceholderList
            title="Future actions"
            muted
            items={[
              "Customer quote email - coming later",
              "Supplier enquiry email - coming later",
              "Tartan selector - coming later",
              "Sync/CMS tools - coming later",
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
          <dd>{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function PlaceholderList({ title, items, muted = false }) {
  return (
    <section
      className={`prices-placeholder ${muted ? "prices-placeholder--muted" : ""}`}
    >
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function Prices() {
  const [rowScope, setRowScope] = React.useState(null);
  const [columnScope, setColumnScope] = React.useState(null);
  const [selectedCell, setSelectedCell] = React.useState(null);
  const [dismissedDerivedCellKey, setDismissedDerivedCellKey] =
    React.useState(null);
  const matrixScrollRef = React.useRef(null);
  const priceCellRefs = React.useRef(new Map());

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
  const detailCell = finalSelectedCell;
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

  return (
    <div className="prices-page">
      <header className="prices-header prices-element">
        <div>
          <h2>Prices</h2>
          <p>
            Read-only supplier matrix with stable focus states for quick staff
            lookup.
          </p>
        </div>
        <div className="prices-header__controls">
          <div className="prices-header__status">
            <span />
            Sample local matrix
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
          selectedCell={detailCell}
          onClose={clearSelectedCell}
          isOpen={isDetailOpen}
        />
      </div>
    </div>
  );
}
