const { escapeHtml, money } = require('./inventoryPrint');

const SOURCE_LABELS = {
  sale: 'Sale',
  customer_payment: 'Customer payment',
  purchase: 'Purchase',
  refund: 'Refund',
  owner_in: 'Owner money in',
  owner_out: 'Owner withdrawal',
  expense: 'Expense'
};

const formatDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString();

// Builds the printable ledger. `ledger` is computeLedger's result with the rows already filtered.
function buildLedgerHtml({ shopName, from, to, ledger }) {
  const s = ledger.summary;
  const totalIn = ledger.rows.reduce((t, r) => t + r.amt_in, 0);
  const totalOut = ledger.rows.reduce((t, r) => t + r.amt_out, 0);

  const rows = ledger.rows.map(r => `
    <tr>
      <td class="nw">${escapeHtml(formatDate(r.d))}</td>
      <td class="nw">${escapeHtml(SOURCE_LABELS[r.source] || r.source)}</td>
      <td>${escapeHtml(r.description)}</td>
      <td>${escapeHtml(r.mode)}</td>
      <td class="r">${r.amt_in > 0 ? money(r.amt_in) : ''}</td>
      <td class="r">${r.amt_out > 0 ? money(r.amt_out) : ''}</td>
      <td class="r">${money(r.balance)}</td>
    </tr>`).join('');

  const card = (label, value) => `<div class="card"><div class="l">${label}</div><div class="v">${value}</div></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; font-size: 10.5px; color: #000; margin: 0; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    .sub { margin: 0 0 10px; color: #333; }
    .cards { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .card { border: 1px solid #999; border-radius: 4px; padding: 5px 8px; width: 23%; box-sizing: border-box; }
    .l { color: #555; font-size: 9px; }
    .v { font-size: 13px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { text-align: left; border-bottom: 2px solid #000; padding: 4px 5px 4px 0; }
    td { border-bottom: 1px solid #bbb; padding: 3px 5px 3px 0; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .r { text-align: right; }
    .nw { white-space: nowrap; }
    .open td, .total td { font-weight: bold; }
    .total td { border-top: 2px solid #000; }
    .note { margin-top: 8px; color: #555; font-size: 9px; }
  </style></head><body>
    <h1>${escapeHtml(shopName || 'Ledger')}</h1>
    <p class="sub">Ledger${ledger.filtered ? ` - ${escapeHtml(ledger.filterLabel)} only` : ''} · ${escapeHtml(formatDate(from))} to ${escapeHtml(formatDate(to))} · printed ${escapeHtml(new Date().toLocaleString())}</p>
    <div class="cards">
      ${card('Money In', money(s.moneyIn))}
      ${card('Money Out', money(s.moneyOut))}
      ${card('Balance at End', money(ledger.closingBalance))}
      ${card('Customers Owe You', money(s.customersOwe))}
      ${card('Net Sales', money(s.netSales))}
      ${card('Gross Profit', money(s.grossProfit))}
      ${card('Shop Expenses', money(s.expenses))}
      ${card('Net Profit', money(s.netProfit))}
    </div>
    <table>
      <thead><tr>
        <th>Date</th><th>Type</th><th>Details</th><th>Mode</th>
        <th class="r">Money In</th><th class="r">Money Out</th><th class="r">Balance</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total">
          <td colspan="4">Total${ledger.filtered ? ` (${escapeHtml(ledger.filterLabel)})` : ''} - ${ledger.rows.length} entries</td>
          <td class="r">${money(totalIn)}</td><td class="r">${money(totalOut)}</td><td></td>
        </tr>
        <tr class="open"><td colspan="6">Opening balance</td><td class="r">${money(ledger.openingBalance)}</td></tr>
      </tbody>
    </table>
    ${ledger.filtered ? '<p class="note">The balance column is the overall shop balance, not just the filtered entries.</p>' : ''}
  </body></html>`;
}

module.exports = { buildLedgerHtml };
