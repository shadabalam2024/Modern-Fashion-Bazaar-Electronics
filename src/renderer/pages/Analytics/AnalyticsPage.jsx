import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

const toDateInput = (d) => d.toISOString().split('T')[0]

export default function AnalyticsPage() {
  const today = new Date()
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(today.getDate() - 30)

  const [startDate, setStartDate] = useState(toDateInput(thirtyDaysAgo))
  const [endDate, setEndDate] = useState(toDateInput(today))
  const [trend, setTrend] = useState([])
  const [profitAnalysis, setProfitAnalysis] = useState([])
  const [categoryPerformance, setCategoryPerformance] = useState([])
  const [salesReport, setSalesReport] = useState([])

  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [productSearchResults, setProductSearchResults] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productPerformance, setProductPerformance] = useState(null)

  useEffect(() => {
    loadTrend()
  }, [])

  useEffect(() => {
    loadRangeData()
  }, [startDate, endDate])

  useEffect(() => {
    if (selectedProduct) {
      loadProductPerformance()
    }
  }, [selectedProduct, startDate, endDate])

  const loadTrend = async () => {
    const data = await window.ipcRenderer.invoke('get-sales-trend')
    setTrend(data.map(d => ({ ...d, sales: d.sales || 0 })))
  }

  const loadRangeData = async () => {
    const [profit, category, sales] = await Promise.all([
      window.ipcRenderer.invoke('get-profit-analysis', { startDate, endDate }),
      window.ipcRenderer.invoke('get-category-performance', { startDate, endDate }),
      window.ipcRenderer.invoke('get-sales-report', { startDate, endDate })
    ])
    setProfitAnalysis(profit)
    setCategoryPerformance(category)
    setSalesReport(sales)
  }

  const handleProductSearch = async (value) => {
    setProductSearchTerm(value)
    if (!value.trim()) {
      setProductSearchResults([])
      return
    }
    const results = await window.ipcRenderer.invoke('search-product', value)
    setProductSearchResults(results)
  }

  const selectProduct = (product) => {
    setSelectedProduct(product)
    setProductSearchTerm(product.name)
    setProductSearchResults([])
  }

  const clearProduct = () => {
    setSelectedProduct(null)
    setProductSearchTerm('')
    setProductPerformance(null)
  }

  const loadProductPerformance = async () => {
    const data = await window.ipcRenderer.invoke('get-product-performance', {
      productId: selectedProduct.id, startDate, endDate
    })
    setProductPerformance(data)
  }

  const totalRevenue = salesReport.reduce((sum, d) => sum + (d.total_sales || 0), 0)
  const totalInvoices = salesReport.reduce((sum, d) => sum + (d.invoice_count || 0), 0)
  const totalProfit = profitAnalysis.reduce((sum, p) => sum + (p.profit || 0), 0)

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Analytics</h1>
            <div className="flex items-end gap-2 text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 border rounded" />
              </div>
              <span className="text-gray-400 pb-2">to</span>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 border rounded" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600">Revenue (range)</p>
              <p className="text-3xl font-bold">₹{totalRevenue.toFixed(0)}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600">Profit (range)</p>
              <p className="text-3xl font-bold">₹{totalProfit.toFixed(0)}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600">Invoices (range)</p>
              <p className="text-3xl font-bold">{totalInvoices}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Product Performance</h2>
            <label className="block text-xs text-gray-500 mb-1">Product</label>
            <div className="relative mb-4 max-w-md">
              {selectedProduct ? (
                <div className="flex items-center justify-between border rounded px-4 py-2 bg-gray-50">
                  <span className="font-medium">{selectedProduct.name}</span>
                  <button onClick={clearProduct} className="text-gray-400 hover:text-gray-700 text-sm">Change</button>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Search a product to see its performance..."
                  value={productSearchTerm}
                  onChange={(e) => handleProductSearch(e.target.value)}
                  className="w-full px-4 py-2 border rounded"
                />
              )}
              {productSearchResults.length > 0 && (
                <div className="absolute z-10 w-full bg-white border rounded mt-1 shadow-lg max-h-64 overflow-y-auto">
                  {productSearchResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectProduct(p)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 flex justify-between text-sm"
                    >
                      <span>{p.name}</span>
                      <span className="text-gray-500">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedProduct && productPerformance && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="text-xs text-gray-500">Qty Sold (range)</p>
                    <p className="text-xl font-bold">{productPerformance.quantity_sold}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="text-xs text-gray-500">Revenue (range)</p>
                    <p className="text-xl font-bold">₹{productPerformance.revenue.toFixed(0)}</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="text-xs text-gray-500">Profit (range)</p>
                    <p className="text-xl font-bold">₹{productPerformance.profit.toFixed(0)}</p>
                  </div>
                </div>
                {productPerformance.daily.length === 0 ? (
                  <p className="text-gray-400">No sales for this product in the selected range</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={productPerformance.daily}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="quantity_sold" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Sales Trend (last 30 days)</h2>
            {trend.length === 0 ? (
              <p className="text-gray-400">No sales data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `₹${v}`} />
                  <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Profit by Product</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Profit</th>
                    <th className="py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitAnalysis.map(p => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2">{p.name}</td>
                      <td className="py-2 text-right">{p.quantity_sold}</td>
                      <td className="py-2 text-right">₹{p.profit.toFixed(0)}</td>
                      <td className="py-2 text-right">{p.margin}%</td>
                    </tr>
                  ))}
                  {profitAnalysis.length === 0 && (
                    <tr><td colSpan="4" className="py-6 text-center text-gray-400">No sales in this range</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Category Performance</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">Category</th>
                    <th className="py-2 text-right">Items Sold</th>
                    <th className="py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryPerformance.map((c, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{c.category || 'Uncategorized'}</td>
                      <td className="py-2 text-right">{c.items_sold}</td>
                      <td className="py-2 text-right">₹{c.revenue.toFixed(0)}</td>
                    </tr>
                  ))}
                  {categoryPerformance.length === 0 && (
                    <tr><td colSpan="3" className="py-6 text-center text-gray-400">No sales in this range</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
