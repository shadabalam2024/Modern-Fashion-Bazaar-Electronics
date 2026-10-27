import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'
import { createScanTracker } from '../../utils/scanTracker'
import useGlobalScanRedirect from '../../hooks/useGlobalScanRedirect'
import { computePurchaseTotals, round2 } from '../../utils/purchaseMath'
import { amountInWords } from '../../utils/amountInWords'
import { inr } from '../../utils/money'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// 2 digits state code + 10-character PAN + entity digit + Z + check character
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/
const money = (n) => `₹${inr(Number(n || 0), 2)}`
const emptyNewProduct = {
  name: '', sku: '', barcode: '', category_id: '', cost_price: '', selling_price: '',
  mrp: '', brand: '', hsn_code: '', color: '', sizes: ''
}

function Field({ label, className = '', children }) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function PurchasePage() {
  const user = useSelector(state => state.auth.user)

  const [suppliers, setSuppliers] = useState([])
  const [purchases, setPurchases] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [supplierBillNo, setSupplierBillNo] = useState('')
  const [supplierGstin, setSupplierGstin] = useState('')
  const [billDate, setBillDate] = useState(todayStr())
  const [items, setItems] = useState([])
  const [discount, setDiscount] = useState('')
  const [gstRate, setGstRate] = useState('')
  const [gstInCost, setGstInCost] = useState(true)
  const [transportCost, setTransportCost] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', gstin: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [importIssues, setImportIssues] = useState([])
  const [scanFlash, setScanFlash] = useState(null)
  const scanTrackerRef = useRef(createScanTracker())
  const [historySearch, setHistorySearch] = useState('')
  const [historySortBy, setHistorySortBy] = useState('newest')
  const [categories, setCategories] = useState([])
  const [showNewProductForm, setShowNewProductForm] = useState(false)
  const [newProductForm, setNewProductForm] = useState(emptyNewProduct)
  const [duplicateBarcodeMatch, setDuplicateBarcodeMatch] = useState(null)
  const [newCategory, setNewCategory] = useState('')
  const [viewingPurchase, setViewingPurchase] = useState(null)
  const [returning, setReturning] = useState(null) // { purchase, qtys: {lineId: qty}, reason }
  const [returnError, setReturnError] = useState('')
  const newProductBarcodeRef = useRef(null)
  const searchInputRef = useRef(null)

  const checkDuplicateBarcode = async (barcode) => {
    if (!barcode.trim()) {
      setDuplicateBarcodeMatch(null)
      return
    }
    const match = await window.ipcRenderer.invoke('get-product-by-barcode', barcode.trim())
    setDuplicateBarcodeMatch(match)
  }

  useEffect(() => {
    if (showNewProductForm) {
      newProductBarcodeRef.current?.focus()
    }
  }, [showNewProductForm])

  const handleBarcodeFieldKeyDown = (e) => {
    // Scanners send Enter after typing the code - don't let that submit the whole form
    if (e.key === 'Enter') e.preventDefault()
  }

  const openPurchaseDetail = async (purchaseId) => {
    const detail = await window.ipcRenderer.invoke('get-purchase', purchaseId)
    setViewingPurchase(detail)
  }

  useEffect(() => {
    loadSuppliers()
    loadPurchases()
    loadCategories()
  }, [])

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return
    const result = await window.ipcRenderer.invoke('add-category', newCategory.trim())
    if (result.success) {
      await loadCategories()
      setNewProductForm(f => ({ ...f, category_id: result.categoryId }))
      setNewCategory('')
    } else {
      setError(result.message)
    }
  }

  const loadCategories = async () => {
    const data = await window.ipcRenderer.invoke('get-categories')
    setCategories(data)
  }

  const loadSuppliers = async () => {
    const data = await window.ipcRenderer.invoke('get-suppliers')
    setSuppliers(data)
  }

  const loadPurchases = async () => {
    const data = await window.ipcRenderer.invoke('get-purchases', { limit: 200 })
    setPurchases(data)
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
  // a scan lands in some other field entirely - e.g. a Supplier or New Product field -
  // because that's what had focus; the redirect hook strips it back out of that field
  // and routes it here instead).
  const processScannedCode = async (code, { scanLike = true } = {}) => {
    setSearchTerm(code)
    const exact = await window.ipcRenderer.invoke('get-product-by-barcode', code)
    if (exact) {
      addItem(exact, true)
      return
    }
    const results = await window.ipcRenderer.invoke('search-product', code)
    if (results.length === 0) {
      setError(`No product found for "${code}"`)
      setSearchResults([])
    } else if (scanLike && results.length === 1) {
      addItem(results[0], true)
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

  const flashScan = (name) => {
    setScanFlash(name)
    setTimeout(() => setScanFlash(current => current === name ? null : current), 1200)
  }

  const addItem = (product, viaScan = false) => {
    setError('')
    if (viaScan) flashScan(product.name)
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        return prev.map(i => i.product_id === product.id
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_cost }
          : i)
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        unit_cost: product.cost_price,
        quantity: 1,
        subtotal: product.cost_price,
        mrp: product.mrp ?? '',
        // left empty until a markup % (or a price) is entered for this purchase
        selling_price: '',
        markup: ''
      }]
    })
    setSearchTerm('')
    setSearchResults([])
  }

  const generateBarcode = async () => {
    const result = await window.ipcRenderer.invoke('get-next-barcodes', { count: 1 })
    if (result.success) {
      setNewProductForm(f => ({ ...f, barcode: result.barcodes[0] }))
      setDuplicateBarcodeMatch(null)
    }
  }

  const resetNewProduct = () => {
    setNewProductForm(emptyNewProduct)
    setDuplicateBarcodeMatch(null)
    setShowNewProductForm(false)
  }

  const handleAddNewProduct = async (e) => {
    e.preventDefault()
    setError('')
    const f = newProductForm

    if (!f.name.trim() || !f.cost_price || !f.selling_price) {
      setError('Name, cost price, and selling price are required for a new product')
      return
    }
    const sizes = f.sizes.split(',').map(s => s.trim()).filter(Boolean)
    const common = {
      category_id: f.category_id || null,
      cost_price: parseFloat(f.cost_price),
      selling_price: parseFloat(f.selling_price),
      mrp: f.mrp === '' ? null : parseFloat(f.mrp),
      brand: f.brand, hsn_code: f.hsn_code, min_stock_level: 5
    }

    if (sizes.length > 0) {
      // One product per size, each with its own barcode and stock
      const result = await window.ipcRenderer.invoke('add-product-variants', { style: f.name.trim(), color: f.color, sizes, ...common })
      if (!result.success) {
        setError(result.message || 'Failed to add products')
        return
      }
      result.products.forEach(p => addItem({ id: p.id, name: p.name, cost_price: p.cost_price, selling_price: p.selling_price, mrp: p.mrp }))
      setMessage(`Added ${result.products.length} sizes - set the quantity for each below`)
      resetNewProduct()
      return
    }

    if (duplicateBarcodeMatch) {
      setError(`Barcode already used by "${duplicateBarcodeMatch.name}"`)
      return
    }
    const result = await window.ipcRenderer.invoke('add-product', {
      name: f.name.trim(),
      sku: f.sku || null,
      barcode: f.barcode || null,
      autoBarcode: true,
      color: f.color,
      current_stock: 0,
      ...common
    })

    if (result.success) {
      addItem({ id: result.productId, name: f.name.trim(), cost_price: common.cost_price, selling_price: common.selling_price, mrp: common.mrp })
      resetNewProduct()
    } else {
      setError(result.message || 'Failed to add product')
    }
  }

  const updateItem = (productId, patch) => {
    setItems(prev => prev.map(i => {
      if (i.product_id !== productId) return i
      const updated = { ...i, ...patch }
      updated.subtotal = Number(updated.quantity || 0) * Number(updated.unit_cost || 0)
      return updated
    }))
  }

  const removeItem = (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId))
  }

  // ---- totals (live preview; the backend recomputes on save)
  const totals = computePurchaseTotals({ items, discount, gstRate, transport: transportCost, gstInCost })
  const landedFor = (index) => totals.landed[index]
  // Selling price shown/saved for a line: derived from landed cost + markup % when a markup is set
  const sellingFor = (item, index) => (
    item.markup !== '' && !Number.isNaN(parseFloat(item.markup))
      ? round2(landedFor(index) * (1 + parseFloat(item.markup) / 100))
      : item.selling_price
  )

  const PURCHASE_SORT_OPTIONS = {
    'newest': { label: 'Newest First', sort: (a, b) => new Date(b.purchase_date) - new Date(a.purchase_date) || b.id - a.id },
    'oldest': { label: 'Oldest First', sort: (a, b) => new Date(a.purchase_date) - new Date(b.purchase_date) || a.id - b.id },
    'amount-desc': { label: 'Highest Amount', sort: (a, b) => b.total_amount - a.total_amount },
    'amount-asc': { label: 'Lowest Amount', sort: (a, b) => a.total_amount - b.total_amount },
    'pending-first': { label: 'Pending First', sort: (a, b) => (a.status === 'received') - (b.status === 'received') }
  }

  const filteredPurchases = purchases
    .filter(p => {
      const q = historySearch.trim().toLowerCase()
      return !q ||
        p.supplier_name.toLowerCase().includes(q) ||
        (p.supplier_bill_no || '').toLowerCase().includes(q) ||
        String(p.id).includes(q)
    })
    .sort(PURCHASE_SORT_OPTIONS[historySortBy].sort)

  const handleAddSupplier = async (e) => {
    e.preventDefault()
    const result = await window.ipcRenderer.invoke('add-supplier', supplierForm)
    if (result.success) {
      await loadSuppliers()
      setSupplierId(String(result.supplierId))
      setSupplierGstin((supplierForm.gstin || '').trim().toUpperCase())
      setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '', gstin: '' })
      setShowSupplierForm(false)
    } else {
      setError(result.message)
    }
  }

  const clearForm = () => {
    setItems([])
    setSupplierId('')
    setSupplierBillNo('')
    setSupplierGstin('')
    setBillDate(todayStr())
    setDiscount('')
    setGstRate('')
    setGstInCost(true)
    setTransportCost('')
    setEditingId(null)
    setImportIssues([])
  }

  const handleSavePurchase = async () => {
    setError('')
    setMessage('')

    if (!supplierId) {
      setError('Select a supplier')
      return
    }
    if (items.length === 0) {
      setError('Add at least one item')
      return
    }

    const gstin = supplierGstin.trim().toUpperCase()
    if (gstin && !GSTIN_PATTERN.test(gstin)) {
      setError('Supplier GST number looks wrong - it should be 15 characters, like 10AMLPA3987H2Z5')
      return
    }

    const payload = {
      purchaseId: editingId,
      supplierId,
      supplierBillNo: supplierBillNo.trim(),
      supplierGstin: gstin,
      billDate,
      discount: totals.discount,
      gstRate: parseFloat(gstRate) || 0,
      gstInCost,
      transportCost: totals.transport,
      items: items.map((i, idx) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
        mrp: i.mrp,
        selling_price: sellingFor(i, idx)
      })),
      userId: user?.id
    }
    const result = await window.ipcRenderer.invoke(editingId ? 'update-purchase' : 'create-purchase', payload)

    if (result.success) {
      setMessage(editingId ? `Purchase order #${result.purchaseId} updated` : `Purchase order #${result.purchaseId} created`)
      clearForm()
      loadPurchases()
    } else {
      setError(result.message || 'Failed to save purchase order')
    }
  }

  const handleReceive = async (purchaseId) => {
    const result = await window.ipcRenderer.invoke('receive-purchase', purchaseId)
    if (result.success) {
      loadPurchases()
      if (viewingPurchase?.id === purchaseId) openPurchaseDetail(purchaseId)
    } else {
      alert(result.message || 'Failed to receive purchase')
    }
  }

  const handleEdit = async (purchaseId) => {
    const p = await window.ipcRenderer.invoke('get-purchase', purchaseId)
    if (!p) return
    setEditingId(p.id)
    setSupplierId(String(p.supplier_id))
    setSupplierBillNo(p.supplier_bill_no || '')
    setSupplierGstin(suppliers.find(x => x.id === p.supplier_id)?.gstin || '')
    setBillDate(p.bill_date || todayStr())
    setDiscount(p.discount_amount ? String(p.discount_amount) : '')
    setGstRate(p.gst_rate ? String(p.gst_rate) : '')
    setGstInCost(!!p.gst_in_cost)
    setTransportCost(p.transport_cost ? String(p.transport_cost) : '')
    setItems(p.items.map(i => ({
      product_id: i.product_id, name: i.product_name, unit_cost: i.unit_cost, quantity: i.quantity, subtotal: i.subtotal,
      mrp: i.mrp ?? '', selling_price: i.selling_price ?? '', markup: ''
    })))
    setError('')
    setMessage('')
    setViewingPurchase(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeletePurchase = async (p) => {
    if (!confirm(`Delete purchase #${p.id} from ${p.supplier_name}? This cannot be undone.`)) return
    const result = await window.ipcRenderer.invoke('delete-purchase', p.id)
    if (result.success) {
      if (editingId === p.id) clearForm()
      loadPurchases()
    } else {
      alert(result.message || 'Failed to delete purchase')
    }
  }

  const reportOutput = async (channel, arg, successText) => {
    setError('')
    const result = await window.ipcRenderer.invoke(channel, arg)
    if (!result.success && !result.canceled) setError(result.message || 'Something went wrong')
    else if (result.success && successText) setMessage(typeof successText === 'function' ? successText(result) : successText)
    return result
  }

  const handlePrintPurchase = (id) => reportOutput('print-purchase', id)
  const handlePrintList = () => reportOutput('print-purchase-list', {
    purchaseIds: filteredPurchases.map(p => p.id),
    filterLabel: historySearch.trim()
  })
  const handlePrintLabels = (purchase) => reportOutput(
    'print-labels',
    { items: purchase.items.map(i => ({ productId: i.product_id, count: i.quantity })) },
    (r) => r.assigned ? `${r.assigned} product(s) had no barcode, so one was assigned automatically` : ''
  )

  const handleImport = async () => {
    setError('')
    setMessage('')
    setImportIssues([])
    const result = await window.ipcRenderer.invoke('import-purchase-excel')
    if (result.canceled) return
    if (!result.success) {
      setError(result.message || 'Import failed')
      return
    }
    result.rows.forEach(row => {
      setItems(prev => {
        const existing = prev.find(i => i.product_id === row.product_id)
        const base = {
          product_id: row.product_id, name: row.name, unit_cost: row.unit_cost,
          mrp: row.mrp ?? '', selling_price: row.selling_price ?? '', markup: ''
        }
        if (existing) {
          const quantity = existing.quantity + row.quantity
          return prev.map(i => i.product_id === row.product_id ? { ...i, ...base, quantity, subtotal: quantity * row.unit_cost } : i)
        }
        return [...prev, { ...base, quantity: row.quantity, subtotal: row.quantity * row.unit_cost }]
      })
    })
    setMessage(`Imported ${result.rows.length} item(s)${result.unmatched.length ? `, skipped ${result.unmatched.length}` : ''}`)
    setImportIssues(result.unmatched)
  }

  const handleTemplate = async () => {
    const result = await window.ipcRenderer.invoke('download-purchase-template')
    if (result.success) setMessage(`Template saved to ${result.filePath}`)
    else if (!result.canceled) setError(result.message || 'Could not save the template')
  }

  const openReturn = (purchase) => {
    setReturning({ purchase, qtys: {}, reason: '' })
    setReturnError('')
  }

  const handleSubmitReturn = async (e) => {
    e.preventDefault()
    setReturnError('')
    const result = await window.ipcRenderer.invoke('create-purchase-return', {
      purchaseId: returning.purchase.id,
      reason: returning.reason,
      userId: user?.id,
      items: Object.entries(returning.qtys).map(([purchase_item_id, quantity]) => ({ purchase_item_id: Number(purchase_item_id), quantity: Number(quantity) }))
    })
    if (result.success) {
      const id = returning.purchase.id
      setReturning(null)
      setMessage(`Return recorded for purchase #${id}`)
      openPurchaseDetail(id)
      loadPurchases()
    } else {
      setReturnError(result.message || 'Failed to record the return')
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6">Purchase</h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editingId ? `Edit Purchase Order #${editingId}` : 'New Purchase Order'}</h2>
                <div className="flex gap-3 text-sm">
                  <button type="button" onClick={handleImport} className="text-blue-600 hover:underline">Import from Excel</button>
                  <button type="button" onClick={handleTemplate} className="text-gray-500 hover:underline">Download template</button>
                </div>
              </div>
              {editingId && (
                <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm rounded px-3 py-2 mb-4 flex justify-between">
                  <span>You are editing a pending purchase. Saving replaces its items and amounts.</span>
                  <button type="button" onClick={clearForm} className="underline">Cancel edit</button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                <Field label="Supplier" className="md:col-span-3">
                  <div className="flex gap-2">
                    <select
                      value={supplierId}
                      onChange={(e) => {
                        setSupplierId(e.target.value)
                        setSupplierGstin(suppliers.find(x => String(x.id) === e.target.value)?.gstin || '')
                      }}
                      className="flex-1 px-4 py-2 border rounded"
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowSupplierForm(v => !v)}
                      className="px-4 py-2 border rounded hover:bg-gray-50"
                    >
                      + Supplier
                    </button>
                  </div>
                </Field>
                <Field label="Supplier GST No (optional)" className="md:col-span-3">
                  <input
                    placeholder="e.g. 10AMLPA3987H2Z5" maxLength={15}
                    value={supplierGstin} onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2 border rounded font-mono"
                  />
                </Field>
                <Field label="Supplier Bill No" className="md:col-span-2">
                  <input
                    placeholder="Number on the supplier's bill"
                    value={supplierBillNo} onChange={(e) => setSupplierBillNo(e.target.value)}
                    className="w-full px-4 py-2 border rounded"
                  />
                </Field>
                <Field label="Bill Date">
                  <input
                    type="date" max={todayStr()}
                    value={billDate} onChange={(e) => e.target.value && setBillDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded"
                  />
                </Field>
              </div>

              {showSupplierForm && (
                <form onSubmit={handleAddSupplier} className="border rounded p-4 mb-4 bg-gray-50 grid grid-cols-2 gap-2">
                  <Field label="Supplier Name" className="col-span-2">
                    <input required placeholder="Supplier Name" value={supplierForm.name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="Contact Person">
                    <input placeholder="Contact Person" value={supplierForm.contact_person}
                      onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="Phone">
                    <input placeholder="Phone" value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="Email">
                    <input placeholder="Email" value={supplierForm.email}
                      onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="GST Number (optional)">
                    <input placeholder="GST Number (optional)" maxLength={15} value={supplierForm.gstin}
                      onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2 border rounded font-mono" />
                  </Field>
                  <Field label="Address" className="col-span-2">
                    <input placeholder="Address" value={supplierForm.address}
                      onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <button type="submit" className="col-span-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                    Save Supplier
                  </button>
                </form>
              )}

              <div className="flex gap-2 mb-4 mt-2 items-end">
                <Field label="Add Product (scan barcode or search)" className="relative flex-1">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Scan barcode or search product to add..."
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
                          onClick={() => addItem(p)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 flex justify-between"
                        >
                          <span>{p.name} <span className="text-gray-400 text-sm">({p.barcode || p.sku})</span></span>
                          <span className="text-gray-600">Cost ₹{inr(p.cost_price)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
                <button
                  type="button"
                  onClick={() => setShowNewProductForm(v => !v)}
                  className="px-4 py-2 border rounded hover:bg-gray-50 whitespace-nowrap"
                >
                  + New Product
                </button>
              </div>

              {showNewProductForm && (
                <form onSubmit={handleAddNewProduct} className="border rounded p-4 mb-4 bg-gray-50 grid grid-cols-2 gap-2">
                  <Field label="Product Name" className="col-span-2">
                    <input required placeholder="Product Name" value={newProductForm.name}
                      onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="Sizes (optional, comma separated)" className="col-span-2">
                    <input placeholder="e.g. S, M, L, XL  or  28, 30, 32 - makes one product per size" value={newProductForm.sizes}
                      onChange={(e) => setNewProductForm({ ...newProductForm, sizes: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                    {newProductForm.sizes.trim() && (
                      <p className="text-xs text-gray-500 mt-1">Each size becomes its own product with its own barcode and stock. SKU and barcode below are not used.</p>
                    )}
                  </Field>
                  <Field label="Colour (optional)">
                    <input placeholder="e.g. Blue" value={newProductForm.color}
                      onChange={(e) => setNewProductForm({ ...newProductForm, color: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="Brand (optional)">
                    <input placeholder="Brand" value={newProductForm.brand}
                      onChange={(e) => setNewProductForm({ ...newProductForm, brand: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="SKU">
                    <input placeholder="SKU" value={newProductForm.sku}
                      onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="Barcode (scan, type, or leave blank to auto-assign)">
                    <div className="flex gap-2">
                      <input
                        ref={newProductBarcodeRef}
                        placeholder="Scan barcode..." value={newProductForm.barcode}
                        onChange={(e) => { setNewProductForm({ ...newProductForm, barcode: e.target.value }); checkDuplicateBarcode(e.target.value) }}
                        onKeyDown={handleBarcodeFieldKeyDown}
                        className={`flex-1 min-w-0 px-3 py-2 border rounded ${duplicateBarcodeMatch ? 'border-red-500' : ''}`} />
                      <button type="button" onClick={generateBarcode} className="px-2 border rounded text-xs hover:bg-gray-100">Generate</button>
                    </div>
                    {duplicateBarcodeMatch && (
                      <div className="text-xs mt-1">
                        <p className="text-red-600">Already used by "{duplicateBarcodeMatch.name}"</p>
                        <button
                          type="button"
                          onClick={() => { addItem(duplicateBarcodeMatch); resetNewProduct() }}
                          className="text-blue-600 hover:underline"
                        >
                          Add "{duplicateBarcodeMatch.name}" to order instead
                        </button>
                      </div>
                    )}
                  </Field>
                  <Field label="Category" className="col-span-2">
                    <select value={newProductForm.category_id}
                      onChange={(e) => setNewProductForm({ ...newProductForm, category_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded mb-2">
                      <option value="">No Category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <label className="block text-xs text-gray-500 mb-1">New Category</label>
                    <div className="flex gap-2">
                      <input
                        type="text" placeholder="New category name"
                        value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded text-sm"
                      />
                      <button type="button" onClick={handleAddCategory} className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
                        Add
                      </button>
                    </div>
                  </Field>
                  <Field label="Cost Price">
                    <input required type="number" min="0" step="0.01" placeholder="Cost Price" value={newProductForm.cost_price}
                      onChange={(e) => setNewProductForm({ ...newProductForm, cost_price: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="Selling Price">
                    <input required type="number" min="0" step="0.01" placeholder="Selling Price" value={newProductForm.selling_price}
                      onChange={(e) => setNewProductForm({ ...newProductForm, selling_price: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="MRP (optional)">
                    <input type="number" min="0" step="0.01" placeholder="MRP" value={newProductForm.mrp}
                      onChange={(e) => setNewProductForm({ ...newProductForm, mrp: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="HSN Code (optional)">
                    <input placeholder="HSN" value={newProductForm.hsn_code}
                      onChange={(e) => setNewProductForm({ ...newProductForm, hsn_code: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <button
                    type="submit"
                    disabled={!newProductForm.sizes.trim() && !!duplicateBarcodeMatch}
                    className="col-span-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {newProductForm.sizes.trim() ? 'Add Sizes & Include in Order' : 'Add & Include in Order'}
                  </button>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-1 text-left">Product</th>
                      <th className="py-2 px-1 text-center">Qty</th>
                      <th className="py-2 px-1 text-center">Unit Cost</th>
                      <th className="py-2 px-1 text-center" title="GST on this item, per unit (from the GST % in the summary)">GST</th>
                      <th className="py-2 px-1 text-center" title="Transport cost shared by value, per unit">Transport</th>
                      <th className="py-2 px-1 text-center" title="Unit cost + GST + transport (less this item's share of any discount)">Landed Cost</th>
                      <th className="py-2 px-1 text-center">MRP</th>
                      <th className="py-2 px-1 text-center" title="Markup on the landed cost; fills in the selling price">Markup %</th>
                      <th className="py-2 px-1 text-center">Selling</th>
                      <th className="py-2 px-1 text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.product_id} className="border-b">
                        <td className="py-2 pr-2 text-left">{item.name}</td>
                        <td className="py-2 text-center">
                          <input type="number" min="1" value={item.quantity}
                            onChange={(e) => updateItem(item.product_id, { quantity: parseInt(e.target.value) || 1 })}
                            className="w-16 text-center border rounded" />
                        </td>
                        <td className="py-2 text-center">
                          <input type="number" min="0" step="0.01" value={item.unit_cost}
                            onChange={(e) => updateItem(item.product_id, { unit_cost: parseFloat(e.target.value) || 0 })}
                            className="w-24 text-center border rounded" />
                        </td>
                        <td className="py-2 text-center text-gray-600">{money(totals.gstPerUnit[idx])}</td>
                        <td className="py-2 text-center text-gray-600">{money(totals.transportPerUnit[idx])}</td>
                        <td className="py-2 text-center text-blue-700 font-medium">{money(landedFor(idx))}</td>
                        <td className="py-2 text-center">
                          <input type="number" min="0" step="0.01" value={item.mrp}
                            onChange={(e) => updateItem(item.product_id, { mrp: e.target.value })}
                            className="w-20 text-center border rounded" />
                        </td>
                        <td className="py-2 text-center">
                          <input type="number" min="0" step="0.1" value={item.markup} placeholder="%"
                            onChange={(e) => updateItem(item.product_id, { markup: e.target.value })}
                            className="w-16 text-center border rounded" />
                        </td>
                        <td className="py-2 text-center">
                          <input type="number" min="0" step="0.01" value={sellingFor(item, idx)} placeholder="set markup"
                            onChange={(e) => updateItem(item.product_id, { selling_price: e.target.value, markup: '' })}
                            className="w-24 text-center border rounded" />
                        </td>
                        <td className="py-2 text-center">
                          <button onClick={() => removeItem(item.product_id)} className="text-red-600 hover:underline">Remove</button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr><td colSpan="10" className="py-6 text-center text-gray-400">No items added</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {items.length > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  Landed cost = unit cost + GST + transport per unit (less the item's share of any discount). GST is only counted while "add it to the item cost" is ticked below the GST %. A markup % sets the selling price from it. MRP and selling price update the product when the purchase is received.
                </p>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6 h-fit">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Items total</span>
                <span>{money(totals.itemsTotal)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Discount (₹)">
                  <input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={discount} onChange={(e) => setDiscount(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  />
                </Field>
                <Field label="GST %">
                  <input
                    type="number" min="0" step="0.01" placeholder="0"
                    value={gstRate} onChange={(e) => setGstRate(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  />
                </Field>
              </div>
              {totals.gstAmount > 0 && (
                <label className="flex items-start gap-2 text-xs text-gray-600 mb-3">
                  <input type="checkbox" checked={gstInCost} onChange={(e) => setGstInCost(e.target.checked)} className="mt-0.5" />
                  <span>I can't claim this GST back - add it to the item cost</span>
                </label>
              )}
              <Field label="Transport cost (shared across items by value)" className="mb-3">
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={transportCost}
                  onChange={(e) => setTransportCost(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </Field>
              <div className="text-sm text-gray-600 space-y-1 mb-3">
                {totals.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{money(totals.discount)}</span></div>}
                {totals.gstAmount > 0 && <div className="flex justify-between"><span>GST ({gstRate}%)</span><span>{money(totals.gstAmount)}</span></div>}
                {totals.transport > 0 && <div className="flex justify-between"><span>Transport</span><span>{money(totals.transport)}</span></div>}
                {totals.roundOff !== 0 && <div className="flex justify-between"><span>Round off</span><span>{totals.roundOff > 0 ? '+' : '-'}{money(Math.abs(totals.roundOff))}</span></div>}
              </div>
              <div className="flex justify-between text-2xl font-bold border-t pt-3">
                <span>Total</span>
                <span>{money(totals.grandTotal)}</span>
              </div>
              {totals.grandTotal > 0 && <p className="text-xs text-gray-500 mt-1 mb-4">{amountInWords(totals.grandTotal)}</p>}
              {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
              {message && <p className="text-green-600 mb-4 text-sm">{message}</p>}
              {importIssues.length > 0 && (
                <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 mb-4 max-h-32 overflow-y-auto">
                  <p className="font-medium mb-1">Skipped rows:</p>
                  {importIssues.map((r, i) => <p key={i}>Row {r.row} ({r.label}): {r.reason}</p>)}
                </div>
              )}
              <button
                onClick={handleSavePurchase}
                className="w-full bg-green-600 text-white py-3 rounded hover:bg-green-700 font-bold"
              >
                {editingId ? 'Save Changes' : 'Create Purchase Order'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="flex justify-between items-end p-6 pb-0">
              <h2 className="text-xl font-bold">Purchase History</h2>
              <div className="flex gap-4 items-end">
                <Field label="Search">
                  <input
                    type="text"
                    placeholder="Supplier, bill no or #..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="px-4 py-2 border rounded text-sm w-64"
                  />
                </Field>
                <Field label="Sort By">
                  <select
                    value={historySortBy}
                    onChange={(e) => setHistorySortBy(e.target.value)}
                    className="px-4 py-2 border rounded text-sm"
                  >
                    {Object.entries(PURCHASE_SORT_OPTIONS).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </Field>
                <button
                  onClick={handlePrintList}
                  disabled={filteredPurchases.length === 0}
                  className="border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Print Summary
                </button>
              </div>
            </div>
            <table className="w-full mt-4">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left">#</th>
                  <th className="px-6 py-3 text-left">Supplier</th>
                  <th className="px-6 py-3 text-left">Bill No</th>
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map(p => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4">{p.id}</td>
                    <td className="px-6 py-4">{p.supplier_name}</td>
                    <td className="px-6 py-4 text-gray-500">{p.supplier_bill_no || '-'}</td>
                    <td className="px-6 py-4">{new Date(p.purchase_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">{money(p.total_amount)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => openPurchaseDetail(p.id)} className="text-blue-600 hover:underline">View</button>
                      <button onClick={() => handlePrintPurchase(p.id)} className="text-blue-600 hover:underline">Print</button>
                      {p.status !== 'received' && (
                        <>
                          <button onClick={() => handleEdit(p.id)} className="text-blue-600 hover:underline">Edit</button>
                          <button onClick={() => handleReceive(p.id)} className="text-blue-600 hover:underline">Receive</button>
                          <button onClick={() => handleDeletePurchase(p)} className="text-red-600 hover:underline">Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredPurchases.length === 0 && (
                  <tr><td colSpan="7" className="py-8 text-center text-gray-400">
                    {historySearch.trim() ? 'No purchases match your search' : 'No purchases yet'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {viewingPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Purchase #{viewingPurchase.id}</h2>
                <p className="text-sm text-gray-500">
                  {viewingPurchase.supplier_name} · {new Date(viewingPurchase.purchase_date).toLocaleString()}
                </p>
                {viewingPurchase.supplier_gstin && (
                  <p className="text-sm text-gray-500">Supplier GSTIN: <span className="font-mono">{viewingPurchase.supplier_gstin}</span></p>
                )}
                {(viewingPurchase.supplier_bill_no || viewingPurchase.bill_date) && (
                  <p className="text-sm text-gray-500">
                    Supplier bill {viewingPurchase.supplier_bill_no || '-'}
                    {viewingPurchase.bill_date ? ` · ${new Date(viewingPurchase.bill_date + 'T00:00:00').toLocaleDateString()}` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setViewingPurchase(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-1">Product</th>
                    <th className="py-2 px-1 text-center">Qty</th>
                    <th className="py-2 px-1 text-right">Unit Cost</th>
                    <th className="py-2 px-1 text-right">Landed Cost</th>
                    <th className="py-2 px-1 text-right">MRP</th>
                    <th className="py-2 px-1 text-right">Selling</th>
                    <th className="py-2 px-1 text-right">Subtotal</th>
                    <th className="py-2 px-1 text-center">Returned</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingPurchase.items.map(item => (
                    <tr key={item.id} className="border-b">
                      <td className="py-2">{item.product_name}<div className="text-xs text-gray-400">{item.barcode || item.sku}</div></td>
                      <td className="py-2 text-center">{item.quantity}</td>
                      <td className="py-2 text-right">{money(item.unit_cost)}</td>
                      <td className="py-2 text-right">{money(item.landed_unit_cost ?? item.unit_cost)}</td>
                      <td className="py-2 text-right">{item.mrp != null ? money(item.mrp) : '-'}</td>
                      <td className="py-2 text-right">{item.selling_price != null ? money(item.selling_price) : '-'}</td>
                      <td className="py-2 text-right">{money(item.subtotal)}</td>
                      <td className="py-2 text-center">{item.returned_qty || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t pt-3 space-y-1 max-w-sm ml-auto">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Items total</span>
                <span>{money(viewingPurchase.items.reduce((t, i) => t + i.subtotal, 0))}</span>
              </div>
              {viewingPurchase.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-600"><span>Discount</span><span>-{money(viewingPurchase.discount_amount)}</span></div>
              )}
              {viewingPurchase.gst_amount > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>GST ({viewingPurchase.gst_rate}%){viewingPurchase.gst_in_cost ? ' - in cost' : ''}</span>
                  <span>{money(viewingPurchase.gst_amount)}</span>
                </div>
              )}
              {viewingPurchase.transport_cost > 0 && (
                <div className="flex justify-between text-sm text-gray-600"><span>Transport</span><span>{money(viewingPurchase.transport_cost)}</span></div>
              )}
              {viewingPurchase.round_off ? (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Round off</span><span>{viewingPurchase.round_off > 0 ? '+' : '-'}{money(Math.abs(viewingPurchase.round_off))}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{money(viewingPurchase.total_amount)}</span>
              </div>
              <p className="text-xs text-gray-500">{amountInWords(viewingPurchase.total_amount)}</p>
              <div className="flex justify-between text-sm text-gray-600 capitalize">
                <span>Status</span>
                <span>{viewingPurchase.status}</span>
              </div>
            </div>

            {viewingPurchase.returns.length > 0 && (
              <div className="mt-4 text-sm">
                <p className="font-medium mb-1">Returned to supplier</p>
                {viewingPurchase.returns.map(r => (
                  <div key={r.id} className="flex justify-between text-gray-600">
                    <span>{new Date(r.return_date).toLocaleDateString()}{r.reason ? ` - ${r.reason}` : ''}</span>
                    <span>{money(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t">
              <button onClick={() => handlePrintPurchase(viewingPurchase.id)} className="border px-4 py-2 rounded hover:bg-gray-50 text-sm">Print</button>
              <button onClick={() => handlePrintLabels(viewingPurchase)} className="border px-4 py-2 rounded hover:bg-gray-50 text-sm">Print Barcode Labels</button>
              {viewingPurchase.status !== 'received' && (
                <>
                  <button onClick={() => handleEdit(viewingPurchase.id)} className="border px-4 py-2 rounded hover:bg-gray-50 text-sm">Edit</button>
                  <button onClick={() => handleReceive(viewingPurchase.id)} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm">Receive</button>
                </>
              )}
              {viewingPurchase.status === 'received' && viewingPurchase.items.some(i => i.quantity - (i.returned_qty || 0) > 0) && (
                <button onClick={() => openReturn(viewingPurchase)} className="border border-red-300 text-red-600 px-4 py-2 rounded hover:bg-red-50 text-sm">Return to Supplier</button>
              )}
            </div>
          </div>
        </div>
      )}

      {returning && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-30">
          <form onSubmit={handleSubmitReturn} className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-1">Return to Supplier</h2>
            <p className="text-sm text-gray-500 mb-4">Purchase #{returning.purchase.id} · {returning.purchase.supplier_name}. Stock goes down and the refund shows in the Ledger as money in.</p>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-1">Product</th>
                  <th className="py-2 px-1 text-center">Can return</th>
                  <th className="py-2 px-1 text-right">Return qty</th>
                </tr>
              </thead>
              <tbody>
                {returning.purchase.items.filter(i => i.quantity - (i.returned_qty || 0) > 0).map(i => {
                  const remaining = i.quantity - (i.returned_qty || 0)
                  return (
                    <tr key={i.id} className="border-b">
                      <td className="py-2">{i.product_name}</td>
                      <td className="py-2 text-center">{remaining}</td>
                      <td className="py-2 text-right">
                        <input
                          type="number" min="0" max={remaining} placeholder="0"
                          value={returning.qtys[i.id] ?? ''}
                          onChange={(e) => setReturning(r => ({ ...r, qtys: { ...r.qtys, [i.id]: e.target.value } }))}
                          className="w-20 text-right border rounded px-2 py-1"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Field label="Reason (optional)" className="mb-4">
              <input
                value={returning.reason}
                onChange={(e) => setReturning(r => ({ ...r, reason: e.target.value }))}
                className="w-full px-3 py-2 border rounded"
              />
            </Field>
            {returnError && <p className="text-red-500 text-sm mb-3">{returnError}</p>}
            <div className="flex gap-3">
              <button type="submit" className="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700">Record Return</button>
              <button type="button" onClick={() => setReturning(null)} className="flex-1 border py-2 rounded hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
