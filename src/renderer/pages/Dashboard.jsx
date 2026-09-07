import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'

const toDateInput = (d) => d.toISOString().split('T')[0]

const defaultRangeFor = (period) => {
  const end = new Date()
  const start = new Date(end)
  if (period === 'monthly') start.setMonth(end.getMonth() - 11)
  else if (period === 'weekly') start.setDate(end.getDate() - 7 * 11)
  else start.setDate(end.getDate() - 29)
  return { start: toDateInput(start), end: toDateInput(end) }
}

export default function Dashboard() {
  const [todayStats, setTodayStats] = useState({})
  const [topProducts, setTopProducts] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [trend, setTrend] = useState([])
  const [trendPeriod, setTrendPeriod] = useState('daily')
  const [trendRange, setTrendRange] = useState(defaultRangeFor('daily'))

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    loadTrend()
  }, [trendPeriod, trendRange])

  const loadData = async () => {
    const stats = await window.ipcRenderer.invoke('get-today-sales')
    const products = await window.ipcRenderer.invoke('get-top-products')
    const stock = await window.ipcRenderer.invoke('get-low-stock-products')

    setTodayStats(stats)
    setTopProducts(products)
    setLowStock(stock)
  }

  const loadTrend = async () => {
    const data = await window.ipcRenderer.invoke('get-sales-trend-by-period', {
      period: trendPeriod, startDate: trendRange.start, endDate: trendRange.end
    })
    setTrend(data.map(d => ({ ...d, sales: d.sales || 0 })))
  }

  const handlePeriodChange = (period) => {
    setTrendPeriod(period)
    setTrendRange(defaultRangeFor(period))
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600">Total Sales Today</p>
              <p className="text-3xl font-bold">₹{todayStats.total_revenue?.toFixed(0) || 0}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600">Cash Received</p>
              <p className="text-3xl font-bold">₹{todayStats.cash_received?.toFixed(0) || 0}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600">Card Received</p>
              <p className="text-3xl font-bold">₹{todayStats.card_received?.toFixed(0) || 0}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600">Invoices</p>
              <p className="text-3xl font-bold">{todayStats.invoice_count || 0}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <h2 className="text-xl font-bold">Sales Trend</h2>
              <div className="flex items-end gap-2 text-sm">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Period</label>
                  <div className="flex border rounded overflow-hidden">
                    {['daily', 'weekly', 'monthly'].map(p => (
                      <button
                        key={p}
                        onClick={() => handlePeriodChange(p)}
                        className={`px-3 py-1.5 capitalize ${trendPeriod === p ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">From</label>
                  <input
                    type="date"
                    value={trendRange.start}
                    onChange={(e) => setTrendRange(r => ({ ...r, start: e.target.value }))}
                    className="px-2 py-1.5 border rounded"
                  />
                </div>
                <span className="text-gray-400 pb-2">to</span>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">To</label>
                  <input
                    type="date"
                    value={trendRange.end}
                    onChange={(e) => setTrendRange(r => ({ ...r, end: e.target.value }))}
                    className="px-2 py-1.5 border rounded"
                  />
                </div>
              </div>
            </div>
            {trend.length === 0 ? (
              <p className="text-gray-400">No sales data for this range</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `₹${v}`} />
                  <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">Top Products</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Product</th>
                    <th className="text-right py-2">Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map(p => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="py-2">{p.name}</td>
                      <td className="text-right">{p.quantity_sold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">Low Stock Alert</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Product</th>
                    <th className="text-right py-2">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map(p => (
                    <tr key={p.id} className="border-b hover:bg-gray-50 text-orange-600">
                      <td className="py-2">{p.name}</td>
                      <td className="text-right font-bold">{p.current_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
