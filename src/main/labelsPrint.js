const { escapeHtml } = require('./inventoryPrint');
const { barcodeSvg } = require('./barcodes');

const PER_PAGE = 24; // 3 columns x 8 rows of 70mm x 37mm labels on A4

const price = (n) => `₹${Number(n || 0).toFixed(Number.isInteger(Number(n)) ? 0 : 2)}`;

// A4 sheet of barcode stickers. `labels`: [{ name, barcode, mrp, price }] - one entry per sticker.
function buildLabelsHtml({ shopName, labels }) {
  const cell = (l) => `
    <div class="label">
      <div class="shop">${escapeHtml(shopName || '')}</div>
      <div class="name">${escapeHtml(l.name)}</div>
      <div class="prices">${l.mrp && l.mrp > l.price ? `<span class="mrp">MRP ${price(l.mrp)}</span>` : ''}<span class="sell">${price(l.price)}</span></div>
      <div class="bars">${barcodeSvg(l.barcode, { height: 40 })}</div>
      <div class="code">${escapeHtml(l.barcode)}</div>
    </div>`;

  const pages = [];
  for (let i = 0; i < labels.length; i += PER_PAGE) {
    pages.push(`<div class="page">${labels.slice(i, i + PER_PAGE).map(cell).join('')}</div>`);
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .page { width: 210mm; height: 296mm; display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37mm; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    .label { box-sizing: border-box; padding: 2mm 5mm 1mm; overflow: hidden; text-align: center; }
    .shop { font-size: 7px; letter-spacing: 0.5px; text-transform: uppercase; color: #333; }
    .name { font-size: 10px; font-weight: bold; line-height: 1.15; height: 2.3em; overflow: hidden; margin-top: 1px; }
    .prices { font-size: 10px; margin: 1px 0 2px; }
    .mrp { text-decoration: line-through; margin-right: 6px; color: #444; }
    .sell { font-weight: bold; font-size: 12px; }
    .bars { padding: 0 3mm; }
    .code { font-size: 9px; letter-spacing: 1.5px; margin-top: 1px; }
  </style></head><body>${pages.join('')}</body></html>`;
}

module.exports = { buildLabelsHtml };
