import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'

export default function Sidebar() {
  const permissions = useSelector(state => state.auth.permissions)
  const [logoUrl, setLogoUrl] = useState(null)

  useEffect(() => {
    window.ipcRenderer.invoke('get-shop-logo').then(setLogoUrl)
  }, [])

  return (
    <aside className="w-64 bg-gray-900 text-white h-screen p-6">
      <div className="flex items-center gap-2 mb-8">
        {logoUrl && <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded bg-white p-0.5" />}
        <h1 className="text-lg font-bold leading-tight">Modern Fashion Bazaar</h1>
      </div>
      <nav className="space-y-4">
        <Link to="/" className="block px-4 py-2 rounded hover:bg-gray-800">📊 Dashboard</Link>
        {permissions.billing && <Link to="/billing" className="block px-4 py-2 rounded hover:bg-gray-800">💳 Billing</Link>}
        {permissions.inventory && <Link to="/inventory" className="block px-4 py-2 rounded hover:bg-gray-800">📦 Inventory</Link>}
        {permissions.purchase && <Link to="/purchase" className="block px-4 py-2 rounded hover:bg-gray-800">🛒 Purchase</Link>}
        {permissions.customers && <Link to="/customers" className="block px-4 py-2 rounded hover:bg-gray-800">👥 Customers</Link>}
        {permissions.returns && <Link to="/returns" className="block px-4 py-2 rounded hover:bg-gray-800">↩️ Returns</Link>}
        {permissions.daily_closing && <Link to="/daily-closing" className="block px-4 py-2 rounded hover:bg-gray-800">🧾 Daily Closing</Link>}
        {permissions.analytics && <Link to="/analytics" className="block px-4 py-2 rounded hover:bg-gray-800">📈 Analytics</Link>}
        {permissions.settings && <Link to="/settings" className="block px-4 py-2 rounded hover:bg-gray-800">⚙️ Settings</Link>}
      </nav>
    </aside>
  )
}
