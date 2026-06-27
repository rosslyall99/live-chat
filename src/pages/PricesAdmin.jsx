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

function PriceListCard({ list, isSelected, onSelect }) {
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
          <span className="prices-admin-list-card__eyebrow">Price list</span>
          <strong className="prices-admin-list-card__version">
            {list.version || "Untitled version"}
          </strong>
        </div>
        <div className="prices-admin-list-card__badges">
          {list.is_active ? (
            <span className="prices-admin-badge prices-admin-badge--active">
              Active
            </span>
          ) : null}
          <span className="prices-admin-badge">{formatStatus(list.status)}</span>
        </div>
      </div>

      <div className="prices-admin-list-card__name">
        {list.name || "Unnamed price list"}
      </div>

      <div className="prices-admin-list-card__meta">
        <span>{formatDate(list.effective_from)}</span>
        <span>{formatCount(list.column_count, "columns")}</span>
        <span>{formatCount(list.section_count, "sections")}</span>
        <span>{formatCount(list.product_count, "products")}</span>
        <span>{formatCount(list.cell_count, "cells")}</span>
      </div>
    </button>
  );
}

function PriceMatrixPreview({ matrixData }) {
  const matrix = React.useMemo(
    () => normalizePricesData(matrixData || {}),
    [matrixData],
  );
  const summary = React.useMemo(() => getMatrixSummary(matrixData), [matrixData]);
  const columns = matrix.columns || [];
  const sections = matrix.sections || [];
  const statusText = matrixData?.is_active
    ? "Published active"
    : formatStatus(matrixData?.status);

  return (
    <div className="prices-admin-preview">
      <div className="prices-admin-preview__intro">
        <div>
          <span className="prices-admin-preview__eyebrow">Admin preview</span>
          <h3>{matrixData?.name || matrix.version || "Selected price list"}</h3>
          <p>
            Read-only preview of the selected Prices version. This does not
            affect the live staff `/prices` page.
          </p>
        </div>
        <div className="prices-admin-preview__badges">
          <span className="prices-admin-badge prices-admin-badge--status">
            {statusText}
          </span>
          <span className="prices-admin-badge">{matrix.version || "No version"}</span>
        </div>
      </div>

      <div className="prices-admin-summary-grid">
        <div className="prices-admin-summary-card">
          <span>Effective</span>
          <strong>{formatDate(matrixData?.effective_from)}</strong>
        </div>
        <div className="prices-admin-summary-card">
          <span>Structure</span>
          <strong>
            {summary.columnCount} columns / {summary.sectionCount} sections
          </strong>
        </div>
        <div className="prices-admin-summary-card">
          <span>Products</span>
          <strong>
            {summary.productCount} products / {summary.cellCount} price cells
          </strong>
        </div>
        <div className="prices-admin-summary-card">
          <span>External mapping</span>
          <strong>
            {summary.mappedColumnCount} of {summary.columnCount} columns linked
          </strong>
        </div>
      </div>

      <div className="prices-admin-matrix">
        <div className="prices-admin-matrix__scroll">
          <table>
            <thead>
              <tr>
                <th className="prices-admin-matrix__product-heading">Product</th>
                {columns.map((column) => (
                  <th key={column.id}>
                    <div className="prices-admin-matrix__column">
                      <strong>{column.supplier}</strong>
                      <span>{column.range}</span>
                      <small>
                        {[column.width, column.weight].filter(Boolean).join(" / ") ||
                          "No spec"}
                      </small>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <React.Fragment key={section.name}>
                  <tr className="prices-admin-matrix__section-row">
                    <th colSpan={columns.length + 1}>{section.name}</th>
                  </tr>
                  {(section.products || []).map((product) => {
                    const delivery = formatDeliveryWindow(product);

                    return (
                      <tr key={product.id}>
                        <th className="prices-admin-matrix__product-cell">
                          <div className="prices-admin-matrix__product-name">
                            {product.name}
                          </div>
                          <div className="prices-admin-matrix__product-meta">
                            {product.clothRequired ? (
                              <span>Cloth: {product.clothRequired}</span>
                            ) : null}
                            {product.cmtPrice != null ? (
                              <span>CMT: {gbp.format(product.cmtPrice)}</span>
                            ) : null}
                            {delivery ? <span>Delivery: {delivery}</span> : null}
                            {product.notes ? <span>Notes: {product.notes}</span> : null}
                          </div>
                        </th>
                        {columns.map((column) => {
                          const value = product.prices?.[column.id];

                          return (
                            <td key={`${product.id}:${column.id}`}>
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

export default function PricesAdmin() {
  const [role, setRole] = React.useState("");
  const [loadingLists, setLoadingLists] = React.useState(true);
  const [listsError, setListsError] = React.useState("");
  const [priceLists, setPriceLists] = React.useState([]);
  const [selectedPriceListId, setSelectedPriceListId] = React.useState("");
  const [loadingMatrix, setLoadingMatrix] = React.useState(false);
  const [matrixError, setMatrixError] = React.useState("");
  const [matrixData, setMatrixData] = React.useState(null);

  const loadListsSeq = React.useRef(0);
  const loadMatrixSeq = React.useRef(0);

  const canView = role === "admin" || role === "manager";

  React.useEffect(() => {
    let cancelled = false;

    async function loadPriceLists() {
      const seq = ++loadListsSeq.current;

      setLoadingLists(true);
      setListsError("");

      try {
        const { role: nextRole } = await getMeAndRole();
        if (cancelled || seq !== loadListsSeq.current) return;

        const normalizedRole = String(nextRole || "").toLowerCase();
        setRole(normalizedRole);

        if (!["admin", "manager"].includes(normalizedRole)) {
          setPriceLists([]);
          setSelectedPriceListId("");
          setMatrixData(null);
          return;
        }

        const { data, error } = await supabase.rpc("get_price_lists_admin");
        if (cancelled || seq !== loadListsSeq.current) return;
        if (error) throw error;

        const nextLists = Array.isArray(data) ? data : [];
        setPriceLists(nextLists);
        setSelectedPriceListId((current) => {
          if (current && nextLists.some((item) => item.id === current)) {
            return current;
          }

          const activeList = nextLists.find((item) => item.is_active);
          return activeList?.id || nextLists[0]?.id || "";
        });
      } catch (error) {
        console.error("prices admin: failed to load price lists", error);
        if (cancelled || seq !== loadListsSeq.current) return;

        setListsError(error?.message || "Could not load HUB price lists.");
        setPriceLists([]);
        setSelectedPriceListId("");
        setMatrixData(null);
      } finally {
        if (!cancelled && seq === loadListsSeq.current) {
          setLoadingLists(false);
        }
      }
    }

    loadPriceLists();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function loadSelectedMatrix() {
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

        if (cancelled || seq !== loadMatrixSeq.current) return;
        if (error) throw error;

        setMatrixData(data || null);
      } catch (error) {
        console.error("prices admin: failed to load matrix", error);
        if (cancelled || seq !== loadMatrixSeq.current) return;

        setMatrixError(error?.message || "Could not load the selected matrix.");
        setMatrixData(null);
      } finally {
        if (!cancelled && seq === loadMatrixSeq.current) {
          setLoadingMatrix(false);
        }
      }
    }

    loadSelectedMatrix();

    return () => {
      cancelled = true;
    };
  }, [canView, selectedPriceListId]);

  return (
    <section className="prices-admin-page">
      <header className="prices-admin-header">
        <div>
          <span className="prices-admin-header__eyebrow">Prices CMS</span>
          <h2>Prices Admin Preview</h2>
          <p>
            Review price list versions and draft matrices without affecting the
            live staff Prices page.
          </p>
        </div>
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
                <span className="prices-admin-panel__eyebrow">Available lists</span>
                <h3>Versions and drafts</h3>
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
                {priceLists.map((list) => (
                  <PriceListCard
                    key={list.id}
                    list={list}
                    isSelected={list.id === selectedPriceListId}
                    onSelect={() => setSelectedPriceListId(list.id)}
                  />
                ))}
              </div>
            ) : null}
          </aside>

          <section className="prices-admin-panel prices-admin-panel--preview">
            <div className="prices-admin-panel__header">
              <div>
                <span className="prices-admin-panel__eyebrow">Selected matrix</span>
                <h3>Read-only preview</h3>
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
              <PriceMatrixPreview matrixData={matrixData} />
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
