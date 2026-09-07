#!/bin/bash

# Login Page
cat > src/renderer/pages/Login.jsx << 'LOGIN_EOF'
import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { setUser } from '../store/slices/auth'

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const dispatch = useDispatch()

  const handleLogin = async (e) => {
    e.preventDefault()
    const result = await window.ipcRenderer.invoke('user-login', { username, password })
    
    if (result.success) {
      dispatch(setUser({ user: result.user, permissions: result.user.permissions }))
      onSuccess()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-3xl font-bold mb-6 text-center">Electronics Shop CRM</h1>
        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 border rounded mb-4"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded mb-4"
          />
          {message && <p className="text-red-500 mb-4">{message}</p>}
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
            Login
          </button>
        </form>
      </div>
    </div>
  )
}
LOGIN_EOF

# Activation Page
cat > src/renderer/pages/Activation.jsx << 'ACTIVATION_EOF'
import { useState, useEffect } from 'react'

export default function Activation({ onActivated }) {
  const [machineId, setMachineId] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const getMachineId = async () => {
      const result = await window.ipcRenderer.invoke('check-license')
      setMachineId(result.machineId)
    }
    getMachineId()
  }, [])

  const handleActivate = async (e) => {
    e.preventDefault()
    const result = await window.ipcRenderer.invoke('activate-license', { machineId, licenseKey })
    
    if (result.success) {
      onActivated()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-4">License Activation</h1>
        <p className="mb-4">Machine ID:</p>
        <input
          type="text"
          value={machineId}
          readOnly
          className="w-full px-4 py-2 border rounded mb-4 bg-gray-100"
        />
        <p className="text-sm text-gray-600 mb-4">Copy this Machine ID and send it to support to get your License Key.</p>
        
        <form onSubmit={handleActivate}>
          <input
            type="text"
            placeholder="Enter License Key"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            className="w-full px-4 py-2 border rounded mb-4"
          />
          {message && <p className="text-red-500 mb-4">{message}</p>}
          <button type="submit" className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
            Activate
          </button>
        </form>
      </div>
    </div>
  )
}
ACTIVATION_EOF

# Dashboard
cat > src/renderer/pages/Dashboard.jsx << 'DASHBOARD_EOF'
import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'

export default function Dashboard() {
  const [todayStats, setTodayStats] = useState({})
  const [topProducts, setTopProducts] = useState([])
  const [lowStock, setLowStock] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const stats = await window.ipcRenderer.invoke('get-today-sales')
    const products = await window.ipcRenderer.invoke('get-top-products')
    const stock = await window.ipcRenderer.invoke('get-low-stock-products')
    
    setTodayStats(stats)
    setTopProducts(products)
    setLowStock(stock)
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
DASHBOARD_EOF

# Billing Page
cat > src/renderer/pages/Billing/BillingPage.jsx << 'BILLING_EOF'
import { useState } from 'react'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

export default function BillingPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold">Billing (POS)</h1>
          <p className="text-gray-600 mt-2">Create invoices with barcode scanning</p>
        </div>
      </div>
    </div>
  )
}
BILLING_EOF

# Inventory Page
cat > src/renderer/pages/Inventory/InventoryPage.jsx << 'INVENTORY_EOF'
import { useState, useEffect } from 'react'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

export default function InventoryPage() {
  const [products, setProducts] = useState([])

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    const data = await window.ipcRenderer.invoke('get-products')
    setProducts(data)
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6">Inventory</h1>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left">Product</th>
                  <th className="px-6 py-3 text-left">SKU</th>
                  <th className="px-6 py-3 text-right">Stock</th>
                  <th className="px-6 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4">{p.name}</td>
                    <td className="px-6 py-4">{p.sku}</td>
                    <td className="px-6 py-4 text-right">{p.current_stock}</td>
                    <td className="px-6 py-4 text-right">₹{p.selling_price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
INVENTORY_EOF

# Purchase Page
cat > src/renderer/pages/Purchase/PurchasePage.jsx << 'PURCHASE_EOF'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

export default function PurchasePage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold">Purchase</h1>
          <p className="text-gray-600 mt-2">Manage purchase orders and suppliers</p>
        </div>
      </div>
    </div>
  )
}
PURCHASE_EOF

# Customers Page
cat > src/renderer/pages/Customers/CustomersPage.jsx << 'CUSTOMERS_EOF'
import { useState, useEffect } from 'react'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    const data = await window.ipcRenderer.invoke('get-customers')
    setCustomers(data)
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6">Customers</h1>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Phone</th>
                  <th className="px-6 py-3 text-right">Credit Balance</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4">{c.name}</td>
                    <td className="px-6 py-4">{c.phone}</td>
                    <td className="px-6 py-4 text-right">₹{c.credit_balance.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
CUSTOMERS_EOF

# Analytics Page
cat > src/renderer/pages/Analytics/AnalyticsPage.jsx << 'ANALYTICS_EOF'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

export default function AnalyticsPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-gray-600 mt-2">Sales and profit reports</p>
        </div>
      </div>
    </div>
  )
}
ANALYTICS_EOF

# Settings Page
cat > src/renderer/pages/Settings/SettingsPage.jsx << 'SETTINGS_EOF'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

export default function SettingsPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-gray-600 mt-2">Shop settings and user management</p>
        </div>
      </div>
    </div>
  )
}
SETTINGS_EOF

# Navbar Component
cat > src/renderer/components/Navbar.jsx << 'NAVBAR_EOF'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../store/slices/auth'

export default function Navbar() {
  const user = useSelector(state => state.auth.user)
  const dispatch = useDispatch()

  return (
    <nav className="bg-white shadow-md px-8 py-4 flex justify-between items-center">
      <div>
        <p className="text-sm text-gray-600">Logged in as</p>
        <p className="font-bold">{user?.username} ({user?.role})</p>
      </div>
      <button
        onClick={() => dispatch(logout())}
        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
      >
        Logout
      </button>
    </nav>
  )
}
NAVBAR_EOF

# Sidebar Component
cat > src/renderer/components/Sidebar.jsx << 'SIDEBAR_EOF'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'

export default function Sidebar() {
  const permissions = useSelector(state => state.auth.permissions)

  return (
    <aside className="w-64 bg-gray-900 text-white h-screen p-6">
      <h1 className="text-2xl font-bold mb-8">CRM</h1>
      <nav className="space-y-4">
        <Link to="/" className="block px-4 py-2 rounded hover:bg-gray-800">📊 Dashboard</Link>
        {permissions.billing && <Link to="/billing" className="block px-4 py-2 rounded hover:bg-gray-800">💳 Billing</Link>}
        {permissions.inventory && <Link to="/inventory" className="block px-4 py-2 rounded hover:bg-gray-800">📦 Inventory</Link>}
        {permissions.purchase && <Link to="/purchase" className="block px-4 py-2 rounded hover:bg-gray-800">🛒 Purchase</Link>}
        {permissions.customers && <Link to="/customers" className="block px-4 py-2 rounded hover:bg-gray-800">👥 Customers</Link>}
        {permissions.analytics && <Link to="/analytics" className="block px-4 py-2 rounded hover:bg-gray-800">📈 Analytics</Link>}
        {permissions.settings && <Link to="/settings" className="block px-4 py-2 rounded hover:bg-gray-800">⚙️ Settings</Link>}
      </nav>
    </aside>
  )
}
SIDEBAR_EOF

echo "All pages and components created!"
