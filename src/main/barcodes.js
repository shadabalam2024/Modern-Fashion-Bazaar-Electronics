const JsBarcode = require('jsbarcode');

// Next unused numeric barcodes (100001, 100002, ...), continuing after the highest
// plain-number barcode already in use. Barcodes from suppliers/other schemes (letters, or
// longer than 9 digits) are ignored so they never push our sequence off.
function nextBarcodes(db, count) {
  const row = db.prepare(`
    SELECT MAX(CAST(barcode AS INTEGER)) AS max_code
    FROM products
    WHERE barcode IS NOT NULL AND barcode != '' AND barcode NOT GLOB '*[^0-9]*' AND LENGTH(barcode) <= 9
  `).get();
  const start = Math.max(row?.max_code || 0, 100000) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => String(start + i));
}

// Code 128 barcode as inline SVG (scales to the width it is given).
function barcodeSvg(text, { height = 40 } = {}) {
  const target = {};
  JsBarcode(target, String(text), { format: 'CODE128' });
  const bits = target.encodings.map(e => e.data).join('');
  let rects = '';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j++;
      rects += `<rect x="${i}" y="0" width="${j - i}" height="${height}"/>`;
      i = j;
    } else {
      i++;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bits.length} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:100%;height:${height / 4}mm;display:block"><g fill="#000">${rects}</g></svg>`;
}

module.exports = { nextBarcodes, barcodeSvg };
