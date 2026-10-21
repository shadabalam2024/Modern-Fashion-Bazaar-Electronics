const ExcelJS = require('exceljs');

function addSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

// Builds a 3-sheet workbook (Products / Sales / Purchases) from a database handle -
// works for either the live db or a read-only handle opened on an old backup file,
// since both share the same schema.
function buildInventoryWorkbook(db) {
  const workbook = new ExcelJS.Workbook();

  const products = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_custom IS NOT 1
    ORDER BY p.name
  `).all();
  addSheet(workbook, 'Products', [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'SKU', key: 'sku', width: 15 },
    { header: 'Barcode', key: 'barcode', width: 18 },
    { header: 'Category', key: 'category_name', width: 18 },
    { header: 'Cost Price', key: 'cost_price', width: 12 },
    { header: 'Selling Price', key: 'selling_price', width: 12 },
    { header: 'Current Stock', key: 'current_stock', width: 14 },
    { header: 'Min Stock Level', key: 'min_stock_level', width: 14 },
    { header: 'MRP', key: 'mrp', width: 12 },
    { header: 'Brand', key: 'brand', width: 16 },
    { header: 'Size', key: 'size', width: 10 },
    { header: 'Color', key: 'color', width: 12 },
    { header: 'HSN Code', key: 'hsn_code', width: 12 },
    { header: 'Season', key: 'season', width: 12 }
  ], products);

  const invoices = db.prepare(`
    SELECT i.bill_number, i.invoice_date, c.name as customer_name, i.payment_mode,
      i.discount_amount, i.gst_amount, i.total_amount, i.amount_paid, i.refunded_amount, i.status
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    ORDER BY i.invoice_date DESC
  `).all();
  addSheet(workbook, 'Sales', [
    { header: 'Bill Number', key: 'bill_number', width: 16 },
    { header: 'Date', key: 'invoice_date', width: 20 },
    { header: 'Customer', key: 'customer_name', width: 22 },
    { header: 'Payment Mode', key: 'payment_mode', width: 14 },
    { header: 'Discount', key: 'discount_amount', width: 12 },
    { header: 'GST', key: 'gst_amount', width: 12 },
    { header: 'Total', key: 'total_amount', width: 14 },
    { header: 'Amount Paid', key: 'amount_paid', width: 14 },
    { header: 'Refunded', key: 'refunded_amount', width: 12 },
    { header: 'Status', key: 'status', width: 12 }
  ], invoices);

  const purchases = db.prepare(`
    SELECT p.*, s.name as supplier_name
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.purchase_date DESC
  `).all();
  addSheet(workbook, 'Purchases', [
    { header: 'Supplier', key: 'supplier_name', width: 24 },
    { header: 'Date', key: 'purchase_date', width: 20 },
    { header: 'Supplier Bill No', key: 'supplier_bill_no', width: 18 },
    { header: 'Discount', key: 'discount_amount', width: 12 },
    { header: 'GST', key: 'gst_amount', width: 12 },
    { header: 'Transport', key: 'transport_cost', width: 12 },
    { header: 'Total Amount', key: 'total_amount', width: 14 },
    { header: 'Status', key: 'status', width: 14 }
  ], purchases);

  return workbook;
}

// Two sheets: the ledger rows (what the screen shows, with the filter applied) and the summary
function buildLedgerWorkbook({ from, to, ledger }) {
  const workbook = new ExcelJS.Workbook();
  const sourceLabels = {
    sale: 'Sale', customer_payment: 'Customer payment', purchase: 'Purchase', purchase_return: 'Supplier refund', refund: 'Refund',
    owner_in: 'Owner money in', owner_out: 'Owner withdrawal', expense: 'Expense'
  };

  const sheet = workbook.addWorksheet('Ledger');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Details', key: 'description', width: 44 },
    { header: 'Mode', key: 'mode', width: 12 },
    { header: 'Money In', key: 'amt_in', width: 14 },
    { header: 'Money Out', key: 'amt_out', width: 14 },
    { header: 'Balance', key: 'balance', width: 14 }
  ];
  sheet.getRow(1).font = { bold: true };
  for (const r of ledger.rows) {
    sheet.addRow({
      date: r.d, type: sourceLabels[r.source] || r.source, description: r.description, mode: r.mode,
      amt_in: r.amt_in || null, amt_out: r.amt_out || null, balance: r.balance
    });
  }
  const totalRow = sheet.addRow({
    description: ledger.filtered ? `Total (${ledger.filterLabel})` : 'Total',
    amt_in: ledger.rows.reduce((t, r) => t + r.amt_in, 0),
    amt_out: ledger.rows.reduce((t, r) => t + r.amt_out, 0)
  });
  totalRow.font = { bold: true };
  sheet.addRow({ description: 'Opening balance', balance: ledger.openingBalance }).font = { italic: true };
  for (const col of ['amt_in', 'amt_out', 'balance']) sheet.getColumn(col).numFmt = '#,##0.00';

  const s = ledger.summary;
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ header: 'Item', key: 'item', width: 36 }, { header: 'Amount', key: 'amount', width: 18 }];
  summary.getRow(1).font = { bold: true };
  summary.addRows([
    { item: 'Period', amount: `${from} to ${to}` },
    { item: 'Opening balance', amount: ledger.openingBalance },
    { item: 'Money in', amount: s.moneyIn },
    { item: 'Money out', amount: s.moneyOut },
    { item: 'Closing balance', amount: ledger.closingBalance },
    { item: 'Owner added', amount: s.ownerIn },
    { item: 'Owner withdrew', amount: s.ownerOut },
    { item: 'Purchases (incl. transport)', amount: s.purchases },
    { item: 'Net sales (after refunds, before GST)', amount: s.netSales },
    { item: 'Cost of goods sold', amount: s.costOfGoods },
    { item: 'Gross profit', amount: s.grossProfit },
    { item: 'Shop expenses', amount: s.expenses },
    { item: 'Net profit', amount: s.netProfit },
    { item: 'Customers owe you (all time)', amount: s.customersOwe }
  ]);
  summary.getColumn('amount').numFmt = '#,##0.00';
  summary.getColumn('amount').alignment = { horizontal: 'right' };

  return workbook;
}

module.exports = { buildInventoryWorkbook, buildLedgerWorkbook };
