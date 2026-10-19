import { useState, useEffect } from 'react'
import Navbar from '../../components/Navbar'
import Sidebar from '../../components/Sidebar'

const pad = (n) => String(n).padStart(2, '0')
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayStr = () => dateStr(new Date())
const monthStart = () => { const d = new Date(); return dateStr(new Date(d.getFullYear(), d.getMonth(), 1)) }
const yearStart = () => `${new Date().getFullYear()}-01-01`

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const SOURCE_LABELS = {
  sale: 'Sale',
  customer_payment: 'Customer payment',
  purchase: 'Purchase',
  refund: 'Refund',
  owner_in: 'Owner money in',
  owner_out: 'Owner withdrawal',
  expense: 'Expense'
}

// Filter choices -> which ledger sources they show
const FILTERS = {
  all: { label: 'All', sources: null },
  sale: { label: 'Sales', sources: ['sale'] },
  customer_payment: { label: 'Customer payments', sources: ['customer_payment'] },
  purchase: { label: 'Purchases', sources: ['purchase'] },
  expense: { label: 'Expenses', sources: ['expense'] },
  refund: { label: 'Refunds', sources: ['refund'] },
  owner: { label: 'Owner money', sources: ['owner_in', 'owner_out'] }
}

const ENTRY_TYPES = {
  owner_in: { label: 'Owner added money', hint: 'Money the owner put into the shop, e.g. for extra buying.' },
  expense: { label: 'Shop expense', hint: 'Rent, salary, electricity, tea, repairs, and so on.' },
  owner_out: { label: 'Owner withdrew money', hint: 'Money the owner took out of the shop for personal use.' }
}

const EXPENSE_SUGGESTIONS = ['Rent', 'Salary', 'Electricity', 'Water', 'Internet / Phone', 'Tea / Food', 'Repairs', 'Packaging', 'Delivery', 'Cleaning', 'Other']

