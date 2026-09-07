import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

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
  const [items, setItems] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [supplierForm, setSupplierForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [categories, setCategories] = useState([])
  const [showNewProductForm, setShowNewProductForm] = useState(false)
  const [newProductForm, setNewProductForm] = useState({
    name: '', sku: '', barcode: '', category_id: '', cost_price: '', selling_price: ''
  })
  const [duplicateBarcodeMatch, setDuplicateBarcodeMatch] = useState(null)
  const [viewingPurchase, setViewingPurchase] = useState(null)
  const newProductBarcodeRef = useRef(null)

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

  const loadCategories = async () => {
    const data = await window.ipcRenderer.invoke('get-categories')
    setCategories(data)
  }

  const loadSuppliers = async () => {
    const data = await window.ipcRenderer.invoke('get-suppliers')
    setSuppliers(data)
  }

  const loadPurchases = async () => {
    const data = await window.ipcRenderer.invoke('get-purchases', { limit: 50 })
    setPurchases(data)
  }

  const handleSearch = async (value) => {
    setSearchTerm(value)
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    const results = await window.ipcRenderer.invoke('search-product', value)
    setSearchResults(results)
  }

  const handleBarcodeEnter = async (e) => {
    if (e.key !== 'Enter' || !searchTerm.trim()) return
    e.preventDefault()

    const exact = await window.ipcRenderer.invoke('get-product-by-barcode', searchTerm.trim())
    if (exact) {
      addItem(exact)
      return
    }
    if (searchResults.length > 0) {
      addItem(searchResults[0])
    }
  }

  const addItem = (product) => {
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
        subtotal: product.cost_price
      }]
    })
    setSearchTerm('')
    setSearchResults([])
  }

  const handleAddNewProduct = async (e) => {
    e.preventDefault()
    setError('')

    if (!newProductForm.name.trim() || !newProductForm.cost_price || !newProductForm.selling_price) {
      setError('Name, cost price, and selling price are required for a new product')
      return
    }
    if (duplicateBarcodeMatch) {
      setError(`Barcode already used by "${duplicateBarcodeMatch.name}"`)
      return
    }

    const result = await window.ipcRenderer.invoke('add-product', {
      name: newProductForm.name.trim(),
      sku: newProductForm.sku || null,
      barcode: newProductForm.barcode || null,
      category_id: newProductForm.category_id || null,
      cost_price: parseFloat(newProductForm.cost_price),
      selling_price: parseFloat(newProductForm.selling_price),
      current_stock: 0,
      min_stock_level: 5
    })

    if (result.success) {
      addItem({ id: result.productId, name: newProductForm.name.trim(), cost_price: parseFloat(newProductForm.cost_price) })
      setNewProductForm({ name: '', sku: '', barcode: '', category_id: '', cost_price: '', selling_price: '' })
      setDuplicateBarcodeMatch(null)
      setShowNewProductForm(false)
    } else {
      setError(result.message || 'Failed to add product')
    }
  }

  const updateItem = (productId, field, value) => {
    setItems(prev => prev.map(i => {
      if (i.product_id !== productId) return i
      const updated = { ...i, [field]: value }
      updated.subtotal = Number(updated.quantity || 0) * Number(updated.unit_cost || 0)
      return updated
    }))
  }

  const removeItem = (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId))
  }

  const total = items.reduce((sum, i) => sum + i.subtotal, 0)

  const filteredPurchases = purchases.filter(p =>
    !historySearch.trim() ||
    p.supplier_name.toLowerCase().includes(historySearch.trim().toLowerCase()) ||
    String(p.id).includes(historySearch.trim())
  )

  const handleAddSupplier = async (e) => {
    e.preventDefault()
    const result = await window.ipcRenderer.invoke('add-supplier', supplierForm)
    if (result.success) {
      await loadSuppliers()
      setSupplierId(String(result.supplierId))
      setSupplierForm({ name: '', contact_person: '', phone: '', email: '', address: '' })
      setShowSupplierForm(false)
    } else {
      setError(result.message)
    }
  }

  const handleCreatePurchase = async () => {
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

    const result = await window.ipcRenderer.invoke('create-purchase', {
      supplierId,
      items,
      userId: user?.id
    })

    if (result.success) {
      setMessage(`Purchase order #${result.purchaseId} created`)
      setItems([])
      setSupplierId('')
      loadPurchases()
    } else {
      setError(result.message || 'Failed to create purchase order')
    }
  }

  const handleReceive = async (purchaseId) => {
    const result = await window.ipcRenderer.invoke('receive-purchase', purchaseId)
    if (result.success) {
      loadPurchases()
    } else {
      alert(result.message || 'Failed to receive purchase')
    }
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6">Purchase</h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">New Purchase Order</h2>

              <Field label="Supplier" className="mb-2">
                <div className="flex gap-2">
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
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
                  <Field label="Address">
                    <input placeholder="Address" value={supplierForm.address}
                      onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <button type="submit" className="col-span-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                    Save Supplier
                  </button>
                </form>
              )}

              <div className="flex gap-2 mb-4 items-end">
                <Field label="Add Product (scan barcode or search)" className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Scan barcode or search product to add..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    onKeyDown={handleBarcodeEnter}
                    className="w-full px-4 py-2 border rounded"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-64 overflow-y-auto">
                      {searchResults.map(p => (
                        <button
                          key={p.id}
                          onClick={() => addItem(p)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 flex justify-between"
                        >
                          <span>{p.name} <span className="text-gray-400 text-sm">({p.sku})</span></span>
                          <span className="text-gray-600">Cost ₹{p.cost_price}</span>
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
                  <Field label="SKU">
                    <input placeholder="SKU" value={newProductForm.sku}
                      onChange={(e) => setNewProductForm({ ...newProductForm, sku: e.target.value })}
                      className="w-full px-3 py-2 border rounded" />
                  </Field>
                  <Field label="Barcode (scan or type)">
                    <input
                      ref={newProductBarcodeRef}
                      placeholder="Scan barcode..." value={newProductForm.barcode}
                      onChange={(e) => { setNewProductForm({ ...newProductForm, barcode: e.target.value }); checkDuplicateBarcode(e.target.value) }}
                      onKeyDown={handleBarcodeFieldKeyDown}
                      className={`w-full px-3 py-2 border rounded ${duplicateBarcodeMatch ? 'border-red-500' : ''}`} />
                    {duplicateBarcodeMatch && (
                      <div className="text-xs mt-1">
                        <p className="text-red-600">Already used by "{duplicateBarcodeMatch.name}"</p>
                        <button
                          type="button"
                          onClick={() => {
                            addItem(duplicateBarcodeMatch)
                            setNewProductForm({ name: '', sku: '', barcode: '', category_id: '', cost_price: '', selling_price: '' })
                            setDuplicateBarcodeMatch(null)
                            setShowNewProductForm(false)
                          }}
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
                      className="w-full px-3 py-2 border rounded">
                      <option value="">No Category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
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
                  <button
                    type="submit"
                    disabled={!!duplicateBarcodeMatch}
                    className="col-span-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Add & Include in Order
                  </button>
                </form>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Product</th>
                    <th className="py-2 text-center">Qty</th>
                    <th className="py-2 text-right">Unit Cost</th>
                    <th className="py-2 text-right">Subtotal</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.product_id} className="border-b">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2 text-center">
                        <input type="number" min="1" value={item.quantity}
                          onChange={(e) => updateItem(item.product_id, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-16 text-center border rounded" />
                      </td>
                      <td className="py-2 text-right">
                        <input type="number" min="0" step="0.01" value={item.unit_cost}
                          onChange={(e) => updateItem(item.product_id, 'unit_cost', parseFloat(e.target.value) || 0)}
                          className="w-24 text-right border rounded" />
                      </td>
                      <td className="py-2 text-right">₹{item.subtotal.toFixed(2)}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => removeItem(item.product_id)} className="text-red-600 hover:underline">Remove</button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan="5" className="py-6 text-center text-gray-400">No items added</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg shadow p-6 h-fit">
              <div className="flex justify-between text-2xl font-bold mb-4">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
              {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
              {message && <p className="text-green-600 mb-4 text-sm">{message}</p>}
              <button
                onClick={handleCreatePurchase}
                className="w-full bg-green-600 text-white py-3 rounded hover:bg-green-700 font-bold"
              >
                Create Purchase Order
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="flex justify-between items-end p-6 pb-0">
              <h2 className="text-xl font-bold">Purchase History</h2>
              <Field label="Search">
                <input
                  type="text"
                  placeholder="Search by supplier or #..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="px-4 py-2 border rounded text-sm w-64"
                />
              </Field>
            </div>
            <table className="w-full mt-4">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left">#</th>
                  <th className="px-6 py-3 text-left">Supplier</th>
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
                    <td className="px-6 py-4">{new Date(p.purchase_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">₹{p.total_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${p.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                      <button onClick={() => openPurchaseDetail(p.id)} className="text-blue-600 hover:underline">
                        View
                      </button>
                      {p.status !== 'received' && (
                        <button onClick={() => handleReceive(p.id)} className="text-blue-600 hover:underline">
                          Receive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredPurchases.length === 0 && (
                  <tr><td colSpan="6" className="py-8 text-center text-gray-400">
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
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Purchase #{viewingPurchase.id}</h2>
                <p className="text-sm text-gray-500">
                  {viewingPurchase.supplier_name} · {new Date(viewingPurchase.purchase_date).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setViewingPurchase(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Product</th>
                  <th className="py-2">SKU</th>
                  <th className="py-2 text-center">Qty</th>
                  <th className="py-2 text-right">Unit Cost</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {viewingPurchase.items.map(item => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2">{item.product_name}</td>
                    <td className="py-2 text-gray-500">{item.sku}</td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-right">₹{item.unit_cost}</td>
                    <td className="py-2 text-right">₹{item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>₹{viewingPurchase.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 capitalize">
                <span>Status</span>
                <span>{viewingPurchase.status}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
