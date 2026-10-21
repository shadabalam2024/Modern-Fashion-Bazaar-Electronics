const round2 = (n) => Math.round(n * 100) / 100;

// Totals for a purchase, and each line's landed unit cost.
// Supplier discount, transport (and GST, only when it can't be claimed back) are shared
// across lines in proportion to each line's value (by quantity if every line is free).
// A copy of this lives in src/renderer/utils/purchaseMath.js for the live preview - keep them in step.
function computePurchaseTotals({ items, discount = 0, gstRate = 0, transport = 0, gstInCost = false }) {
  const lines = items.map(i => ({ ...i, value: Number(i.quantity) * Number(i.unit_cost) }));
  const itemsTotal = lines.reduce((t, l) => t + l.value, 0);
  const totalQty = lines.reduce((t, l) => t + Number(l.quantity), 0);

  const disc = Math.min(Math.max(Number(discount) || 0, 0), itemsTotal);
  const net = itemsTotal - disc;
  const gstAmount = round2(net * (Math.max(Number(gstRate) || 0, 0) / 100));
  const trans = Math.max(Number(transport) || 0, 0);

  const beforeRounding = net + gstAmount + trans;
  const grandTotal = Math.round(beforeRounding);
  const roundOff = round2(grandTotal - beforeRounding);

  const adjustment = -disc + trans + (gstInCost ? gstAmount : 0);
  const landed = lines.map(l => {
    const share = itemsTotal > 0 ? l.value / itemsTotal : Number(l.quantity) / totalQty;
    return Number(l.unit_cost) + (adjustment * share) / Number(l.quantity);
  });

  return { itemsTotal, discount: disc, net, gstAmount, transport: trans, roundOff, grandTotal, landed };
}

module.exports = { computePurchaseTotals, round2 };
