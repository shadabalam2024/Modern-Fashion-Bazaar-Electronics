import { useState, useEffect, useRef } from 'react'
import { amountInWords } from '../utils/amountInWords'
import { invoiceTaxBreakup } from '../utils/invoiceTax'

export default function InvoicePrint({ invoiceId }) {
  const [invoice, setInvoice] = useState(null)
  const [shop, setShop] = useState({})
  const [logoUrl, setLogoUrl] = useState(null)
  const [thermalStatus, setThermalStatus] = useState(null) // null | 'printing' | 'success' | 'error'
  const [thermalError, setThermalError] = useState('')
  const [previewError, setPreviewError] = useState('')
  const receiptRef = useRef(null)
  const isThermalMode = !!(shop.thermal_printing_enabled && shop.thermal_printer_name)

  // Opens the PDF preview (Print / Save buttons live there). Waits for the logo, then
  // sends the receipt's height without the on-screen buttons so the PDF page fits it.
  const openPreview = async () => {
    setPreviewError('')
    const el = receiptRef.current
    if (!el) return
    await Promise.all([...el.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = r; img.onerror = r })))
    // Measure at the real paper width (not this window's width) so text wraps the same
    // way it will in the PDF and the page height fits.
    if (!isThermalMode) {
      const a4 = await window.ipcRenderer.invoke('invoice-preview-pdf', { format: 'a4' })
      if (a4 && !a4.success) setPreviewError(a4.message || 'Could not open the print preview')
      return
    }
    const noPrint = el.querySelector('.no-print')
    const buttonsHeight = noPrint ? noPrint.offsetHeight + 16 : 0
    const saved = { width: el.style.width, maxWidth: el.style.maxWidth, boxSizing: el.style.boxSizing }
    el.style.width = `${Math.round(((Number(shop.thermal_paper_width) || 80) / 25.4) * 96)}px`
    el.style.maxWidth = 'none'
    el.style.boxSizing = 'border-box'
    const contentHeightPx = el.scrollHeight - buttonsHeight + 24
    Object.assign(el.style, saved)
    const result = await window.ipcRenderer.invoke('invoice-preview-pdf', { contentHeightPx })
    if (result && !result.success) setPreviewError(result.message || 'Could not open the print preview')
  }

  useEffect(() => {
    const load = async () => {
      const [inv, shopSettings, logo] = await Promise.all([
        window.ipcRenderer.invoke('get-invoice', invoiceId),
        window.ipcRenderer.invoke('get-shop-settings'),
        window.ipcRenderer.invoke('get-shop-logo')
      ])
      setInvoice(inv)
      setShop(shopSettings || {})
      setLogoUrl(logo)
    }
    load()
  }, [invoiceId])

  useEffect(() => {
    window.ipcRenderer.on('thermal-print-result', (result) => {
      setThermalStatus(result.success ? 'success' : 'error')
      if (!result.success) setThermalError(result.message || 'Print failed')
    })
  }, [])

  useEffect(() => {
    if (!invoice) return
    if (shop.thermal_printing_enabled && shop.thermal_printer_name) {
      // Direct-to-printer mode: skip the OS print dialog entirely. Main process does the
      // actual printing once it sees this signal (it re-reads settings itself) and reports
      // back via 'thermal-print-result' so we can show success/failure here.
      setThermalStatus('printing')
      const t = setTimeout(() => window.ipcRenderer.send('invoice-print-ready'), 300)
      return () => clearTimeout(t)
    }
    const t = setTimeout(openPreview, 300)
    return () => clearTimeout(t)
  }, [invoice, shop])

  if (!invoice) {
    return <div style={{ padding: 20, fontFamily: 'sans-serif' }}>Loading invoice...</div>
  }

  const paperWidth = Number(shop.thermal_paper_width) || 80

  const subtotal = invoice.items.reduce((sum, item) => sum + item.subtotal + (item.discount || 0), 0)
  const itemDiscounts = invoice.items.reduce((sum, item) => sum + (item.discount || 0), 0)

  if (!isThermalMode) {
    const tax = invoiceTaxBreakup(invoice)
    const hasHsn = tax.lines.some(l => l.hsn_code)
    const hasItemDiscount = tax.lines.some(l => l.discount > 0)
    const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const th = { padding: '6px 6px', borderBottom: '2px solid #000', borderTop: '1px solid #000', textAlign: 'left', fontSize: 11, letterSpacing: 0.3 }
    const td = { padding: '7px 6px', verticalAlign: 'top', borderBottom: '1px solid #e5e5e5' }
    const right = { textAlign: 'right' }
    const amountPaid = Number(invoice.amount_paid) || 0
    const balance = invoice.total_amount - amountPaid - (Number(invoice.refunded_amount) || 0)
    const row = (label, value, strong) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: strong ? 'bold' : 'normal', fontSize: strong ? 14 : 12 }}>
        <span>{label}</span><span>{value}</span>
      </div>
    )
    const hasBank = shop.bank_account_no || shop.bank_name || shop.bank_ifsc || shop.bank_account_name
    const title = shop.gst_number ? 'TAX INVOICE' : 'INVOICE'
    const billTo = invoice.customer_name || 'Walk-in Customer'

    return (
      <div ref={receiptRef} style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12, color: '#000', padding: 16, maxWidth: 780, margin: '0 auto' }}>
        <style>{`
          @media print { .no-print { display: none !important; } }
          body { background: #fff; }
        `}</style>

        <div className="no-print" style={{ marginBottom: 16, fontSize: 13 }}>
          {previewError && <div style={{ padding: '0 0 8px', color: '#dc2626' }}>✗ {previewError}</div>}
          <button
            onClick={openPreview}
            style={{ width: '100%', padding: '8px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Print preview
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
            {logoUrl && <img src={logoUrl} alt="Logo" style={{ maxWidth: 70, maxHeight: 70 }} />}
            <div style={{ lineHeight: 1.45 }}>
              <div style={{ fontSize: 17, fontWeight: 'bold', textTransform: 'uppercase' }}>{shop.shop_name || 'Modern Fashion Bazaar'}</div>
              {shop.shop_address && <div style={{ whiteSpace: 'pre-line' }}>{shop.shop_address}</div>}
              {shop.gst_number && <div><strong>GSTIN:</strong> {shop.gst_number}</div>}
              {shop.pan_number && <div><strong>PAN:</strong> {shop.pan_number}</div>}
              {shop.shop_phone && <div><strong>Mobile:</strong> {shop.shop_phone}</div>}
              {shop.shop_email && <div><strong>Email:</strong> {shop.shop_email}</div>}
            </div>
          </div>
          <div style={{ width: 270 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 'bold' }}>{title}</span>
              <span style={{ border: '1px solid #555', padding: '2px 8px', fontSize: 9, letterSpacing: 0.5 }}>ORIGINAL FOR RECIPIENT</span>
            </div>
            {row('Invoice No.', invoice.bill_number)}
            {row('Invoice Date', new Date(invoice.invoice_date).toLocaleDateString())}
            {row('Payment Mode', <span style={{ textTransform: 'capitalize' }}>{invoice.payment_mode}</span>)}
            {invoice.created_by_username && row('Cashier', invoice.created_by_username)}
          </div>
        </div>

        <div style={{ margin: '14px 0', lineHeight: 1.5, borderTop: '1px solid #000', paddingTop: 8 }}>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: 0.5 }}>BILL TO</div>
          <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{billTo}</div>
          {invoice.customer_address && <div style={{ whiteSpace: 'pre-line' }}>{invoice.customer_address}</div>}
          {invoice.customer_phone && <div>Mobile: {invoice.customer_phone}</div>}
          {invoice.customer_gstin && <div>GSTIN: {invoice.customer_gstin}</div>}
          {shop.place_of_supply && <div>Place of Supply: {shop.place_of_supply}</div>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 34 }}>S.NO</th>
              <th style={th}>ITEMS</th>
              {hasHsn && <th style={th}>HSN</th>}
              <th style={{ ...th, ...right }}>QTY.</th>
              <th style={{ ...th, ...right }}>RATE</th>
              {hasItemDiscount && <th style={{ ...th, ...right }}>DISC.</th>}
              <th style={{ ...th, ...right }}>TAX</th>
              <th style={{ ...th, ...right }}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {tax.lines.map((l, i) => (
              <tr key={l.id} style={{ pageBreakInside: 'avoid' }}>
                <td style={td}>{i + 1}</td>
                <td style={td}>{l.product_name}</td>
                {hasHsn && <td style={td}>{l.hsn_code || ''}</td>}
                <td style={{ ...td, ...right, whiteSpace: 'nowrap' }}>{l.quantity} PCS</td>
                <td style={{ ...td, ...right }}>{money(l.rateWithoutTax)}</td>
                {hasItemDiscount && <td style={{ ...td, ...right }}>{l.discount > 0 ? money(l.discount) : '-'}</td>}
                <td style={{ ...td, ...right }}>
                  {money(l.tax)}
                  <div style={{ fontSize: 9, color: '#777' }}>({tax.rate}%)</div>
                </td>
                <td style={{ ...td, ...right }}>{money(l.amount)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 'bold', pageBreakInside: 'avoid' }}>
              <td style={{ padding: '8px 6px', borderTop: '2px solid #000' }} colSpan={hasHsn ? 3 : 2}>SUBTOTAL</td>
              <td style={{ padding: '8px 6px', borderTop: '2px solid #000', ...right }}>{tax.qtyTotal}</td>
              <td style={{ padding: '8px 6px', borderTop: '2px solid #000' }} colSpan={hasItemDiscount ? 2 : 1}></td>
              <td style={{ padding: '8px 6px', borderTop: '2px solid #000', ...right }}>{tax.taxColumnTotal != null ? `₹${money(tax.taxColumnTotal)}` : ''}</td>
              <td style={{ padding: '8px 6px', borderTop: '2px solid #000', ...right }}>₹{money(tax.amountsTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 16, pageBreakInside: 'avoid' }}>
          <div style={{ flex: 1, fontSize: 11, lineHeight: 1.5 }}>
            {(shop.payment_terms || shop.return_policy) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>TERMS AND CONDITIONS</div>
                {shop.payment_terms && <div style={{ whiteSpace: 'pre-line' }}>{shop.payment_terms}</div>}
                {shop.return_policy && <div style={{ whiteSpace: 'pre-line' }}>{shop.return_policy}</div>}
              </div>
            )}
            {hasBank && (
              <div>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>BANK DETAILS</div>
                {shop.bank_account_name && <div>Name: {shop.bank_account_name}</div>}
                {shop.bank_ifsc && <div>IFSC Code: {shop.bank_ifsc}</div>}
                {shop.bank_account_no && <div>Account No: {shop.bank_account_no}</div>}
                {shop.bank_name && <div>Bank: {shop.bank_name}</div>}
              </div>
            )}
          </div>
          <div style={{ width: 290 }}>
            {tax.invoiceDiscount > 0 && row('Subtotal', `₹${money(tax.amountsTotal)}`)}
            {tax.invoiceDiscount > 0 && row('Discount', `-₹${money(tax.invoiceDiscount)}`)}
            {tax.gst > 0 && row('Taxable Amount', `₹${money(tax.taxable)}`)}
            {tax.gst > 0 && row(`CGST @${tax.rate / 2}%`, `₹${money(tax.cgst)}`)}
            {tax.gst > 0 && row(`SGST @${tax.rate / 2}%`, `₹${money(tax.sgst)}`)}
            <div style={{ borderTop: '2px solid #000', margin: '4px 0' }}>{row('Total Amount', `₹${money(invoice.total_amount)}`, true)}</div>
            {row('Received Amount', `₹${money(amountPaid)}`)}
            {balance > 0.004 && row('Balance Due', `₹${money(balance)}`, true)}
            <div style={{ marginTop: 10, fontSize: 11 }}>
              <div style={{ color: '#444' }}>Total Amount (in words)</div>
              <div style={{ fontWeight: 'bold' }}>{amountInWords(invoice.total_amount)}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end', pageBreakInside: 'avoid' }}>
          <div style={{ textAlign: 'right', fontSize: 11 }}>
            <div style={{ height: 50 }} />
            <div>Authorised Signatory for</div>
            <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{shop.shop_name || 'Modern Fashion Bazaar'}</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#555' }}>Thank you for shopping with us!</div>
      </div>
    )
  }

  return (
    <div ref={receiptRef} style={{ fontFamily: "'Courier New', monospace", fontSize: 13, color: '#000', padding: 16, maxWidth: Math.round(340 * (paperWidth / 80)), margin: '0 auto' }}>
      <style>{`
        @page { size: ${paperWidth}mm auto; margin: 3mm; }
        @media print {
          .no-print { display: none !important; }
        }
        body { background: #fff; }
      `}</style>

      {isThermalMode ? (
        <div className="no-print" style={{ marginBottom: 16, fontFamily: 'sans-serif', fontSize: 13 }}>
          {thermalStatus === 'printing' && (
            <div style={{ padding: '8px 0', color: '#374151' }}>Sending to {shop.thermal_printer_name}...</div>
          )}
          {thermalStatus === 'success' && (
            <div style={{ padding: '8px 0', color: '#059669' }}>✓ Sent to {shop.thermal_printer_name}</div>
          )}
          {thermalStatus === 'error' && (
            <>
              <div style={{ padding: '8px 0', color: '#dc2626' }}>✗ Thermal print failed: {thermalError}</div>
              <button
                onClick={openPreview}
                style={{ width: '100%', padding: '8px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
              >
                Open print preview instead
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="no-print" style={{ marginBottom: 16, fontFamily: 'sans-serif', fontSize: 13 }}>
          {previewError && <div style={{ padding: '0 0 8px', color: '#dc2626' }}>✗ {previewError}</div>}
          <button
            onClick={openPreview}
            style={{ width: '100%', padding: '8px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Print preview
          </button>
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {logoUrl && (
          <img src={logoUrl} alt="Logo" style={{ maxWidth: 80, maxHeight: 80, margin: '0 auto 6px', display: 'block' }} />
        )}
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>{shop.shop_name || 'Modern Fashion Bazaar'}</div>
        {shop.shop_address && <div>{shop.shop_address}</div>}
        {shop.shop_phone && <div>Ph: {shop.shop_phone}</div>}
        {shop.gst_number && <div>GSTIN: {shop.gst_number}</div>}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Bill #: {invoice.bill_number}</span>
        <span>{new Date(invoice.invoice_date).toLocaleString()}</span>
      </div>
      {invoice.customer_name && (
        <div>Customer: {invoice.customer_name}{invoice.customer_phone ? ` (${invoice.customer_phone})` : ''}</div>
      )}
      {invoice.created_by_username && <div>Cashier: {invoice.created_by_username}</div>}

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '46%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
            <th style={{ padding: '2px 4px 2px 0' }}>Item</th>
            <th style={{ padding: '2px 4px', textAlign: 'center' }}>Qty</th>
            <th style={{ padding: '2px 4px', textAlign: 'right' }}>Price</th>
            <th style={{ padding: '2px 0', textAlign: 'right' }}>Amt</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map(item => (
            <tr key={item.id}>
              <td style={{ padding: '2px 4px 2px 0', wordBreak: 'break-word' }}>{item.product_name}</td>
              <td style={{ padding: '2px 4px', textAlign: 'center' }}>{item.quantity}</td>
              <td style={{ padding: '2px 4px', textAlign: 'right' }}>{item.unit_price}</td>
              <td style={{ padding: '2px 0', textAlign: 'right' }}>{item.subtotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Subtotal</span>
        <span>₹{subtotal.toFixed(2)}</span>
      </div>
      {itemDiscounts > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Item Discounts</span>
          <span>-₹{itemDiscounts.toFixed(2)}</span>
        </div>
      )}
      {invoice.discount_amount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Discount</span>
          <span>-₹{invoice.discount_amount.toFixed(2)}</span>
        </div>
      )}
      {invoice.gst_amount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>GST{invoice.gst_inclusive ? ' (incl.)' : ''}{shop.gst_number ? ` (${shop.gst_number})` : ''}</span>
          <span>₹{invoice.gst_amount.toFixed(2)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 15, marginTop: 4 }}>
        <span>Total</span>
        <span>₹{invoice.total_amount.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span>Payment Mode</span>
        <span style={{ textTransform: 'capitalize' }}>{invoice.payment_mode}</span>
      </div>

      {(shop.payment_terms || shop.return_policy) && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />
          {shop.payment_terms && <div style={{ fontSize: 11 }}>{shop.payment_terms}</div>}
          {shop.return_policy && <div style={{ fontSize: 11, marginTop: 4 }}>{shop.return_policy}</div>}
        </>
      )}

      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12 }}>Thank you for shopping with us!</div>
    </div>
  )
}
