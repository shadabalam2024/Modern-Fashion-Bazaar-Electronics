import { useState, useEffect, useRef } from 'react'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'
import { inr } from '../../utils/money'
import { COMMON_ITEMS, COMMON_COLORS, COMMON_SIZES, mergeSuggestions } from '../../utils/suggestions'

const emptyForm = {
  name: '', sku: '', barcode: '', category_id: '',
  cost_price: '', selling_price: '', current_stock: '', min_stock_level: '5',
  mrp: '', brand: '', season: '', hsn_code: '', size: '', color: '', item_name: '', style_name: ''
}

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [newCategory, setNewCategory] = useState('')
  const [adjustingProduct, setAdjustingProduct] = useState(null)
  const [adjustStock, setAdjustStock] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [brandFilter, setBrandFilter] = useState('') // '' = all brands
  const [categoryFilter, setCategoryFilter] = useState('') // '' = all categories
  const [itemFilter, setItemFilter] = useState('') // '' = all items (Fridge, Iron ...)
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState(false)
  const [viewingHistoryFor, setViewingHistoryFor] = useState(null)
  const [priceHistory, setPriceHistory] = useState(null)
  const [labelTarget, setLabelTarget] = useState(null) // { title, products: [...], count }
  const [labelMessage, setLabelMessage] = useState('')
  const barcodeInputRef = useRef(null)

  useEffect(() => {
    loadProducts()
    loadCategories()
  }, [])

  useEffect(() => {
    if (showForm && !editingId) {
      barcodeInputRef.current?.focus()
    }
  }, [showForm, editingId])

  const handleBarcodeFieldKeyDown = (e) => {
    // Scanners send Enter after typing the code - don't let that submit the whole form
    if (e.key === 'Enter') e.preventDefault()
  }

  const handleExportCsv = async () => {
    setExportMessage('')
    const result = await window.ipcRenderer.invoke('export-inventory-excel')
    if (result.success) {
      setExportError(false)
      setExportMessage(`Exported to ${result.filePath}`)
      setTimeout(() => setExportMessage(''), 5000)
    } else if (!result.canceled) {
      setExportError(true)
      setExportMessage(result.message || 'Export failed')
    }
  }

  const handlePrint = async () => {
    setExportMessage('')
    const result = await window.ipcRenderer.invoke('print-inventory', {
      productIds: filteredProducts.map(p => p.id),
      filterLabel: [search.trim(), brandFilter && `brand ${brandFilter}`, categoryFilter && `category ${categoryFilter}`, itemFilter && `item ${itemFilter}`].filter(Boolean).join(', ')
    })
    if (!result.success) {
      setExportError(true)
      setExportMessage(result.message || 'Could not open the print preview')
    }
  }

  const openLabels = (title, products) => {
    setLabelMessage('')
    setLabelTarget({ title, products, count: '1' })
  }

  const handlePrintLabels = async (e) => {
    e.preventDefault()
    const count = parseInt(labelTarget.count)
    if (!(count > 0)) return
    const result = await window.ipcRenderer.invoke('print-labels', {
      items: labelTarget.products.map(p => ({ productId: p.id, count }))
    })
    if (result.success) {
      setLabelTarget(null)
      if (result.assigned) {
        setExportError(false)
        setExportMessage(`${result.assigned} product(s) had no barcode, so one was assigned automatically`)
        setTimeout(() => setExportMessage(''), 6000)
        loadProducts()
      }
    } else {
      setLabelMessage(result.message || 'Could not print the labels')
    }
  }

  const generateBarcode = async () => {
    const result = await window.ipcRenderer.invoke('get-next-barcodes', { count: 1 })
    if (result.success) setForm(f => ({ ...f, barcode: result.barcodes[0] }))
  }

  const openPriceHistory = async (product) => {
    setViewingHistoryFor(product)
    const history = await window.ipcRenderer.invoke('get-cost-price-history', product.id)
    setPriceHistory(history)
  }

  const loadProducts = async () => {
    const data = await window.ipcRenderer.invoke('get-products')
    setProducts(data)
  }

  const loadCategories = async () => {
    const data = await window.ipcRenderer.invoke('get-categories')
    setCategories(data)
  }

  const openAddForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  const openEditForm = (product) => {
    setForm({
      name: product.name,
      sku: product.sku || '',
      barcode: product.barcode || '',
      category_id: product.category_id || '',
      cost_price: product.cost_price,
      selling_price: product.selling_price,
      current_stock: product.current_stock,
      min_stock_level: product.min_stock_level,
      mrp: product.mrp ?? '', brand: product.brand || '', season: product.season || '',
      hsn_code: product.hsn_code || '', size: product.size || '', color: product.color || '', item_name: product.item_name || '', style_name: product.style_name || ''
    })
    setEditingId(product.id)
    setError('')
    setShowForm(true)
  }

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return
    const result = await window.ipcRenderer.invoke('add-category', newCategory.trim())
    if (result.success) {
      await loadCategories()
      setForm(f => ({ ...f, category_id: result.categoryId }))
      setNewCategory('')
    } else {
      setError(result.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const payload = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      category_id: form.category_id || null,
      cost_price: parseFloat(form.cost_price),
      selling_price: parseFloat(form.selling_price),
      current_stock: parseInt(form.current_stock) || 0,
      min_stock_level: parseInt(form.min_stock_level) || 5,
      mrp: form.mrp === '' ? null : parseFloat(form.mrp),
      brand: form.brand, season: form.season, hsn_code: form.hsn_code, size: form.size, color: form.color, item_name: form.item_name, style_name: form.style_name,
      autoBarcode: !editingId // a new product with no barcode gets the next number
    }

    const result = editingId
      ? await window.ipcRenderer.invoke('update-product', { id: editingId, ...payload })
      : await window.ipcRenderer.invoke('add-product', payload)

    if (result.success) {
      setShowForm(false)
      loadProducts()
    } else {
      setError(result.message || 'Failed to save product')
    }
  }

  const handleDelete = async (product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    const result = await window.ipcRenderer.invoke('delete-product', product.id)
    if (result.success) {
      loadProducts()
    } else {
      alert(result.message || 'Failed to delete product')
    }
  }

  const openAdjustStock = (product) => {
    setAdjustingProduct(product)
    setAdjustStock(String(product.current_stock))
    setAdjustReason('')
  }

  const handleAdjustStock = async (e) => {
    e.preventDefault()
    const result = await window.ipcRenderer.invoke('adjust-stock', {
      productId: adjustingProduct.id,
      newStock: parseInt(adjustStock) || 0,
      reason: adjustReason
    })
    if (result.success) {
      setAdjustingProduct(null)
      loadProducts()
    } else {
      alert(result.message || 'Failed to adjust stock')
    }
  }

  const SORT_OPTIONS = {
    'stock-desc': { label: 'Most in Stock', sort: (a, b) => b.current_stock - a.current_stock },
    'stock-asc': { label: 'Least in Stock', sort: (a, b) => a.current_stock - b.current_stock },
    'recent': { label: 'Recently Stocked', sort: (a, b) => (b.stocked_at || '').localeCompare(a.stocked_at || '') || b.id - a.id },
    // ids are handed out in the order products are added, so they are the most reliable "added" order
    'newest': { label: 'Newest Added', sort: (a, b) => b.id - a.id },
    'oldest': { label: 'Oldest Added', sort: (a, b) => a.id - b.id },
    'name': { label: 'Name (A-Z)', sort: (a, b) => a.name.localeCompare(b.name) }
  }

  // the choices in the two filters come from the products themselves
  const brandOptions = [...new Set(products.map(p => (p.brand || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const itemOptions = [...new Set(products.map(p => (p.item_name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const itemSuggestions = mergeSuggestions([...itemOptions, ...categories.map(c => c.name)], COMMON_ITEMS)
  const sizeOptions = [...new Set(products.map(p => (p.size || '').trim()).filter(Boolean))]
  const colorOptions = [...new Set(products.map(p => (p.color || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const categoryOptions = [...new Set(products.map(p => p.category_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))

  const filteredProducts = products
    .filter(p => !brandFilter || (p.brand || '').trim() === brandFilter)
    .filter(p => !categoryFilter || p.category_name === categoryFilter)
    .filter(p => !itemFilter || (p.item_name || '').trim() === itemFilter)
    .filter(p => {
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return p.name.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
    })
    .sort(SORT_OPTIONS[sortBy].sort)

  // Worth of the stock shown in the list: units x cost / landed cost / selling price.
  // A product never bought through Purchase has no landed cost yet, so its cost price stands in.
  // "Cost" in this list is the supplier's plain unit price from the latest received purchase (what the
  // Purchase screen calls Unit Cost); products never bought through Purchase show their own cost price.
  const unitCostOf = (p) => p.last_unit_cost ?? p.cost_price
  const totals = filteredProducts.reduce((t, p) => ({
    units: t.units + p.current_stock,
    cost: t.cost + p.current_stock * unitCostOf(p),
    landed: t.landed + p.current_stock * (p.landed_cost ?? p.cost_price),
    price: t.price + p.current_stock * p.selling_price
  }), { units: 0, cost: 0, landed: 0, price: 0 })

  const duplicateBarcode = form.barcode.trim()
    ? products.find(p => p.barcode === form.barcode.trim() && p.id !== editingId)
    : null
  const duplicateSku = form.sku.trim()
    ? products.find(p => p.sku === form.sku.trim() && p.id !== editingId)
    : null

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Navbar />
        <div className="p-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h1 className="text-3xl font-bold">Inventory</h1>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handlePrint}
                disabled={filteredProducts.length === 0}
                className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Print
              </button>
              <button
                onClick={() => openLabels(`${filteredProducts.length} product(s) shown`, filteredProducts)}
                disabled={filteredProducts.length === 0}
                className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Barcode Labels
              </button>
              <button
                onClick={handleExportCsv}
                className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
              >
                Export to Excel
              </button>
              <button
                onClick={openAddForm}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                + Add Product
              </button>
            </div>
          </div>
          {exportMessage && <p className={`text-sm mb-4 ${exportError ? 'text-red-600' : 'text-green-600'}`}>{exportMessage}</p>}

          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[12rem] max-w-sm">
              <label className="block text-xs text-gray-500 mb-1">Search</label>
              <input
                type="text"
                placeholder="Search by name, SKU, or barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Brand</label>
              <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="px-4 py-2 border rounded">
                <option value="">All brands</option>
                {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2 border rounded">
                <option value="">All categories</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Item</label>
              <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="px-4 py-2 border rounded max-w-[14rem]">
                <option value="">All items</option>
                {itemOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border rounded"
              >
                {Object.entries(SORT_OPTIONS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-auto max-h-[calc(100vh-12rem)]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-[1] bg-gray-100 border-b">
                <tr>
                  <th className="px-3 py-3 text-left">Product</th>
                  <th className="px-3 py-3 text-left">Brand</th>
                  <th className="px-3 py-3 text-left">SKU</th>
                  <th className="px-3 py-3 text-left">Category</th>
                  <th className="px-3 py-3 text-right">Stock</th>
                  <th className="px-3 py-3 text-right" title="Supplier price per unit from the latest received purchase (Unit Cost in Purchase)">Cost</th>
                  <th className="px-3 py-3 text-right" title="Landed cost (cost + GST + transport, less discount) of the latest received purchase">Landed</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => (
                  <tr key={p.id} className={`border-b hover:bg-gray-50 ${p.current_stock <= p.min_stock_level ? 'bg-orange-50' : ''}`}>
                    <td className="px-3 py-3">{p.name}</td>
                    <td className="px-3 py-3 text-gray-500">{p.brand || '-'}</td>
                    <td className="px-3 py-3 text-gray-500">{p.sku}</td>
                    <td className="px-3 py-3 text-gray-500">{p.category_name || '-'}</td>
                    <td className={`px-3 py-3 text-right ${p.current_stock <= p.min_stock_level ? 'text-orange-600 font-bold' : ''}`}>
                      {p.current_stock}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => openPriceHistory(p)} className="text-blue-600 hover:underline">
                        ₹{inr(unitCostOf(p), 2)}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {p.landed_cost != null ? `₹${inr(Number(p.landed_cost), 2)}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">₹{inr(p.selling_price)}</td>
                    <td className="px-3 py-3 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => openLabels(p.name, [p])} className="text-blue-600 hover:underline">Labels</button>
                      <button onClick={() => openAdjustStock(p)} className="text-blue-600 hover:underline">Stock</button>
                      <button onClick={() => openEditForm(p)} className="text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => handleDelete(p)} className="text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan="9" className="py-8 text-center text-gray-400">
                    {search.trim() || brandFilter || categoryFilter || itemFilter ? 'No products match your search' : 'No products yet'}
                  </td></tr>
                )}
              </tbody>
              {filteredProducts.length > 0 && (
                <tfoot className="sticky bottom-0 bg-gray-50 border-t-2 font-bold">
                  <tr>
                    <td className="px-3 py-3" colSpan="4" title="Each total is units in stock x that price">
                      Total ({filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"})
                    </td>
                    <td className="px-3 py-3 text-right">{inr(totals.units)}</td>
                    <td className="px-3 py-3 text-right">₹{inr(totals.cost, 2)}</td>
                    <td className="px-3 py-3 text-right">₹{inr(totals.landed, 2)}</td>
                    <td className="px-3 py-3 text-right">₹{inr(totals.price, 2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {filteredProducts.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Totals are the worth of the stock listed: units in stock x cost, landed cost and selling price. Products never bought through Purchase use their cost price in the Landed total.
            </p>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editingId ? 'Edit Product' : 'Add Product'}</h2>
            <form onSubmit={handleSubmit}>
              <datalist id="inv-items">{itemSuggestions.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="inv-brands">{brandOptions.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="inv-sizes">{mergeSuggestions(sizeOptions, COMMON_SIZES).map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="inv-colors">{mergeSuggestions(colorOptions, COMMON_COLORS).map(v => <option key={v} value={v} />)}</datalist>
              <label className="block text-xs text-gray-500 mb-1">Product Name</label>
              <input
                type="text" placeholder="Product Name" required
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="uppercase w-full px-4 py-2 border rounded mb-3"
              />
              <label className="block text-xs text-gray-500 mb-1">Item Name (optional)</label>
              <input
                type="text" list="inv-items" placeholder="e.g. Fridge, Iron - the kind of item"
                value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                className="uppercase w-full px-4 py-2 border rounded mb-3"
              />
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">SKU</label>
                  <input
                    type="text" placeholder="SKU"
                    value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className={`w-full px-4 py-2 border rounded ${duplicateSku ? 'border-red-500' : ''}`}
                  />
                  {duplicateSku && (
                    <div className="text-xs mt-1">
                      <p className="text-red-600">Already used by "{duplicateSku.name}"</p>
                      <button type="button" onClick={() => openEditForm(duplicateSku)} className="text-blue-600 hover:underline">
                        Edit "{duplicateSku.name}" instead
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Barcode (scan or type)</label>
                  <div className="flex gap-2">
                    <input
                      ref={barcodeInputRef}
                      type="text" placeholder="Scan or leave blank..."
                      value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      onKeyDown={handleBarcodeFieldKeyDown}
                      className={`flex-1 min-w-0 px-4 py-2 border rounded ${duplicateBarcode ? 'border-red-500' : ''}`}
                    />
                    <button type="button" onClick={generateBarcode} className="px-2 border rounded text-xs hover:bg-gray-100">Generate</button>
                  </div>
                  {duplicateBarcode && (
                    <div className="text-xs mt-1">
                      <p className="text-red-600">Already used by "{duplicateBarcode.name}"</p>
                      <button type="button" onClick={() => openEditForm(duplicateBarcode)} className="text-blue-600 hover:underline">
                        Edit "{duplicateBarcode.name}" instead
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Category</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full px-4 py-2 border rounded mb-2"
                >
                  <option value="">No Category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <label className="block text-xs text-gray-500 mb-1">New Category</label>
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="New category name"
                    value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                    className="uppercase flex-1 px-4 py-2 border rounded text-sm"
                  />
                  <button type="button" onClick={handleAddCategory} className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
                    Add
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Cost Price</label>
                  <input
                    type="number" step="0.01" min="0" required placeholder="0.00"
                    value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="w-full px-4 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Selling Price</label>
                  <input
                    type="number" step="0.01" min="0" required placeholder="0.00"
                    value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                    className="w-full px-4 py-2 border rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {editingId ? 'Current Stock (use "Stock" action to adjust)' : 'Opening Stock'}
                  </label>
                  <input
                    type="number" min="0" placeholder="0"
                    value={form.current_stock}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                    className="w-full px-4 py-2 border rounded disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Min Stock Level</label>
                  <input
                    type="number" min="0" placeholder="5"
                    value={form.min_stock_level} onChange={(e) => setForm({ ...form, min_stock_level: e.target.value })}
                    className="w-full px-4 py-2 border rounded"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-2">More details (all optional)</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">MRP</label>
                  <input
                    type="number" step="0.01" min="0" placeholder="0.00"
                    value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })}
                    className="w-full px-4 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Brand</label>
                  <input
                    type="text" list="inv-brands" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    className="uppercase w-full px-4 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Size</label>
                  <input
                    type="text" list="inv-sizes" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}
                    className="uppercase w-full px-4 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Colour</label>
                  <input
                    type="text" list="inv-colors" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="uppercase w-full px-4 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">HSN Code</label>
                  <input
                    type="text" value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                    className="w-full px-4 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Season</label>
                  <input
                    type="text" value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })}
                    className="uppercase w-full px-4 py-2 border rounded"
                  />
                </div>
              </div>

              {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border py-2 rounded hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!duplicateBarcode || !!duplicateSku}
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {editingId ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {adjustingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold mb-1">Adjust Stock</h2>
            <p className="text-sm text-gray-500 mb-4">{adjustingProduct.name}</p>
            <form onSubmit={handleAdjustStock}>
              <label className="block text-xs text-gray-500 mb-1">New Stock Quantity</label>
              <input
                type="number" min="0" required autoFocus
                value={adjustStock} onChange={(e) => setAdjustStock(e.target.value)}
                className="w-full px-4 py-2 border rounded mb-3"
              />
              <label className="block text-xs text-gray-500 mb-1">Reason</label>
              <input
                type="text" placeholder="e.g. stock count correction, damage"
                value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full px-4 py-2 border rounded mb-4"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setAdjustingProduct(null)} className="flex-1 border py-2 rounded hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingHistoryFor && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Price History</h2>
                <p className="text-sm text-gray-500">{viewingHistoryFor.name}</p>
              </div>
              <button onClick={() => { setViewingHistoryFor(null); setPriceHistory(null) }} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            {!priceHistory && <p className="text-gray-400">Loading...</p>}
            {priceHistory && priceHistory.length === 0 && (
              <p className="text-gray-400">No price changes recorded yet - current cost was set when the product was created.</p>
            )}
            {priceHistory && priceHistory.length > 0 && (
              <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-3 px-3 whitespace-nowrap">Date</th>
                    <th className="py-3 px-3">Source</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Qty</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Old Rate</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">New Rate</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map(h => {
                    const isFirst = !!h.is_first_purchase
                    const hasOld = h.old_cost_price != null && !isFirst
                    const diff = hasOld ? h.new_cost_price - h.old_cost_price : 0
                    const pct = hasOld && h.old_cost_price !== 0 ? (diff / h.old_cost_price) * 100 : null
                    const increased = hasOld && diff > 0
                    const decreased = hasOld && diff < 0
                    return (
                      <tr key={h.id} className="border-b align-top">
                        <td className="py-3 px-3 whitespace-nowrap">{new Date(h.changed_at).toLocaleString()}</td>
                        <td className="py-3 px-3 text-gray-500">
                          {h.source === 'purchase' ? `Purchase${h.supplier_name ? ` (${h.supplier_name})` : ''}` : 'Manual edit'}
                          {h.source === 'purchase' && h.unit_cost != null && (
                            <div className="text-xs text-gray-400 mt-0.5">{h.plain_unit_cost != null ? `unit cost ₹${inr(h.plain_unit_cost, 2)} · landed ₹${inr(h.unit_cost, 2)}/unit` : `landed ₹${inr(h.unit_cost, 2)}/unit`}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">{h.quantity ?? '-'}</td>
                        <td className="py-3 px-3 text-right text-gray-500 whitespace-nowrap">{hasOld ? `₹${inr(h.old_cost_price, 2)}` : '—'}</td>
                        <td className="py-3 px-3 text-right font-medium whitespace-nowrap">₹{inr(h.new_cost_price, 2)}</td>
                        <td className={`py-3 px-3 text-right font-medium whitespace-nowrap ${increased ? 'text-red-600' : decreased ? 'text-green-600' : 'text-gray-400'}`}>
                          {hasOld
                            ? <>{increased ? '▲' : decreased ? '▼' : '—'} ₹{inr(Math.abs(diff), 2)}<div className="text-xs font-normal">{pct !== null ? `(${diff >= 0 ? '+' : '-'}${inr(Math.abs(pct), 1)}%)` : ''}</div></>
                            : (isFirst ? 'First purchase' : 'Initial')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {labelTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-30">
          <form onSubmit={handlePrintLabels} className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold mb-1">Barcode Labels</h2>
            <p className="text-sm text-gray-500 mb-4">{labelTarget.title}</p>
            <label className="block text-xs text-gray-500 mb-1">Labels per product</label>
            <input
              type="number" min="1" max="500" autoFocus required
              value={labelTarget.count}
              onChange={(e) => setLabelTarget(t => ({ ...t, count: e.target.value }))}
              className="w-full px-4 py-2 border rounded mb-2"
            />
            <p className="text-xs text-gray-500 mb-4">
              Prints an A4 sheet of 24 stickers per page. Products without a barcode get the next number automatically.
            </p>
            {labelMessage && <p className="text-red-500 text-sm mb-3">{labelMessage}</p>}
            <div className="flex gap-3">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Preview &amp; Print</button>
              <button type="button" onClick={() => setLabelTarget(null)} className="flex-1 border py-2 rounded hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
