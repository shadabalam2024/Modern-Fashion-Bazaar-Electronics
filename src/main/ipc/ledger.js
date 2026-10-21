const { dialog } = require('electron');
const { checkPermission } = require('../session');
const { openPdfPreview } = require('../printPreview');
const { buildLedgerHtml } = require('../ledgerPrint');
const { buildLedgerWorkbook } = require('../excelExport');

// Every money movement in one shape: source, ts (sort key), d (YYYY-MM-DD), description,
// mode, amt_in, amt_out. Credit sales are not money in until the customer pays
// (that shows up as a customer_payment). Purchases are treated as paid when created.
const MOVEMENTS_SQL = `
  SELECT 'sale' AS source, id AS ref_id, invoice_date AS ts, DATE(invoice_date) AS d,
         'Sale ' || bill_number AS description, payment_mode AS mode,
         total_amount AS amt_in, 0 AS amt_out
  FROM invoices WHERE payment_mode != 'credit'
  UNION ALL
  SELECT 'customer_payment', cp.id, cp.payment_date, DATE(cp.payment_date),
         'Payment received from ' || c.name, cp.payment_mode, cp.amount, 0
  FROM customer_payments cp JOIN customers c ON cp.customer_id = c.id
  UNION ALL
  SELECT 'purchase', p.id, p.purchase_date, DATE(p.purchase_date),
         'Purchase #' || p.id || ' - ' || s.name
           || CASE WHEN p.transport_cost > 0 THEN ' (incl. transport)' ELSE '' END,
         '-', 0, p.total_amount
  FROM purchases p JOIN suppliers s ON p.supplier_id = s.id
  UNION ALL
  SELECT 'purchase_return', pr.id, pr.return_date, DATE(pr.return_date),
         'Returned to supplier - purchase #' || pr.purchase_id || ' (' || s.name || ')', '-', pr.amount, 0
  FROM purchase_returns pr JOIN purchases p ON pr.purchase_id = p.id JOIN suppliers s ON p.supplier_id = s.id
  UNION ALL
  SELECT 'refund', id, return_date, DATE(return_date),
         'Cash refund ' || return_number, 'cash', 0, refund_amount
  FROM returns WHERE refund_mode = 'cash'
  UNION ALL
  SELECT type, id, entry_date || ' ' || SUBSTR(created_at, 12), entry_date,
         CASE type
           WHEN 'owner_in' THEN 'Owner added money'
           WHEN 'owner_out' THEN 'Owner withdrew money'
           ELSE category
         END || CASE WHEN notes IS NOT NULL AND notes != '' THEN ' - ' || notes ELSE '' END,
         payment_mode,
         CASE WHEN type = 'owner_in' THEN amount ELSE 0 END,
         CASE WHEN type = 'owner_in' THEN 0 ELSE amount END
  FROM ledger_entries
`;

// Which ledger sources each UI filter shows (kept in step with FILTERS in LedgerPage.jsx)
const FILTERS = {
  all: { label: 'All', sources: null },
  sale: { label: 'Sales', sources: ['sale'] },
  customer_payment: { label: 'Customer payments', sources: ['customer_payment'] },
  purchase: { label: 'Purchases', sources: ['purchase', 'purchase_return'] },
  expense: { label: 'Expenses', sources: ['expense'] },
  refund: { label: 'Refunds', sources: ['refund'] },
  owner: { label: 'Owner money', sources: ['owner_in', 'owner_out'] }
};

