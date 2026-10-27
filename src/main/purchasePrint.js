const { escapeHtml, money } = require('./inventoryPrint');
const { amountInWords } = require('./amountInWords');

const formatDate = (v) => (v ? new Date(String(v).length <= 10 ? `${v}T00:00:00` : String(v).replace(' ', 'T') + 'Z').toLocaleDateString() : '');

const BASE_CSS = `
  body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 15px; margin: 0; }
  .sub { margin: 0 0 8px; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; border-bottom: 2px solid #000; padding: 4px 6px 4px 0; }
  td { border-bottom: 1px solid #bbb; padding: 4px 6px 4px 0; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .r { text-align: right; }
  .nw { white-space: nowrap; }
`;

// Goods receipt / purchase print for one purchase (`purchase` is get-purchase's result)
function buildPurchaseHtml({ shopName, purchase }) {
  const itemsTotal = purchase.items.reduce((t, i) => t + i.subtotal, 0);
  const hasPrices = purchase.items.some(i => i.mrp != null || i.selling_price != null);

  const rows = purchase.items.map((i, n) => `
    <tr>
      <td>${n + 1}</td>
      <td>${escapeHtml(i.product_name)}<div style="color:#555;font-size:9px">${escapeHtml(i.barcode || i.sku || '')}</div></td>
      <td class="r">${i.quantity}</td>
      <td class="r">${money(i.unit_cost)}</td>
      <td class="r">${money(i.landed_unit_cost ?? i.unit_cost)}</td>
      ${hasPrices ? `<td class="r">${i.mrp != null ? money(i.mrp) : ''}</td><td class="r">${i.selling_price != null ? money(i.selling_price) : ''}</td>` : ''}
      <td class="r">${money(i.subtotal)}</td>
    </tr>`).join('');

  const line = (label, value, bold) => `<div style="display:flex;justify-content:space-between;padding:2px 0;${bold ? 'font-weight:bold;font-size:14px;border-top:2px solid #000;margin-top:3px;padding-top:4px;' : ''}"><span>${label}</span><span>${value}</span></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .meta { display: flex; justify-content: space-between; margin: 10px 0; }
    .meta div { line-height: 1.5; }
  </style></head><body>
    <h1>${escapeHtml(shopName || 'Purchase')}</h1>
    <h2>Purchase #${purchase.id} - Goods Receipt</h2>
    <div class="meta">
      <div>
        <strong>Supplier:</strong> ${escapeHtml(purchase.supplier_name)}<br>
        ${purchase.supplier_phone ? `Ph: ${escapeHtml(purchase.supplier_phone)}<br>` : ''}
        ${purchase.supplier_address ? `${escapeHtml(purchase.supplier_address)}<br>` : ''}
        ${purchase.supplier_gstin ? `GSTIN: ${escapeHtml(purchase.supplier_gstin)}<br>` : ''}
      </div>
      <div style="text-align:right">
        <strong>Date:</strong> ${escapeHtml(formatDate(purchase.purchase_date))}<br>
        ${purchase.supplier_bill_no ? `<strong>Supplier bill no:</strong> ${escapeHtml(purchase.supplier_bill_no)}<br>` : ''}
        ${purchase.bill_date ? `<strong>Bill date:</strong> ${escapeHtml(formatDate(purchase.bill_date))}<br>` : ''}
        <strong>Status:</strong> ${escapeHtml(purchase.status)}
      </div>
    </div>
    <table>
      <thead><tr>
        <th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Cost with extras</th>
        ${hasPrices ? '<th class="r">MRP</th><th class="r">Selling</th>' : ''}
        <th class="r">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:12px;page-break-inside:avoid">
      <div style="width:280px">
        ${line('Items total', money(itemsTotal))}
        ${purchase.discount_amount > 0 ? line('Discount', `-${money(purchase.discount_amount)}`) : ''}
        ${purchase.gst_amount > 0 ? line(`GST (${purchase.gst_rate}%)${purchase.gst_in_cost ? ' - added to cost' : ''}`, money(purchase.gst_amount)) : ''}
        ${purchase.transport_cost > 0 ? line('Transport', money(purchase.transport_cost)) : ''}
        ${purchase.round_off ? line('Round off', `${purchase.round_off > 0 ? '+' : '-'}${money(Math.abs(purchase.round_off))}`) : ''}
        ${line('Grand total', money(purchase.total_amount), true)}
      </div>
    </div>
    <p style="margin-top:10px"><strong>${escapeHtml(amountInWords(purchase.total_amount))}</strong></p>
    <p style="color:#555;font-size:9px">"Cost with extras" is each unit's cost after sharing the discount, transport${'' } and any GST added to cost across the items by value.</p>
  </body></html>`;
}

// Summary list of purchases, in the order shown on screen
function buildPurchaseListHtml({ shopName, purchases, filterLabel }) {
  const total = purchases.reduce((t, p) => t + p.total_amount, 0);
  const rows = purchases.map(p => `
    <tr>
      <td>${p.id}</td>
      <td class="nw">${escapeHtml(formatDate(p.purchase_date))}</td>
      <td>${escapeHtml(p.supplier_name)}</td>
      <td>${escapeHtml(p.supplier_bill_no || '')}</td>
      <td class="r">${money(p.total_amount)}</td>
      <td>${escapeHtml(p.status)}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    <h1>${escapeHtml(shopName || 'Purchases')}</h1>
    <p class="sub">Purchase summary${filterLabel ? ` (filtered: "${escapeHtml(filterLabel)}")` : ''} · ${escapeHtml(new Date().toLocaleString())}</p>
    <table>
      <thead><tr><th>#</th><th>Date</th><th>Supplier</th><th>Supplier bill no</th><th class="r">Total</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:12px;font-weight:bold">Purchases: ${purchases.length} · Total: ${money(total)}</p>
  </body></html>`;
}

module.exports = { buildPurchaseHtml, buildPurchaseListHtml };
