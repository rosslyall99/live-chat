import React from "react";
import "./Prices.css";

const priceColumns = [
  { id: "marton-balmoral", supplier: "Marton Mills", range: "Balmoral", width: "DW", weight: 8 },
  { id: "marton-bute", supplier: "Marton Mills", range: "Bute", width: "DW", weight: 13 },
  { id: "marton-jura", supplier: "Marton Mills", range: "Jura", width: "DW", weight: 16 },
  { id: "marton-tweed", supplier: "Marton Mills", range: "Tweed", width: "DW", weight: "Var" },
  { id: "loch-rv150", supplier: "Lochcarron", range: "RV150", width: "DW", weight: 11 },
  { id: "loch-braeriach", supplier: "Lochcarron", range: "Braeriach", width: "DW", weight: 13 },
  { id: "loch-strome", supplier: "Lochcarron", range: "Strome", width: "DW", weight: 16 },
  { id: "edgar-med-old-rare", supplier: "House of Edgar", range: "Med/O&R", width: "SW", weight: 13 },
  { id: "edgar-nevis", supplier: "House of Edgar", range: "Nevis", width: "DW", weight: 16 },
  { id: "edgar-heavy", supplier: "House of Edgar", range: "Heavy", width: "SW", weight: 16 },
  { id: "edgar-hebridean", supplier: "House of Edgar", range: "Hebridean", width: "SW", weight: 13 },
  { id: "edgar-clunie", supplier: "House of Edgar", range: "Clunie", width: "DW", weight: 16 },
  { id: "strathmore-t7", supplier: "Strathmore", range: "T7", width: "DW", weight: 11 },
  { id: "strathmore-w60", supplier: "Strathmore", range: "W60", width: "DW", weight: 13 },
  { id: "strathmore-stock", supplier: "Strathmore", range: "Stock", width: "DW", weight: 13 },
  { id: "welsh-rare", supplier: "Welsh", range: "Rare", width: "DW", weight: 13 },
];

