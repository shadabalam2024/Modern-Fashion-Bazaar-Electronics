import { useState, useEffect } from 'react'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'
import useAppUpdater from '../../hooks/useAppUpdater'

const PERMISSION_KEYS = ['dashboard', 'billing', 'inventory', 'purchase', 'customers', 'analytics', 'settings']

function Field({ label, className = '', children }) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function ShopInfoTab() {
  const [form, setForm] = useState({
    shop_name: '', shop_address: '', shop_phone: '', shop_email: '',
    gst_number: '', gst_rate: '', payment_terms: '', return_policy: ''
  })
  const [logoUrl, setLogoUrl] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    window.ipcRenderer.invoke('get-shop-settings').then(data => {
      setForm(f => ({ ...f, ...data }))
    })
    loadLogo()
  }, [])

  const loadLogo = () => {
    window.ipcRenderer.invoke('get-shop-logo').then(setLogoUrl)
  }

  const handleUploadLogo = async () => {
    const result = await window.ipcRenderer.invoke('select-shop-logo')
    if (result.success) {
      loadLogo()
    } else if (!result.canceled) {
      setMessage(result.message || 'Failed to upload logo')
    }
  }

  const handleRemoveLogo = async () => {
    await window.ipcRenderer.invoke('remove-shop-logo')
    setLogoUrl(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const result = await window.ipcRenderer.invoke('update-shop-settings', form)
    setMessage(result.success ? 'Saved' : (result.message || 'Failed to save'))
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 max-w-2xl">
      <h2 className="text-xl font-bold mb-4">Shop Information</h2>

      <label className="block text-xs text-gray-500 mb-1">Company Logo</label>
      <div className="flex items-center gap-4 mb-4">
        <div className="w-20 h-20 border rounded flex items-center justify-center bg-gray-50 overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl} alt="Company logo" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-xs text-gray-400">No logo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={handleUploadLogo} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">
            {logoUrl ? 'Change Logo' : 'Upload Logo'}
          </button>
          {logoUrl && (
            <button type="button" onClick={handleRemoveLogo} className="px-3 py-1.5 text-sm text-red-600 hover:underline">
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Shop Name" className="col-span-2">
          <input placeholder="Shop Name" value={form.shop_name || ''}
            onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
            className="w-full px-4 py-2 border rounded" />
        </Field>
        <Field label="Phone">
          <input placeholder="Phone" value={form.shop_phone || ''}
            onChange={(e) => setForm({ ...form, shop_phone: e.target.value })}
            className="w-full px-4 py-2 border rounded" />
        </Field>
        <Field label="Email">
          <input placeholder="Email" value={form.shop_email || ''}
            onChange={(e) => setForm({ ...form, shop_email: e.target.value })}
            className="w-full px-4 py-2 border rounded" />
        </Field>
        <Field label="GST Number">
          <input placeholder="GST Number" value={form.gst_number || ''}
            onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
            className="w-full px-4 py-2 border rounded" />
        </Field>
        <Field label="GST Rate (%)">
          <input placeholder="GST Rate (%)" type="number" min="0" step="0.01" value={form.gst_rate || ''}
            onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
            className="w-full px-4 py-2 border rounded" />
        </Field>
        <Field label="Address" className="col-span-2">
          <textarea placeholder="Address" value={form.shop_address || ''}
            onChange={(e) => setForm({ ...form, shop_address: e.target.value })}
            className="w-full px-4 py-2 border rounded" />
        </Field>
        <Field label="Payment Terms (shown on invoices)" className="col-span-2">
          <textarea placeholder="Payment Terms (shown on invoices)" value={form.payment_terms || ''}
            onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
            className="w-full px-4 py-2 border rounded" />
        </Field>
        <Field label="Return Policy (shown on invoices)" className="col-span-2">
          <textarea placeholder="Return Policy (shown on invoices)" value={form.return_policy || ''}
            onChange={(e) => setForm({ ...form, return_policy: e.target.value })}
            className="w-full px-4 py-2 border rounded" />
        </Field>
      </div>
      {message && <p className="text-green-600 mb-4 text-sm">{message}</p>}
      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
        Save Shop Settings
      </button>
    </form>
  )
}

function PrinterTab() {
  const [form, setForm] = useState({
    shop_name: '', shop_address: '', shop_phone: '', shop_email: '',
    gst_number: '', gst_rate: '', payment_terms: '', return_policy: '',
    thermal_printing_enabled: false, thermal_printer_name: '', thermal_paper_width: 80
  })
  const [printers, setPrinters] = useState([])
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [message, setMessage] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    // Load the full settings object (not just printer fields) since Save sends the whole
    // thing back - update-shop-settings replaces every field, it doesn't merge partial data.
    window.ipcRenderer.invoke('get-shop-settings').then(data => {
      setForm(f => ({ ...f, ...data, thermal_printing_enabled: !!data.thermal_printing_enabled }))
    })
    loadPrinters()
  }, [])

  const loadPrinters = async () => {
    setLoadingPrinters(true)
    const list = await window.ipcRenderer.invoke('list-printers')
    setPrinters(Array.isArray(list) ? list : [])
    setLoadingPrinters(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    const result = await window.ipcRenderer.invoke('update-shop-settings', form)
    setMessage(result.success ? 'Saved' : (result.message || 'Failed to save'))
    setTimeout(() => setMessage(''), 3000)
  }

  const handleTestPrint = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await window.ipcRenderer.invoke('test-print', {
      printerName: form.thermal_printer_name,
      paperWidth: form.thermal_paper_width
    })
    setTestResult(result)
    setTesting(false)
  }

  return (
    <form onSubmit={handleSave} className="bg-white rounded-lg shadow p-6 max-w-2xl">
      <h2 className="text-xl font-bold mb-1">Thermal Receipt Printer</h2>
      <p className="text-sm text-gray-500 mb-4">
        Sends receipts straight to the printer below, skipping the print dialog. This has not
        been verified against real thermal-printer hardware - use "Test Print" to confirm it
        actually works before relying on it. The printer must already be installed and show up
        in Windows' own printer list (Settings &gt; Printers &amp; scanners) - install it there first.
      </p>

      <label className="flex items-center gap-2 mb-4">
        <input type="checkbox" checked={!!form.thermal_printing_enabled}
          onChange={(e) => setForm({ ...form, thermal_printing_enabled: e.target.checked })} />
        <span>Print receipts directly to the printer below</span>
      </label>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Printer">
          <div className="flex gap-2">
            <select value={form.thermal_printer_name || ''}
              onChange={(e) => setForm({ ...form, thermal_printer_name: e.target.value })}
              className="w-full px-3 py-2 border rounded">
              <option value="">Select a printer...</option>
              {printers.map(p => (
                <option key={p.name} value={p.name}>{p.displayName || p.name}{p.isDefault ? ' (default)' : ''}</option>
              ))}
            </select>
            <button type="button" onClick={loadPrinters} className="px-3 py-2 border rounded text-sm hover:bg-gray-50 whitespace-nowrap">
              {loadingPrinters ? '...' : 'Refresh'}
            </button>
          </div>
          {printers.length === 0 && !loadingPrinters && (
            <p className="text-xs text-gray-400 mt-1">No printers found. Install it in Windows, then Refresh.</p>
          )}
        </Field>
        <Field label="Paper Width">
          <select value={form.thermal_paper_width || 80}
            onChange={(e) => setForm({ ...form, thermal_paper_width: parseInt(e.target.value) })}
            className="w-full px-3 py-2 border rounded">
            <option value={80}>80mm</option>
            <option value={58}>58mm</option>
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={handleTestPrint} disabled={!form.thermal_printer_name || testing}
          className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50">
          {testing ? 'Printing...' : 'Test Print'}
        </button>
        {testResult && (
          <span className={testResult.success ? 'text-green-600 text-sm' : 'text-red-600 text-sm'}>
            {testResult.success ? '✓ Sent - check the printer for output' : `✗ ${testResult.message || 'Failed'}`}
          </span>
        )}
      </div>

      {message && <p className="text-green-600 mb-4 text-sm">{message}</p>}
      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
        Save Printer Settings
      </button>
    </form>
  )
}

