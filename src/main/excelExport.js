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
    { header: 'Min Stock Level', key: 'min_stock_level', width: 14 }
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
    SELECT s.name as supplier_name, p.purchase_date, p.total_amount, p.status
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.purchase_date DESC
  `).all();
  addSheet(workbook, 'Purchases', [
    { header: 'Supplier', key: 'supplier_name', width: 24 },
    { header: 'Date', key: 'purchase_date', width: 20 },
    { header: 'Total Amount', key: 'total_amount', width: 14 },
    { header: 'Status', key: 'status', width: 14 }
  ], purchases);

  return workbook;
}

module.exports = { buildInventoryWorkbook };
