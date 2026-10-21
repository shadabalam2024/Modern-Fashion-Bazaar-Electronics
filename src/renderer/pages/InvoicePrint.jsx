import { useState, useEffect, useRef } from 'react'
import { amountInWords } from '../utils/amountInWords'

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
    const cell = { padding: '6px 8px', borderBottom: '1px solid #ddd' }
    const head = { ...cell, borderBottom: '2px solid #000', textAlign: 'left' }
    const money = (n) => `₹${Number(n || 0).toFixed(2)}`
    const totalRow = (label, value, bold) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: bold ? 'bold' : 'normal', fontSize: bold ? 16 : 13 }}>
        <span>{label}</span><span>{value}</span>
      </div>
    )
    const amountPaid = Number(invoice.amount_paid) || 0
    const balance = invoice.total_amount - amountPaid - (Number(invoice.refunded_amount) || 0)
    return (
      <div ref={receiptRef} style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13, color: '#000', padding: 16, maxWidth: 780, margin: '0 auto' }}>
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {logoUrl && <img src={logoUrl} alt="Logo" style={{ maxWidth: 70, maxHeight: 70 }} />}
            <div>
              <div style={{ fontSize: 22, fontWeight: 'bold' }}>{shop.shop_name || 'Modern Fashion Bazaar'}</div>
              {shop.shop_address && <div>{shop.shop_address}</div>}
              {shop.shop_phone && <div>Ph: {shop.shop_phone}</div>}
              {shop.gst_number && <div>GSTIN: {shop.gst_number}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 'bold' }}>INVOICE</div>
            <div>Bill #: {invoice.bill_number}</div>
            <div>{new Date(invoice.invoice_date).toLocaleString()}</div>
          </div>
        </div>

        <div style={{ margin: '12px 0' }}>
          {invoice.customer_name && (
            <div><strong>Customer:</strong> {invoice.customer_name}{invoice.customer_phone ? ` (${invoice.customer_phone})` : ''}</div>
          )}
          {invoice.created_by_username && <div><strong>Cashier:</strong> {invoice.created_by_username}</div>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...head, width: 32 }}>#</th>
              <th style={head}>Item</th>
              <th style={{ ...head, textAlign: 'center' }}>Qty</th>
              <th style={{ ...head, textAlign: 'right' }}>Rate</th>
              <th style={{ ...head, textAlign: 'right' }}>Discount</th>
              <th style={{ ...head, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={item.id} style={{ pageBreakInside: 'avoid' }}>
                <td style={cell}>{i + 1}</td>
                <td style={cell}>{item.product_name}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{money(item.unit_price)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{item.discount > 0 ? money(item.discount) : '-'}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{money(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, pageBreakInside: 'avoid' }}>
          <div style={{ width: 280 }}>
            {totalRow('Subtotal', money(subtotal))}
            {itemDiscounts > 0 && totalRow('Item Discounts', `-${money(itemDiscounts)}`)}
            {invoice.discount_amount > 0 && totalRow('Discount', `-${money(invoice.discount_amount)}`)}
            {invoice.gst_amount > 0 && totalRow(`GST${shop.gst_number ? ` (${shop.gst_number})` : ''}`, money(invoice.gst_amount))}
            <div style={{ borderTop: '2px solid #000', marginTop: 4 }}>{totalRow('Total', money(invoice.total_amount), true)}</div>
            {totalRow('Payment Mode', <span style={{ textTransform: 'capitalize' }}>{invoice.payment_mode}</span>)}
            {invoice.payment_mode === 'credit' && (
              <>
                {totalRow('Paid', money(amountPaid))}
                {totalRow('Balance Due', money(balance), true)}
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, fontWeight: 'bold', pageBreakInside: 'avoid' }}>{amountInWords(invoice.total_amount)}</div>

        {(shop.payment_terms || shop.return_policy) && (
          <div style={{ marginTop: 20, fontSize: 11, color: '#333', pageBreakInside: 'avoid' }}>
            {shop.payment_terms && <div>{shop.payment_terms}</div>}
            {shop.return_policy && <div style={{ marginTop: 4 }}>{shop.return_policy}</div>}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12 }}>Thank you for shopping with us!</div>
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
          <span>GST{shop.gst_number ? ` (${shop.gst_number})` : ''}</span>
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
