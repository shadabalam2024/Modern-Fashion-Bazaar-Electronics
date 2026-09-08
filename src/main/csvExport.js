// Plain CSV generation - deliberately no external library (avoids pulling in a
// spreadsheet package for a feature this small; Excel opens .csv natively).
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  // Excel (especially on Windows) needs a UTF-8 BOM to render ₹ and other
  // non-ASCII characters correctly instead of mojibake.
  return '﻿' + lines.join('\r\n');
}

function productsToCsv(products) {
  const headers = ['Name', 'SKU', 'Barcode', 'Category', 'Cost Price', 'Selling Price', 'Current Stock', 'Min Stock Level'];
  const rows = products.map(p => [
    p.name, p.sku || '', p.barcode || '', p.category_name || '',
    p.cost_price, p.selling_price, p.current_stock, p.min_stock_level
  ]);
  return rowsToCsv(headers, rows);
}

module.exports = { csvEscape, rowsToCsv, productsToCsv };