const priceSections = [
  {
    name: "KILTS",
    products: [
      row("full-kilt-9-yard", "Full Kilt - 9 Yard", [420, 590, 590, 590, 640, 640, 650, 760, 590, 660, 600, 710, 550, 550, 600, 660]),
      row("full-kilt-8-yard", "Full Kilt - 8 Yard", [400, 550, 550, 550, 600, 600, 600, 700, 550, 600, 550, 650, 500, 500, 500, 550]),
      row("full-kilt-7-yard", "Full Kilt - 7 Yard", [380, 510, 515, 515, 560, 560, 575, 650, 515, 570, 520, 610, 475, 475, 485, 520]),
      row("casual-kilt-6-yard", "Casual Kilt - 6 Yard", [290, 410, 400, 400, 450, 450, 440, 520, 400, 420, 390, 460, 340, 330, 390, 410]),
      row("handfasting", "Handfasting", [35, 45, 45, 45, 45, 50, 50, 55, 50, 55, 55, 60, 45, 45, 45, 55]),
      row("pocket-square", "Pocket Square", [18, 24, 24, 24, 25, 28, 28, 30, 28, 30, 30, 32, 25, 25, 25, 30]),
      row("plaid", "Plaid", [160, 210, 220, 220, 235, 240, 250, 290, 245, 275, 255, 310, 230, 230, 240, 275]),
      row("cloth-per-metre", "Cloth per metre", [45, 65, 72, 72, 76, 82, 88, 95, 86, 95, 90, 98, 72, 74, 74, 95]),
    ],
  },
  {
    name: "TIES",
    products: [
      sparseRow("mto-tie-qty-1", "MTO Tie - qty 1", { "loch-rv150": 55, "loch-braeriach": 65, "loch-strome": 70, "edgar-med-old-rare": 60, "edgar-hebridean": 60, "strathmore-stock": 60, "welsh-rare": 65 }),
      sparseRow("mto-tie-qty-2", "MTO Tie - qty 2", { "loch-rv150": 95, "loch-braeriach": 115, "loch-strome": 125, "edgar-med-old-rare": 105, "edgar-hebridean": 105, "strathmore-stock": 105, "welsh-rare": 115 }),
      sparseRow("regular-tie", "Regular Tie", { "loch-rv150": 25, "loch-braeriach": 55, "loch-strome": 55, "edgar-med-old-rare": 30, "edgar-hebridean": 30, "strathmore-stock": 30, "welsh-rare": 30 }),
      sparseRow("ready-tied-bowtie", "Ready Tied Bowtie", { "marton-balmoral": 25, "marton-bute": 25, "marton-jura": 25, "marton-tweed": 25, "loch-rv150": 25, "loch-braeriach": 25, "loch-strome": 25, "edgar-med-old-rare": 25, "edgar-hebridean": 25, "strathmore-t7": 25, "strathmore-w60": 25, "strathmore-stock": 25, "welsh-rare": 25 }),
    ],
  },
  {
    name: "TROUSERS AND FACTORY PRODUCTS",
    products: [
      row("standard-up-to-waist-41", 'Standard (up to waist 41")', [180, 245, 255, 255, 270, 270, 285, 320, 270, 325, 285, 340, 285, 290, 285, 335]),
      row("waistcoat-up-to-chest-47", 'Waistcoat (up to chest 47")', [185, 255, 265, 265, 275, 285, 300, 335, 285, 330, 295, 350, 290, 295, 290, 340]),
    ],
  },
  {
    name: "BABIES AND CHILDREN",
    products: [
      row("baby-kilt-4-12m-l8", 'Baby Kilt 4-12m - L8"', [75, 105, 110, 110, 120, 120, 130, 145, 120, 150, 130, 165, 125, 125, 125, 150]),
      row("wee-man-1", "Wee Man 1", [110, 160, 170, 170, 180, 180, 190, 210, 180, 220, 190, 280, 190, 190, 190, 220]),
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

function row(id, name, values) {
  return {
    id,
    name,
    prices: Object.fromEntries(
      priceColumns.map((column, index) => [column.id, values[index]]).filter(([, value]) => value != null),
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

const products = priceSections.flatMap((section) =>
  section.products.map((product) => ({ ...product, section: section.name })),
);

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function pricesForProduct(product) {
  return Object.values(product?.prices || {}).filter((value) => Number.isFinite(value));
}

function countSupplierPrices(supplier) {
  const ids = priceColumns.filter((column) => column.supplier === supplier).map((column) => column.id);
  return products.reduce(
    (count, product) => count + ids.filter((id) => Number.isFinite(product.prices[id])).length,
    0,
  );
}

function countRangePrices(columnId) {
  return products.filter((product) => Number.isFinite(product.prices[columnId])).length;
}

function DetailPanel({ selection }) {
  const product = products.find((item) => item.id === selection.productId);
  const column = priceColumns.find((item) => item.id === selection.columnId);
  const supplier = selection.supplier || column?.supplier || "";
  const productPrices = pricesForProduct(product);

  if (selection.type === "cell" && product && column) {
    return (
      <aside className="prices-detail prices-element" aria-label="Price details">
        <PanelTitle kicker="Selected price" title={product.name} />
        <DetailGrid
          items={[
            ["Category", product.section],
            ["Supplier", column.supplier],
            ["Range / cloth", column.range],
            ["Width", column.width],
            ["Weight", `${column.weight} oz`],
            ["Retail price", gbp.format(product.prices[column.id])],
          ]}
        />
        <PlaceholderList title="Later data" items={["Cloth required - coming from Workings sheet / database later", "Approx. lead/make time - coming later", "Supplier contact details - coming later", "Internal notes - coming later"]} />
        <PlaceholderList title="Future actions" muted items={["Customer quote email - coming later", "Supplier enquiry email - coming later", "Tartan selector - coming later", "Sync/CMS tools - coming later"]} />
      </aside>
    );
  }

  if (selection.type === "product" && product) {
    return (
      <aside className="prices-detail prices-element" aria-label="Product details">
        <PanelTitle kicker={product.section} title={product.name} />
        <DetailGrid
          items={[
            ["Available prices", productPrices.length],
            ["Minimum", gbp.format(Math.min(...productPrices))],
            ["Maximum", gbp.format(Math.max(...productPrices))],
          ]}
        />
        <p className="prices-detail__hint">Select a price cell for supplier and range detail.</p>
      </aside>
    );
  }

  if (selection.type === "supplier" && supplier) {
    const ranges = priceColumns.filter((item) => item.supplier === supplier);
    return (
      <aside className="prices-detail prices-element" aria-label="Supplier details">
        <PanelTitle kicker="Supplier" title={supplier} />
        <DetailGrid
          items={[
            ["Ranges / cloths", ranges.map((item) => item.range).join(", ")],
            ["Available product prices", countSupplierPrices(supplier)],
          ]}
        />
        <p className="prices-detail__hint">Select a product or price for more detail.</p>
      </aside>
    );
  }

  if (selection.type === "range" && column) {
    return (
      <aside className="prices-detail prices-element" aria-label="Range details">
        <PanelTitle kicker={column.supplier} title={column.range} />
        <DetailGrid
          items={[
            ["Width", column.width],
            ["Weight", `${column.weight} oz`],
            ["Available product prices", countRangePrices(column.id)],
          ]}
        />
        <p className="prices-detail__hint">Select a product or price for more detail.</p>
      </aside>
    );
  }

  return (
    <aside className="prices-detail prices-element" aria-label="Price list help">
      <PanelTitle kicker="Matrix ready" title="Price details" />
      <p className="prices-detail__hint">
        Select a product, supplier, range, or price cell to view details.
      </p>
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
    <section className={`prices-placeholder ${muted ? "prices-placeholder--muted" : ""}`}>
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
  const [selection, setSelection] = React.useState({ type: "none" });

  function isRowSelected(product) {
    return selection.productId === product.id || (selection.type === "product" && selection.productId === product.id);
  }

  function isColumnSelected(column) {
    return selection.columnId === column.id || selection.supplier === column.supplier;
  }

  return (
    <div className="prices-page">
      <header className="prices-header prices-element">
        <div>
          <span className="prices-kicker">Staff Sheet structure</span>
          <h2>Prices</h2>
        </div>
        <div className="prices-header__status">
          <span />
          Sample read-only matrix
        </div>
      </header>

      <div className="prices-layout">
        <section className="prices-matrix prices-element" aria-label="Price list matrix">
          <div className="prices-matrix__scroll">
            <table>
              <thead>
                <tr>
                  <th className="prices-product-heading" scope="col">Product</th>
                  {supplierGroups.map((group) => (
                    <th
                      key={group.supplier}
                      className={`prices-supplier-heading ${selection.supplier === group.supplier ? "is-selected" : ""}`}
                      colSpan={group.columns.length}
                      scope="colgroup"
                    >
                      <button type="button" onClick={() => setSelection({ type: "supplier", supplier: group.supplier })}>
                        {group.supplier}
                      </button>
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="prices-product-subheading" scope="col">Range</th>
                  {priceColumns.map((column) => (
                    <th
                      key={column.id}
                      className={`prices-range-heading ${selection.columnId === column.id ? "is-selected" : ""}`}
                      scope="col"
                    >
                      <button type="button" onClick={() => setSelection({ type: "range", columnId: column.id })}>
                        <span>{column.range}</span>
                        <small>{column.width} / {column.weight}oz</small>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priceSections.map((section) => (
                  <React.Fragment key={section.name}>
                    <tr className="prices-section-row">
                      <th colSpan={priceColumns.length + 1}>{section.name}</th>
                    </tr>
                    {section.products.map((product) => (
                      <tr
                        key={product.id}
                        className={`${isRowSelected(product) ? "is-row-selected" : ""}`}
                      >
                        <th className="prices-product-cell" scope="row">
                          <button type="button" onClick={() => setSelection({ type: "product", productId: product.id })}>
                            {product.name}
                          </button>
                        </th>
                        {priceColumns.map((column) => {
                          const value = product.prices[column.id];
                          const available = Number.isFinite(value);
                          const selectedCell = selection.type === "cell" && selection.productId === product.id && selection.columnId === column.id;
                          return (
                            <td
                              key={column.id}
                              className={`${available ? "has-price" : "is-empty"} ${isColumnSelected(column) ? "is-column-selected" : ""} ${selectedCell ? "is-cell-selected" : ""}`}
                            >
                              {available ? (
                                <button
                                  type="button"
                                  onClick={() => setSelection({ type: "cell", productId: product.id, columnId: column.id, supplier: column.supplier })}
                                >
                                  {gbp.format(value)}
                                </button>
                              ) : (
                                <span aria-label="Unavailable">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <DetailPanel selection={selection} />
      </div>
    </div>
  );
}