function UsersRolesTab() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [userForm, setUserForm] = useState({ username: '', password: '', roleId: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [])

  const loadUsers = async () => setUsers(await window.ipcRenderer.invoke('get-users'))
  const loadRoles = async () => setRoles(await window.ipcRenderer.invoke('get-roles'))

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setError('')
    const result = await window.ipcRenderer.invoke('create-user', userForm)
    if (result.success) {
      setShowUserForm(false)
      setUserForm({ username: '', password: '', roleId: '' })
      loadUsers()
    } else {
      setError(result.message)
    }
  }

  const handleDeleteUser = async (user) => {
    if (!confirm(`Delete user "${user.username}"?`)) return
    await window.ipcRenderer.invoke('delete-user', user.id)
    loadUsers()
  }

  const togglePermission = (roleId, currentPermissions, key) => {
    const updated = { ...currentPermissions, [key]: !currentPermissions[key] }
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: updated } : r))
  }

  const saveRolePermissions = async (role) => {
    await window.ipcRenderer.invoke('update-role-permissions', { roleId: role.id, permissions: role.permissions })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Users</h2>
          <button onClick={() => setShowUserForm(v => !v)} className="text-blue-600 hover:underline text-sm">
            + New User
          </button>
        </div>

        {showUserForm && (
          <form onSubmit={handleCreateUser} className="border rounded p-4 mb-4 bg-gray-50">
            <Field label="Username" className="mb-2">
              <input required placeholder="Username" value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                className="w-full px-3 py-2 border rounded" />
            </Field>
            <Field label="Password" className="mb-2">
              <input required type="password" placeholder="Password" value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="w-full px-3 py-2 border rounded" />
            </Field>
            <Field label="Role" className="mb-2">
              <select required value={userForm.roleId}
                onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}
                className="w-full px-3 py-2 border rounded">
                <option value="">Select Role</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.role_name}</option>)}
              </select>
            </Field>
            {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
              Create User
            </button>
          </form>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Username</th>
              <th className="py-2">Role</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.username}</td>
                <td className="py-2">{u.role_name}</td>
                <td className="py-2 text-right">
                  <button onClick={() => handleDeleteUser(u)} className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Role Permissions</h2>
        <div className="space-y-6">
          {roles.map(role => (
            <div key={role.id} className="border-b pb-4 last:border-0">
              <div className="flex justify-between items-center mb-2">
                <p className="font-bold">{role.role_name}</p>
                <button onClick={() => saveRolePermissions(role)} className="text-blue-600 hover:underline text-sm">
                  Save
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {PERMISSION_KEYS.map(key => (
                  <label key={key} className="flex items-center gap-2 text-sm capitalize">
                    <input
                      type="checkbox"
                      checked={!!role.permissions[key]}
                      onChange={() => togglePermission(role.id, role.permissions, key)}
                    />
                    {key}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BackupTab() {
  const [backups, setBackups] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadBackups()
  }, [])

  const loadBackups = async () => setBackups(await window.ipcRenderer.invoke('list-backups'))

  const handleCreateBackup = async () => {
    const result = await window.ipcRenderer.invoke('create-backup')
    setMessage(result.success ? 'Backup created' : (result.message || 'Backup failed'))
    loadBackups()
    setTimeout(() => setMessage(''), 3000)
  }

  const handleRestore = async (backup) => {
    if (!confirm(`Restore from "${backup.filename}"? The app should be restarted after this.`)) return
    const result = await window.ipcRenderer.invoke('restore-backup', backup.path)
    setMessage(result.success ? 'Restored - please restart the app' : (result.message || 'Restore failed'))
  }

  const handleDelete = async (backup) => {
    if (!confirm(`Delete backup "${backup.filename}"?`)) return
    await window.ipcRenderer.invoke('delete-backup', backup.path)
    loadBackups()
  }

  const handleExportCsv = async (backup) => {
    const result = await window.ipcRenderer.invoke('export-backup-excel', backup.path)
    if (result.success) {
      setMessage(`Exported to ${result.filePath}`)
      setTimeout(() => setMessage(''), 5000)
    } else if (!result.canceled) {
      setMessage(result.message || 'Export failed')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Backup & Restore</h2>
        <button onClick={handleCreateBackup} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Create Backup Now
        </button>
      </div>
      {message && <p className="text-green-600 mb-4 text-sm">{message}</p>}
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 px-3">Filename</th>
            <th className="py-2 px-3 whitespace-nowrap">Created</th>
            <th className="py-2 px-3 text-right whitespace-nowrap">Size</th>
            <th className="py-2 px-3 text-right whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          {backups.map(b => (
            <tr key={b.filename} className="border-b">
              <td className="py-2 px-3">{b.filename}</td>
              <td className="py-2 px-3 whitespace-nowrap">{new Date(b.createdAt).toLocaleString()}</td>
              <td className="py-2 px-3 text-right whitespace-nowrap">{(b.size / 1024).toFixed(0)} KB</td>
              <td className="py-2 px-3 text-right space-x-3 whitespace-nowrap">
                <button onClick={() => handleRestore(b)} className="text-blue-600 hover:underline">Restore</button>
                <button onClick={() => handleExportCsv(b)} className="text-gray-600 hover:underline">Export to Excel</button>
                <button onClick={() => handleDelete(b)} className="text-red-600 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
          {backups.length === 0 && (
            <tr><td colSpan="4" className="py-6 text-center text-gray-400">No backups yet</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}

function UpdatesTab() {
  const { status, version, progress, error, currentVersion, checkForUpdates, installNow } = useAppUpdater()

  const statusLine = () => {
    switch (status) {
      case 'checking': return 'Checking for updates...'
      case 'available': return `Update v${version} found - downloading...`
      case 'downloading': return `Downloading update... ${Math.round(progress)}%`
      case 'downloaded': return 'Update downloaded and ready to install.'
      case 'not-available': return "You're on the latest version."
      case 'error': return error || 'Could not check for updates.'
      default: return null
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
      <h2 className="text-xl font-bold mb-4">App Updates</h2>
      <p className="text-sm text-gray-500 mb-4">Current version: <span className="font-medium text-gray-700">{currentVersion || '...'}</span></p>

      <button
        onClick={checkForUpdates}
        disabled={status === 'checking' || status === 'downloading'}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 mb-4"
      >
        Check for Updates
      </button>

      {statusLine() && (
        <p className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-gray-600'}`}>{statusLine()}</p>
      )}

      {status === 'downloading' && (
        <div className="w-full bg-gray-200 rounded h-2 mt-2 max-w-sm">
          <div className="bg-blue-600 h-2 rounded" style={{ width: `${Math.round(progress)}%` }} />
        </div>
      )}

      {status === 'downloaded' && (
        <button onClick={installNow} className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
          Restart & Install Now
        </button>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState('shop')

  const tabs = [
    { key: 'shop', label: 'Shop Info' },
    { key: 'printer', label: 'Printer' },
    { key: 'users', label: 'Users & Roles' },
    { key: 'backup', label: 'Backup & Restore' },
    { key: 'updates', label: 'Updates' }
  ]

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6">Settings</h1>

          <div className="flex gap-2 mb-6 border-b">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 font-medium ${tab === t.key ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'shop' && <ShopInfoTab />}
          {tab === 'printer' && <PrinterTab />}
          {tab === 'users' && <UsersRolesTab />}
          {tab === 'backup' && <BackupTab />}
          {tab === 'updates' && <UpdatesTab />}
        </div>
      </div>
    </div>
  )
}
