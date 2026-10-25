export const round2 = (n) => Math.round(n * 100) / 100

// Same maths as src/main/purchaseMath.js (the backend recomputes everything on save);
// this copy only drives the live preview on the Purchase page - keep them in step.
export function computePurchaseTotals({ items, discount = 0, gstRate = 0, transport = 0, gstInCost = false }) {
  const lines = items.map(i => ({ ...i, value: Number(i.quantity) * Number(i.unit_cost) }))
  const itemsTotal = lines.reduce((t, l) => t + l.value, 0)
  const totalQty = lines.reduce((t, l) => t + Number(l.quantity), 0)

  const disc = Math.min(Math.max(Number(discount) || 0, 0), itemsTotal)
  const net = itemsTotal - disc
  const gstAmount = round2(net * (Math.max(Number(gstRate) || 0, 0) / 100))
  const trans = Math.max(Number(transport) || 0, 0)

  const beforeRounding = net + gstAmount + trans
  const grandTotal = Math.round(beforeRounding)
  const roundOff = round2(grandTotal - beforeRounding)

  const adjustment = -disc + trans + (gstInCost ? gstAmount : 0)
  const shares = lines.map(l => itemsTotal > 0 ? l.value / itemsTotal : Number(l.quantity) / (totalQty || 1))
  const perUnit = (amount, idx) => (amount * shares[idx]) / (Number(lines[idx].quantity) || 1)
  const landed = lines.map((l, idx) => Number(l.unit_cost) + perUnit(adjustment, idx))
  // the same shares, split out per unit so the table can show where the landed cost comes from
  const gstPerUnit = lines.map((l, idx) => perUnit(gstAmount, idx))
  const transportPerUnit = lines.map((l, idx) => perUnit(trans, idx))

  return { itemsTotal, discount: disc, net, gstAmount, transport: trans, roundOff, grandTotal, landed, gstPerUnit, transportPerUnit }
}