function Field({ label, className = '', children }) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Card({ label, value, tone = '', sub }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function LedgerPage() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayStr())
  const [ledger, setLedger] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [outputMessage, setOutputMessage] = useState('')
  const [outputError, setOutputError] = useState(false)

  const [entryType, setEntryType] = useState('owner_in')
  const [form, setForm] = useState({ amount: '', category: '', paymentMode: 'cash', entryDate: todayStr(), notes: '' })
  const [formError, setFormError] = useState('')
  const [formMessage, setFormMessage] = useState('')

  const load = async () => {
    setError('')
    const result = await window.ipcRenderer.invoke('get-ledger', { from, to })
    if (result.success) setLedger(result)
    else setError(result.message || 'Could not load the ledger')
  }

  useEffect(() => {
    if (from && to && from <= to) load()
  }, [from, to])

  const handlePrint = async () => {
    setOutputMessage('')
    const result = await window.ipcRenderer.invoke('print-ledger', { from, to, filter })
    if (!result.success) {
      setOutputError(true)
      setOutputMessage(result.message || 'Could not open the print preview')
    }
  }

  const handleExport = async () => {
    setOutputMessage('')
    const result = await window.ipcRenderer.invoke('export-ledger-excel', { from, to, filter })
    if (result.success) {
      setOutputError(false)
      setOutputMessage(`Exported to ${result.filePath}`)
      setTimeout(() => setOutputMessage(''), 5000)
    } else if (!result.canceled) {
      setOutputError(true)
      setOutputMessage(result.message || 'Export failed')
    }
  }

  const setRange = (f, t) => { setFrom(f); setTo(t) }

  const handleAdd = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormMessage('')
    const result = await window.ipcRenderer.invoke('add-ledger-entry', {
      type: entryType,
      category: form.category,
      amount: parseFloat(form.amount),
      paymentMode: form.paymentMode,
      entryDate: form.entryDate,
      notes: form.notes
    })
    if (result.success) {
      setFormMessage('Saved')
      setTimeout(() => setFormMessage(''), 3000)
      setForm(f => ({ ...f, amount: '', category: '', notes: '' }))
      // Make sure the new entry is inside the range being viewed
      if (form.entryDate < from) setFrom(form.entryDate)
      else if (form.entryDate > to) setTo(form.entryDate)
      else load()
    } else {
      setFormError(result.message || 'Failed to save')
    }
  }

  const handleDelete = async (row) => {
    if (!confirm(`Delete this entry (${row.description}, ${money(row.amt_in || row.amt_out)})?`)) return
    const result = await window.ipcRenderer.invoke('delete-ledger-entry', row.ref_id)
    if (result.success) load()
    else alert(result.message || 'Failed to delete')
  }

  const s = ledger?.summary

  const visibleRows = ledger
    ? ledger.rows.filter(r => !FILTERS[filter].sources || FILTERS[filter].sources.includes(r.source))
    : []
  const visibleIn = visibleRows.reduce((t, r) => t + r.amt_in, 0)
  const visibleOut = visibleRows.reduce((t, r) => t + r.amt_out, 0)

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Navbar />
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Ledger</h1>
            <div className="flex gap-3">
              <button
                onClick={handlePrint}
                disabled={!ledger}
                className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Print
              </button>
              <button
                onClick={handleExport}
                disabled={!ledger}
                className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Export to Excel
              </button>
            </div>
          </div>
          {outputMessage && <p className={`text-sm mb-4 ${outputError ? 'text-red-600' : 'text-green-600'}`}>{outputMessage}</p>}

          <div className="flex flex-wrap items-end gap-3 mb-6">
            <Field label="From">
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="px-4 py-2 border rounded" />
            </Field>
            <Field label="To">
              <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="px-4 py-2 border rounded" />
            </Field>
            <div className="flex gap-3 mb-2 text-sm">
              <button onClick={() => setRange(todayStr(), todayStr())} className="text-blue-600 hover:underline">Today</button>
              <button onClick={() => setRange(monthStart(), todayStr())} className="text-blue-600 hover:underline">This month</button>
              <button onClick={() => setRange(yearStart(), todayStr())} className="text-blue-600 hover:underline">This year</button>
            </div>
          </div>

          {error && <p className="text-red-500 mb-4">{error}</p>}

          {s && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <Card label="Money In" value={money(s.moneyIn)} tone="text-green-600" sub="Sales, customer payments, owner money" />
                <Card label="Money Out" value={money(s.moneyOut)} tone="text-red-600" sub="Purchases, expenses, refunds, withdrawals" />
                <Card label="Balance at End" value={money(ledger.closingBalance)} sub={`Started at ${money(ledger.openingBalance)}`} />
                <Card label="Customers Owe You" value={money(s.customersOwe)} sub="Unpaid credit sales (all time)" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card label="Net Sales" value={money(s.netSales)} sub="After refunds, before GST" />
                <Card label="Gross Profit" value={money(s.grossProfit)} sub={`Cost of goods sold ${money(s.costOfGoods)}`} />
                <Card label="Shop Expenses" value={money(s.expenses)} />
                <Card label="Net Profit" value={money(s.netProfit)} tone={s.netProfit >= 0 ? 'text-green-600' : 'text-red-600'} sub="Gross profit minus expenses" />
              </div>
            </>
          )}

          <div className="bg-white rounded-lg shadow p-6 mb-8 max-w-3xl">
            <h2 className="text-xl font-bold mb-3">Add Entry</h2>
            <div className="flex gap-2 mb-2">
              {Object.entries(ENTRY_TYPES).map(([key, { label }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setEntryType(key); setFormError('') }}
                  className={`px-4 py-2 rounded border text-sm ${entryType === key ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-4">{ENTRY_TYPES[entryType].hint}</p>
            <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {entryType === 'expense' && (
                <Field label="What was it for?" className="sm:col-span-2">
                  <input
                    list="expense-suggestions" required placeholder="e.g. Rent, Salary, Electricity"
                    value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-4 py-2 border rounded"
                  />
                  <datalist id="expense-suggestions">
                    {EXPENSE_SUGGESTIONS.map(c => <option key={c} value={c} />)}
                  </datalist>
                </Field>
              )}
              <Field label="Amount (₹)">
                <input
                  type="number" min="0.01" step="0.01" required
                  value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full px-4 py-2 border rounded"
                />
              </Field>
              <Field label="Date">
                <input
                  type="date" required max={todayStr()}
                  value={form.entryDate} onChange={(e) => e.target.value && setForm({ ...form, entryDate: e.target.value })}
                  className="w-full px-4 py-2 border rounded"
                />
              </Field>
              <Field label="Paid / received by">
                <select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })} className="w-full px-4 py-2 border rounded">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank transfer</option>
                </select>
              </Field>
              <Field label="Note (optional)">
                <input
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-2 border rounded"
                />
              </Field>
              {formError && <p className="text-red-500 text-sm sm:col-span-2">{formError}</p>}
              {formMessage && <p className="text-green-600 text-sm sm:col-span-2">{formMessage}</p>}
              <button type="submit" className="sm:col-span-2 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                Save {ENTRY_TYPES[entryType].label}
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm text-gray-500 mr-1">Show:</span>
            {Object.entries(FILTERS).map(([key, { label }]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full border text-sm ${filter === key ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Details</th>
                  <th className="px-4 py-3 text-left">Mode</th>
                  <th className="px-4 py-3 text-right">Money In</th>
                  <th className="px-4 py-3 text-right">Money Out</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <tr key={`${r.source}-${r.ref_id}`} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap">{new Date(r.d + 'T00:00:00').toLocaleDateString()}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{SOURCE_LABELS[r.source] || r.source}</td>
                    <td className="px-4 py-2">{r.description}</td>
                    <td className="px-4 py-2 capitalize">{r.mode}</td>
                    <td className="px-4 py-2 text-right text-green-600">{r.amt_in > 0 ? money(r.amt_in) : ''}</td>
                    <td className="px-4 py-2 text-right text-red-600">{r.amt_out > 0 ? money(r.amt_out) : ''}</td>
                    <td className="px-4 py-2 text-right font-medium">{money(r.balance)}</td>
                    <td className="px-4 py-2 text-right">
                      {r.deletable && <button onClick={() => handleDelete(r)} className="text-red-600 hover:underline">Delete</button>}
                    </td>
                  </tr>
                ))}
                {ledger && visibleRows.length === 0 && (
                  <tr><td colSpan="8" className="py-8 text-center text-gray-400">
                    {filter === 'all' ? 'No money movements in this period' : `No ${FILTERS[filter].label.toLowerCase()} in this period`}
                  </td></tr>
                )}
                {ledger && filter !== 'all' && visibleRows.length > 0 && (
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-4 py-2" colSpan="4">Total {FILTERS[filter].label.toLowerCase()} ({visibleRows.length})</td>
                    <td className="px-4 py-2 text-right text-green-600">{visibleIn > 0 ? money(visibleIn) : ''}</td>
                    <td className="px-4 py-2 text-right text-red-600">{visibleOut > 0 ? money(visibleOut) : ''}</td>
                    <td colSpan="2"></td>
                  </tr>
                )}
                {ledger && (
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <td className="px-4 py-2" colSpan="6">Opening balance</td>
                    <td className="px-4 py-2 text-right">{money(ledger.openingBalance)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            {filter !== 'all' && 'The balance column is the overall shop balance, not just this filter. '}Credit sales only count as money in once the customer pays. Purchases (including transport) count as money out on the day they are created.
          </p>
        </div>
      </div>
    </div>
  )
}
