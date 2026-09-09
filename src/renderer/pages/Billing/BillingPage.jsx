import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'
import { createScanTracker } from '../../utils/scanTracker'
import useGlobalScanRedirect from '../../hooks/useGlobalScanRedirect'

export default function BillingPage() {
  const user = useSelector(state => state.auth.user)

  const [billNumber, setBillNumber] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [cart, setCart] = useState([])
  const [customers, setCustomers] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [discountType, setDiscountType] = useState('flat')
  const [discount, setDiscount] = useState(0)
  const [paymentMode, setPaymentMode] = useState('cash')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [scanFlash, setScanFlash] = useState(null)
  const searchInputRef = useRef(null)
  const scanTrackerRef = useRef(createScanTracker())

  const [invoiceHistory, setInvoiceHistory] = useState([])
  const [historySearch, setHistorySearch] = useState('')
  const [viewingInvoice, setViewingInvoice] = useState(null)
  const [lastInvoiceId, setLastInvoiceId] = useState(null)
  const [gstRate, setGstRate] = useState(0)
  const [showCustomItemForm, setShowCustomItemForm] = useState(false)
  const [customItemName, setCustomItemName] = useState('')
  const [customItemPrice, setCustomItemPrice] = useState('')

  const printInvoice = (invoiceId) => {
    window.ipcRenderer.invoke('print-invoice', invoiceId)
  }

  useEffect(() => {
    loadBillNumber()
    loadCustomers()
    loadInvoiceHistory()
    loadShopSettings()
    searchInputRef.current?.focus()
  }, [])

  const loadShopSettings = async () => {
    const settings = await window.ipcRenderer.invoke('get-shop-settings')
    setGstRate(Number(settings?.gst_rate) || 0)
  }

  const loadInvoiceHistory = async () => {
    const data = await window.ipcRenderer.invoke('get-invoices', { limit: 50 })
    setInvoiceHistory(data)
  }

  const openInvoiceDetail = async (invoiceId) => {
    const detail = await window.ipcRenderer.invoke('get-invoice', invoiceId)
    setViewingInvoice(detail)
  }

  const loadBillNumber = async () => {
    const next = await window.ipcRenderer.invoke('get-next-bill-number')
    setBillNumber(next)
  }

  const loadCustomers = async () => {
    const data = await window.ipcRenderer.invoke('get-customers')
    setCustomers(data)
  }

  const recalcItem = (item) => {
    const lineTotal = item.quantity * item.unit_price
    const itemDiscount = item.discountType === 'percent'
      ? lineTotal * (Number(item.discountValue || 0) / 100)
      : Math.min(Math.max(0, Number(item.discountValue || 0)), lineTotal)
    return { ...item, itemDiscount, subtotal: lineTotal - itemDiscount }
  }

  const flashScan = (name) => {
    setScanFlash(name)
    setTimeout(() => setScanFlash(current => current === name ? null : current), 1200)
  }

  const addToCart = (product, viaScan = false) => {
    setError('')
    if (viaScan) flashScan(product.name)
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id)
      if (existing) {
        if (existing.quantity + 1 > product.current_stock) {
          setError(`Only ${product.current_stock} in stock for ${product.name}`)
          return prev
        }
        return prev.map(item =>
          item.product_id === product.id
            ? recalcItem({ ...item, quantity: item.quantity + 1 })
            : item
        )
      }
      if (product.current_stock < 1) {
        setError(`${product.name} is out of stock`)
        return prev
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        unit_price: product.selling_price,
        current_stock: product.current_stock,
        isCustom: !!product.is_custom,
        quantity: 1,
        discountType: 'flat',
        discountValue: 0,
        itemDiscount: 0,
        subtotal: product.selling_price
      }]
    })
    setSearchTerm('')
    setSearchResults([])
    searchInputRef.current?.focus()
  }

  const handleAddCustomItem = async (e) => {
    e.preventDefault()
    setError('')

    if (!customItemName.trim() || !customItemPrice || Number(customItemPrice) <= 0) {
      setError('Enter a name and a price greater than 0 for the custom item')
      return
    }

    const result = await window.ipcRenderer.invoke('add-custom-item', {
      name: customItemName.trim(),
      price: parseFloat(customItemPrice)
    })

    if (result.success) {
      addToCart({
        id: result.productId,
        name: customItemName.trim(),
        selling_price: parseFloat(customItemPrice),
        current_stock: 999999,
        is_custom: true
      })
      setCustomItemName('')
      setCustomItemPrice('')
      setShowCustomItemForm(false)
    } else {
      setError(result.message || 'Failed to add custom item')
    }
  }

  const handleSearch = async (value) => {
    scanTrackerRef.current.onKeystroke()
    setSearchTerm(value)
    if (!value.trim()) {
      setSearchResults([])
      scanTrackerRef.current.reset()
      return
    }
    const results = await window.ipcRenderer.invoke('search-product', value)
    setSearchResults(results)
  }

  // Shared by the search field's own Enter handler AND by useGlobalScanRedirect (when
  // a scan lands in some other field entirely, e.g. Customer Name, because that's what
  // had focus - the redirect hook strips it back out of that field and routes it here).
  const processScannedCode = async (code, { scanLike = true } = {}) => {
    setSearchTerm(code)
    const exact = await window.ipcRenderer.invoke('get-product-by-barcode', code)
    if (exact) {
      addToCart(exact, true)
      setSearchTerm('')
      setSearchResults([])
      return
    }
    const results = await window.ipcRenderer.invoke('search-product', code)
    // Only auto-add the top fuzzy match when we're confident this was a scanner (not a
    // person casually pressing Enter while browsing name-search results) - ambiguous
    // cases are left for the user to click explicitly.
    if (results.length === 0) {
      setError(`No product found for "${code}"`)
      setSearchResults([])
    } else if (scanLike && results.length === 1) {
      addToCart(results[0], true)
      setSearchTerm('')
      setSearchResults([])
    } else {
      setSearchResults(results)
    }
  }

  const handleBarcodeEnter = async (e) => {
    if (e.key !== 'Enter' || !searchTerm.trim()) return
    e.preventDefault()
    await processScannedCode(searchTerm.trim(), { scanLike: scanTrackerRef.current.isScanLike() })
    scanTrackerRef.current.reset()
  }

  useGlobalScanRedirect(searchInputRef, (code) => processScannedCode(code, { scanLike: true }))

  const updateQuantity = (productId, quantity) => {
    setError('')
    setCart(prev => prev.map(item => {
      if (item.product_id !== productId) return item
      const qty = Math.max(1, quantity)
      if (qty > item.current_stock) {
        setError(`Only ${item.current_stock} in stock for ${item.name}`)
        return item
      }
      return recalcItem({ ...item, quantity: qty })
    }))
  }

  const updateItemDiscount = (productId, discountValue) => {
    setCart(prev => prev.map(item =>
      item.product_id === productId ? recalcItem({ ...item, discountValue }) : item
    ))
  }

  const updateItemDiscountType = (productId, discountType) => {
    setCart(prev => prev.map(item =>
      item.product_id === productId ? recalcItem({ ...item, discountType }) : item
    ))
  }

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.product_id !== productId))
  }

  const nameQuery = customerName.trim().toLowerCase()
  const phoneQuery = customerPhone.trim()
  const customerMatches = (!selectedCustomer && (nameQuery || phoneQuery))
    ? customers.filter(c =>
        (!nameQuery || c.name.toLowerCase().includes(nameQuery)) &&
        (!phoneQuery || (c.phone || '').includes(phoneQuery))
      ).slice(0, 6)
    : []

  const selectCustomer = (c) => {
    setSelectedCustomer(c)
    setCustomerName(c.name || '')
    setCustomerPhone(c.phone || '')
  }

  const clearCustomer = () => {
    setSelectedCustomer(null)
    setCustomerName('')
    setCustomerPhone('')
  }

  const handleQuickAddCustomer = async () => {
    if (!customerName.trim()) {
      setError('Enter a name for the new customer')
      return
    }
    const result = await window.ipcRenderer.invoke('add-customer', {
      name: customerName.trim(),
      phone: customerPhone.trim(),
      email: '',
      address: '',
      is_recurring: false
    })
    if (result.success) {
      const newCustomer = { id: result.customerId, name: customerName.trim(), phone: customerPhone.trim(), credit_balance: 0 }
      setCustomers(prev => [...prev, newCustomer])
      selectCustomer(newCustomer)
    } else {
      setError(result.message || 'Failed to add customer')
    }
  }

  const filteredHistory = invoiceHistory.filter(inv =>
    !historySearch.trim() ||
    inv.bill_number.toLowerCase().includes(historySearch.trim().toLowerCase()) ||
    (inv.customer_name || '').toLowerCase().includes(historySearch.trim().toLowerCase())
  )

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0)
  const discountAmount = discountType === 'percent'
    ? cartTotal * (Number(discount || 0) / 100)
    : Number(discount || 0)
  const taxableAmount = Math.max(0, cartTotal - discountAmount)
  const gstAmount = taxableAmount * (gstRate / 100)
  const grandTotal = taxableAmount + gstAmount

  const handleCompleteSale = async () => {
    setError('')
    setMessage('')

    if (cart.length === 0) {
      setError('Cart is empty')
      return
    }
    if (paymentMode === 'credit' && !selectedCustomer) {
      setError('Select a customer for credit sales')
      return
    }

    const result = await window.ipcRenderer.invoke('create-invoice', {
      billNumber,
      customerId: selectedCustomer?.id || null,
      items: cart,
      discount: discountAmount,
      paymentMode,
      userId: user?.id
    })

    if (result.success) {
      setMessage(`Invoice ${result.billNumber} created successfully`)
      setLastInvoiceId(result.invoiceId)
      setCart([])
      setDiscount(0)
      setDiscountType('flat')
      clearCustomer()
      setPaymentMode('cash')
      loadBillNumber()
      loadInvoiceHistory()
    } else {
      setError(result.message || 'Failed to create invoice')
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Billing (POS)</h1>
            <span className="text-gray-600 font-mono">{billNumber}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
              <div className="flex gap-2 mb-4 items-end">
                <div className="relative flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Scan or Search Product</label>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Scan barcode or search product..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    onKeyDown={handleBarcodeEnter}
                    className="w-full px-4 py-2 border rounded"
                  />
                  {scanFlash && (
                    <div className="absolute z-20 -top-2 right-0 translate-y-[-100%] bg-green-600 text-white text-sm px-3 py-1 rounded shadow">
                      ✓ Added: {scanFlash}
                    </div>
                  )}
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-64 overflow-y-auto">
                      {searchResults.map(p => (
                        <button
                          key={p.id}
                          onClick={() => addToCart(p)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 flex justify-between"
                        >
                          <span>{p.name} <span className="text-gray-400 text-sm">({p.sku})</span></span>
                          <span className="text-gray-600">₹{p.selling_price} · {p.current_stock} in stock</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomItemForm(v => !v)}
                  className="px-4 py-2 border rounded hover:bg-gray-50 whitespace-nowrap"
                >
                  + Custom Item
                </button>
              </div>

              {showCustomItemForm && (
                <form onSubmit={handleAddCustomItem} className="border rounded p-4 mb-4 bg-gray-50 grid grid-cols-2 gap-2">
                  <p className="col-span-2 text-xs text-gray-500 -mt-1 mb-1">
                    For a one-off sale that isn't in your product catalog. It won't affect stock or appear in Inventory.
                  </p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Item Name</label>
                    <input required placeholder="e.g. Repair service" value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      className="w-full px-3 py-2 border rounded" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Price</label>
                    <input required type="number" min="0.01" step="0.01" placeholder="0.00" value={customItemPrice}
                      onChange={(e) => setCustomItemPrice(e.target.value)}
                      className="w-full px-3 py-2 border rounded" />
                  </div>
                  <button type="submit" className="col-span-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                    Add to Cart
                  </button>
                </form>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Price</th>
                    <th className="py-2 text-center">Qty</th>
                    <th className="py-2 text-right">Discount</th>
                    <th className="py-2 text-right">Subtotal</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.product_id} className="border-b">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2 text-right">₹{item.unit_price}</td>
                      <td className="py-2 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.product_id, parseInt(e.target.value) || 1)}
                          className="w-16 text-center border rounded"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.discountValue || ''}
                            onChange={(e) => updateItemDiscount(item.product_id, parseFloat(e.target.value) || 0)}
                            className="w-16 text-right border rounded"
                          />
                          <div className="flex border rounded overflow-hidden text-xs">
                            <button
                              type="button"
                              onClick={() => updateItemDiscountType(item.product_id, 'flat')}
                              className={`px-1.5 py-1 ${item.discountType === 'flat' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                            >
                              ₹
                            </button>
                            <button
                              type="button"
                              onClick={() => updateItemDiscountType(item.product_id, 'percent')}
                              className={`px-1.5 py-1 ${item.discountType === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                            >
                              %
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 text-right">₹{item.subtotal.toFixed(2)}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => removeFromCart(item.product_id)} className="text-red-600 hover:underline">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {cart.length === 0 && (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-gray-400">Cart is empty</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg shadow p-6 h-fit">
              <label className="block text-sm text-gray-600 mb-1">Customer</label>

              {selectedCustomer ? (
                <div className="flex items-center justify-between border rounded px-4 py-2 mb-4 bg-gray-50">
                  <div>
                    <p className="font-medium">{selectedCustomer.name}</p>
                    <p className="text-xs text-gray-500">{selectedCustomer.phone}</p>
                  </div>
                  <button onClick={clearCustomer} className="text-gray-400 hover:text-gray-700 text-sm">Change</button>
                </div>
              ) : (
                <div className="relative mb-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name</label>
                      <input
                        type="text"
                        placeholder="Name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-4 py-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input
                        type="text"
                        placeholder="Phone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full px-4 py-2 border rounded"
                      />
                    </div>
                  </div>
                  {customerMatches.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-48 overflow-y-auto">
                      {customerMatches.map(c => (
                        <button
                          key={c.id}
                          onClick={() => selectCustomer(c)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 flex justify-between text-sm"
                        >
                          <span>{c.name}</span>
                          <span className="text-gray-500">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {(nameQuery || phoneQuery) && customerMatches.length === 0 && (
                    <div className="border rounded p-3 mt-1 bg-gray-50">
                      <p className="text-xs text-gray-500 mb-2">
                        No customer found{phoneQuery ? ` for "${customerPhone}"` : ''} - fill in name &amp; phone to register
                      </p>
                      <button
                        type="button"
                        onClick={handleQuickAddCustomer}
                        className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                      >
                        + Add & Select
                      </button>
                    </div>
                  )}
                </div>
              )}

              <label className="block text-sm text-gray-600 mb-1">Discount</label>
              <div className="flex gap-2 mb-4">
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={discount || ''}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="flex-1 px-4 py-2 border rounded"
                />
                <div className="flex border rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDiscountType('flat')}
                    className={`px-3 text-sm ${discountType === 'flat' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                  >
                    ₹
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-3 text-sm ${discountType === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                  >
                    %
                  </button>
                </div>
              </div>
              {discountType === 'percent' && Number(discount) > 0 && (
                <p className="text-xs text-gray-500 -mt-3 mb-4">= ₹{discountAmount.toFixed(2)} off</p>
              )}

              <label className="block text-sm text-gray-600 mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-4 py-2 border rounded mb-4"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="credit">Credit</option>
              </select>

              <div className="border-t pt-4 mb-4">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>₹{cartTotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Discount</span>
                    <span>-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {gstRate > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>GST ({gstRate}%)</span>
                    <span>₹{gstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-2xl font-bold mt-2">
                  <span>Total</span>
                  <span>₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
              {message && (
                <div className="flex items-center justify-between mb-4">
                  <p className="text-green-600 text-sm">{message}</p>
                  {lastInvoiceId && (
                    <button onClick={() => printInvoice(lastInvoiceId)} className="text-blue-600 hover:underline text-sm">
                      Print
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handleCompleteSale}
                className="w-full bg-green-600 text-white py-3 rounded hover:bg-green-700 font-bold"
              >
                Complete Sale
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden mt-8">
            <div className="flex justify-between items-end p-6 pb-0">
              <h2 className="text-xl font-bold">Sales History</h2>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Search</label>
                <input
                  type="text"
                  placeholder="Search by bill # or customer..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="px-4 py-2 border rounded text-sm w-64"
                />
              </div>
            </div>
            <table className="w-full mt-4">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left">Bill #</th>
                  <th className="px-6 py-3 text-left">Customer</th>
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-center">Payment</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map(inv => (
                  <tr key={inv.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-sm">{inv.bill_number}</td>
                    <td className="px-6 py-4">{inv.customer_name || 'Walk-in'}</td>
                    <td className="px-6 py-4">{new Date(inv.invoice_date).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">₹{inv.total_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center capitalize">{inv.payment_mode}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openInvoiceDetail(inv.id)} className="text-blue-600 hover:underline">View</button>
                    </td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && (
                  <tr><td colSpan="6" className="py-8 text-center text-gray-400">
                    {historySearch.trim() ? 'No invoices match your search' : 'No sales yet'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {viewingInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold font-mono">{viewingInvoice.bill_number}</h2>
                <p className="text-sm text-gray-500">{new Date(viewingInvoice.invoice_date).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => printInvoice(viewingInvoice.id)} className="text-blue-600 hover:underline text-sm">Print</button>
                <Link to={`/returns?bill=${viewingInvoice.bill_number}`} className="text-red-600 hover:underline text-sm">Return Items</Link>
                <button onClick={() => setViewingInvoice(null)} className="text-gray-400 hover:text-gray-700">✕</button>
              </div>
            </div>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Product</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {viewingInvoice.items.map(item => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">{item.product_name}</td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-right">₹{item.unit_price}</td>
                    <td className="py-2 text-right">₹{item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Discount</span>
                <span>₹{viewingInvoice.discount_amount.toFixed(2)}</span>
              </div>
              {viewingInvoice.gst_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>GST</span>
                  <span>₹{viewingInvoice.gst_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>₹{viewingInvoice.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 capitalize">
                <span>Payment Mode</span>
                <span>{viewingInvoice.payment_mode}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
