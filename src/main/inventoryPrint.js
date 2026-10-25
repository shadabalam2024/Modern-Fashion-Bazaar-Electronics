const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

// Builds the printable stock sheet. `products` must already be in the order to print.
function buildInventoryHtml({ shopName, filterLabel, products }) {
  const totals = products.reduce((t, p) => ({
    units: t.units + p.current_stock,
    cost: t.cost + p.current_stock * p.cost_price,
    sale: t.sale + p.current_stock * p.selling_price
  }), { units: 0, cost: 0, sale: 0 });

  const rows = products.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.sku)}</td>
      <td>${escapeHtml(p.category_name || '-')}</td>
      <td class="r">${p.current_stock}</td>
      <td class="r">${money(p.cost_price)}</td>
      <td class="r">${p.landed_cost != null ? money(p.landed_cost) : '-'}</td>
      <td class="r">${money(p.selling_price)}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    .sub { margin: 0 0 10px; color: #333; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { text-align: left; border-bottom: 2px solid #000; padding: 4px 6px 4px 0; }
    td { border-bottom: 1px solid #bbb; padding: 4px 6px 4px 0; }
    tr { page-break-inside: avoid; }
    .r { text-align: right; }
    .totals { margin-top: 12px; font-weight: bold; page-break-inside: avoid; }
    .totals p { margin: 3px 0; }
  </style></head><body>
    <h1>${escapeHtml(shopName || 'Inventory')}</h1>
    <p class="sub">Inventory list${filterLabel ? ` (filtered: "${escapeHtml(filterLabel)}")` : ''} · ${escapeHtml(new Date().toLocaleString())}</p>
    <table>
      <thead><tr>
        <th>#</th><th>Product</th><th>SKU</th><th>Category</th>
        <th class="r">Stock</th><th class="r">Cost</th><th class="r">Landed</th><th class="r">Price</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <p>Products: ${products.length} · Total units: ${totals.units}</p>
      <p>Stock value at cost: ${money(totals.cost)} · At selling price: ${money(totals.sale)}</p>
    </div>
  </body></html>`;
}

module.exports = { buildInventoryHtml, escapeHtml, money };