const MANUAL_TYPES = ['owner_in', 'owner_out', 'expense'];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// Ledger for a date range: opening balance, every movement with a running balance, and a
// profit summary.
function computeLedger(db, from, to) {
  try {
    if (!isDate(from) || !isDate(to)) return { success: false, message: 'Pick a valid date range' };

    const opening = db.prepare(`
      SELECT COALESCE(SUM(amt_in), 0) - COALESCE(SUM(amt_out), 0) AS bal
      FROM (${MOVEMENTS_SQL}) WHERE d < ?
    `).get(from).bal;

    const movements = db.prepare(`
      SELECT * FROM (${MOVEMENTS_SQL}) WHERE d BETWEEN ? AND ? ORDER BY ts ASC, ref_id ASC
    `).all(from, to);

    let balance = opening;
    const rows = movements.map(m => {
      balance += m.amt_in - m.amt_out;
      return { ...m, balance, deletable: MANUAL_TYPES.includes(m.source) };
    });

    const sum = (source, col) => movements.filter(m => m.source === source).reduce((t, m) => t + m[col], 0);

    const sales = db.prepare(`
      SELECT COALESCE(SUM(total_amount - COALESCE(gst_amount, 0)), 0) AS net
      FROM invoices WHERE DATE(invoice_date) BETWEEN ? AND ?
    `).get(from, to).net;
    const refunds = db.prepare(`
      SELECT COALESCE(SUM(refund_amount), 0) AS total FROM returns WHERE DATE(return_date) BETWEEN ? AND ?
    `).get(from, to).total;
    const soldCost = db.prepare(`
      SELECT COALESCE(SUM(ii.quantity * p.cost_price), 0) AS cost
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      JOIN products p ON ii.product_id = p.id
      WHERE DATE(i.invoice_date) BETWEEN ? AND ?
    `).get(from, to).cost;
    const restockedCost = db.prepare(`
      SELECT COALESCE(SUM(ri.quantity * p.cost_price), 0) AS cost
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      JOIN products p ON ri.product_id = p.id
      WHERE ri.restocked = 1 AND DATE(r.return_date) BETWEEN ? AND ?
    `).get(from, to).cost;

    const netSales = sales - refunds;
    const costOfGoods = soldCost - restockedCost;
    const expenses = sum('expense', 'amt_out');
    const customersOwe = db.prepare('SELECT COALESCE(SUM(credit_balance), 0) AS total FROM customers').get().total;

    return {
      success: true,
      openingBalance: opening,
      closingBalance: balance,
      rows: rows.reverse(), // newest first; each row's balance was already computed oldest-first
      summary: {
        moneyIn: movements.reduce((t, m) => t + m.amt_in, 0),
        moneyOut: movements.reduce((t, m) => t + m.amt_out, 0),
        ownerIn: sum('owner_in', 'amt_in'),
        ownerOut: sum('owner_out', 'amt_out'),
        purchases: sum('purchase', 'amt_out') - sum('purchase_return', 'amt_in'),
        expenses,
        netSales,
        costOfGoods,
        grossProfit: netSales - costOfGoods,
        netProfit: netSales - costOfGoods - expenses,
        customersOwe
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

module.exports = (ipcMain, db) => {
  // Add an owner deposit/withdrawal or a shop expense (admin only)
  ipcMain.handle('add-ledger-entry', (event, { type, category, amount, paymentMode, entryDate, notes }) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      if (!MANUAL_TYPES.includes(type)) return { success: false, message: 'Invalid entry type' };
      const amt = Number(amount);
      if (!(amt > 0)) return { success: false, message: 'Enter an amount greater than zero' };
      if (!isDate(entryDate)) return { success: false, message: 'Pick a valid date' };
      if (type === 'expense' && !String(category || '').trim()) {
        return { success: false, message: 'Enter what the expense was for' };
      }

      db.prepare(`
        INSERT INTO ledger_entries (entry_date, type, category, amount, payment_mode, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(entryDate, type, type === 'expense' ? String(category).trim() : null, amt, paymentMode || 'cash', notes || null);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Only the entries typed in by hand can be removed; sales/purchases are edited on their own pages
  ipcMain.handle('delete-ledger-entry', (event, id) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      db.prepare('DELETE FROM ledger_entries WHERE id = ?').run(id);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Ledger for a date range (see computeLedger)
  ipcMain.handle('get-ledger', (event, { from, to }) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    return computeLedger(db, from, to);
  });

  // Same data as the screen (re-read from the DB, with the same filter applied) for print/export
  function ledgerForOutput(from, to, filterKey) {
    const ledger = computeLedger(db, from, to);
    if (!ledger.success) return ledger;
    const filter = FILTERS[filterKey] || FILTERS.all;
    const rows = filter.sources ? ledger.rows.filter(r => filter.sources.includes(r.source)) : ledger.rows;
    return { ...ledger, rows, filterLabel: filter.label, filtered: !!filter.sources };
  }

  ipcMain.handle('print-ledger', async (event, { from, to, filter }) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      const ledger = ledgerForOutput(from, to, filter);
      if (!ledger.success) return ledger;
      const shop = db.prepare('SELECT shop_name FROM shop_settings WHERE id = 1').get();
      return await openPdfPreview(buildLedgerHtml({ shopName: shop?.shop_name, from, to, ledger }), 'Ledger - Print Preview');
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('export-ledger-excel', async (event, { from, to, filter }) => {
    const denied = checkPermission(event, 'admin');
    if (denied) return denied;
    try {
      const ledger = ledgerForOutput(from, to, filter);
      if (!ledger.success) return ledger;
      const workbook = buildLedgerWorkbook({ from, to, ledger });

      const result = await dialog.showSaveDialog({
        title: 'Export Ledger',
        defaultPath: `ledger-${from}-to-${to}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };

      await workbook.xlsx.writeFile(result.filePath);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
};
