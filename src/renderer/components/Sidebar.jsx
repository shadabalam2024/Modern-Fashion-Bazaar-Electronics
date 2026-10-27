import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { COMPANY, hasSupportContact, contactSupport } from '../utils/brand'

export default function Sidebar() {
  const permissions = useSelector(state => state.auth.permissions)
  const isAdmin = useSelector(state => state.auth.user?.role) === 'Admin'
  const [logoUrl, setLogoUrl] = useState(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.ipcRenderer.invoke('get-shop-logo').then(setLogoUrl)
    window.ipcRenderer.invoke('get-app-version').then(setVersion)
  }, [])

  return (
    <aside className="w-64 bg-gray-900 text-white h-screen p-6 sticky top-0 overflow-y-auto shrink-0">
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
        {isAdmin && <Link to="/ledger" className="block px-4 py-2 rounded hover:bg-gray-800">📒 Account</Link>}
        {permissions.analytics && <Link to="/analytics" className="block px-4 py-2 rounded hover:bg-gray-800">📈 Analytics</Link>}
        {permissions.settings && <Link to="/settings" className="block px-4 py-2 rounded hover:bg-gray-800">⚙️ Settings</Link>}
      </nav>
      <div className="mt-8 pt-4 border-t border-gray-800 text-xs text-gray-500 text-center">
        <p>{COMPANY}{version ? ` · v${version}` : ''}</p>
        {hasSupportContact && (
          <button onClick={contactSupport} className="mt-1 text-gray-400 hover:text-white underline">Get support</button>
        )}
      </div>
    </aside>
  )
}
