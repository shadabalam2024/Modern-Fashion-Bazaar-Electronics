import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Provider, useSelector } from 'react-redux'
import { store } from './store'
import Login from './pages/Login'
import Activation from './pages/Activation'
import CreateAdmin from './pages/CreateAdmin'
import Dashboard from './pages/Dashboard'
import BillingPage from './pages/Billing/BillingPage'
import InventoryPage from './pages/Inventory/InventoryPage'
import PurchasePage from './pages/Purchase/PurchasePage'
import CustomersPage from './pages/Customers/CustomersPage'
import ReturnsPage from './pages/Returns/ReturnsPage'
import DailyClosingPage from './pages/DailyClosing/DailyClosingPage'
import AnalyticsPage from './pages/Analytics/AnalyticsPage'
import SettingsPage from './pages/Settings/SettingsPage'
import InvoicePrint from './pages/InvoicePrint'

function AuthGate() {
  const user = useSelector(state => state.auth.user)

  if (!user) return <Login />

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/purchase" element={<PurchasePage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/daily-closing" element={<DailyClosingPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </HashRouter>
  )
}

function App() {
  const [licensed, setLicensed] = useState(null)
  const [adminExists, setAdminExists] = useState(null)

  const printMatch = window.location.hash.match(/^#print=(\d+)/)

  useEffect(() => {
    if (printMatch) return
    checkLicense()
    checkAdminExists()
  }, [])

  const checkLicense = async () => {
    const result = await window.ipcRenderer.invoke('check-license')
    setLicensed(result.licensed)
  }

  const checkAdminExists = async () => {
    const exists = await window.ipcRenderer.invoke('check-admin-exists')
    setAdminExists(exists)
  }

  let content
  if (printMatch) {
    content = <InvoicePrint invoiceId={printMatch[1]} />
  } else if (licensed === null || adminExists === null) {
    content = <div className="flex items-center justify-center h-screen">Loading...</div>
  } else if (!licensed) {
    content = <Activation onActivated={() => setLicensed(true)} />
  } else if (!adminExists) {
    content = <CreateAdmin onCreated={() => setAdminExists(true)} />
  } else {
    content = <AuthGate />
  }

  return <Provider store={store}>{content}</Provider>
}

export default App
