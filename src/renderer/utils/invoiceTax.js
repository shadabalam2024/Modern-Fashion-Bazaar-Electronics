const round2 = (n) => Math.round(n * 100) / 100

// Works out the tax picture of a saved invoice for the A4 tax-invoice layout.
// Invoices made with "prices include GST" have the tax inside the line amounts; older (and
// add-on-top) invoices have it on top. Either way:
//   taxable amount = total - gst, and every line gets: rate without tax, tax, amount with tax.
export function invoiceTaxBreakup(invoice) {
  const inclusive = !!invoice.gst_inclusive
  const gst = Number(invoice.gst_amount) || 0
  const taxable = invoice.total_amount - gst

  // New invoices store the rate; for older ones, work it out from the tax actually charged
  let rate = Number(invoice.gst_rate)
  if (!rate) rate = taxable > 0 ? Math.round((gst / taxable) * 100 * 2) / 2 : 0

  const lines = invoice.items.map(item => {
    const sold = item.subtotal // line value after the item's own discount
    const lineTaxable = inclusive ? sold / (1 + rate / 100) : sold
    const tax = inclusive ? sold - lineTaxable : (sold * rate) / 100
    return {
      ...item,
      rateWithoutTax: inclusive ? item.unit_price / (1 + rate / 100) : item.unit_price,
      tax,
      amount: lineTaxable + tax
    }
  })

  const amountsTotal = lines.reduce((t, l) => t + l.amount, 0)
  const invoiceDiscount = Number(invoice.discount_amount) || 0
  return {
    inclusive,
    rate,
    lines,
    qtyTotal: invoice.items.reduce((t, i) => t + i.quantity, 0),
    amountsTotal: round2(amountsTotal),
    invoiceDiscount,
    // the table's tax column only adds up to the invoice's tax when there is no invoice-level discount
    taxColumnTotal: invoiceDiscount > 0 ? null : gst,
    taxable: round2(taxable),
    cgst: round2(gst / 2),
    sgst: round2(gst - round2(gst / 2)),
    gst
  }
}
