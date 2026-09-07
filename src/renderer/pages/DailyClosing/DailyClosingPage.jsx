import { useState, useEffect } from 'react'
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

function todayStr() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d - tz).toISOString().slice(0, 10)
}

export default function DailyClosingPage() {
  const user = useSelector(state => state.auth.user)

  const [date, setDate] = useState(todayStr())
  const [figures, setFigures] = useState(null)
  const [existing, setExisting] = useState(null)
  const [openingCash, setOpeningCash] = useState('')
  const [actualCash, setActualCash] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')

  const [history, setHistory] = useState([])

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    loadPreview(date)
  }, [date])

  const loadHistory = async () => {
    const data = await window.ipcRenderer.invoke('get-closing-history', { limit: 60 })
    setHistory(data)
  }

  const loadPreview = async (d) => {
    setMessage('')
    const preview = await window.ipcRenderer.invoke('get-closing-preview', d)
    setFigures(preview.figures)
    setExisting(preview.existing)
    setOpeningCash(String(preview.existing ? preview.existing.opening_cash : preview.suggestedOpeningCash))
    setActualCash(preview.existing ? String(preview.existing.actual_cash) : '')
    setNotes(preview.existing?.notes || '')
  }

  const openingNum = parseFloat(openingCash) || 0
  const actualNum = parseFloat(actualCash) || 0
  const expectedCash = figures ? openingNum + figures.cashSales + figures.paymentsReceivedCash - figures.refundsCash : 0
  const variance = actualNum - expectedCash

  const handleSave = async (e) => {
    e.preventDefault()
    setMessage('')
    const result = await window.ipcRenderer.invoke('save-daily-closing', {
      date,
      openingCash: openingNum,
      actualCash: actualNum,
      notes,
      userId: user?.id
    })
    if (result.success) {
      await loadPreview(date)
      loadHistory()
      setMessage('Closing saved')
    } else {
      setMessage(result.message || 'Failed to save closing')
    }
  }

  const varianceLabel = (v) => {
    if (Math.abs(v) < 0.005) return { text: 'Matches exactly', className: 'text-green-600' }
    if (v > 0) return { text: `₹${v.toFixed(2)} over`, className: 'text-blue-600' }
    return { text: `₹${Math.abs(v).toFixed(2)} short`, className: 'text-red-600' }
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1">
        <Navbar />
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6">Daily Closing</h1>

          <div className="bg-white rounded-lg shadow p-6 mb-6 max-w-2xl">
            <div className="flex items-end gap-3 mb-2">
              <Field label="Date">
                <input
                  type="date"
                  value={date}
                  max={todayStr()}
                  onChange={(e) => { if (e.target.value) setDate(e.target.value) }}
                  className="px-4 py-2 border rounded"
                />
              </Field>
              <button type="button" onClick={() => setDate(todayStr())} className="text-sm text-blue-600 hover:underline mb-2">
                Today
              </button>
              {existing && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded mb-2">Already closed - editing will overwrite</span>}
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Showing: <span className="font-medium text-gray-700">
                {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span> — if this isn't the date you meant to type, use the calendar icon or the Today button instead.
            </p>

            {figures && (
              <form onSubmit={handleSave}>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6">
                  <div className="flex justify-between"><span className="text-gray-500">Cash Sales</span><span>₹{figures.cashSales.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Card Sales</span><span>₹{figures.cardSales.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Credit Sales (not cash)</span><span>₹{figures.creditSales.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Cash Payments Received</span><span>₹{figures.paymentsReceivedCash.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Card Payments Received</span><span>₹{figures.paymentsReceivedCard.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Cash Refunds Issued</span><span className="text-red-600">-₹{figures.refundsCash.toFixed(2)}</span></div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Field label="Opening Cash">
                    <input
                      type="number" min="0" step="0.01"
                      value={openingCash}
                      onChange={(e) => setOpeningCash(e.target.value)}
                      className="w-full px-4 py-2 border rounded"
                    />
                  </Field>
                  <Field label="Actual Cash Counted">
                    <input
                      type="number" min="0" step="0.01" required autoFocus
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                      className="w-full px-4 py-2 border rounded"
                    />
                  </Field>
                </div>

                <div className="bg-gray-50 rounded p-4 mb-4 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Expected Cash in Drawer</span>
                    <span className="font-medium">₹{expectedCash.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Variance</span>
                    <span className={varianceLabel(variance).className}>{varianceLabel(variance).text}</span>
                  </div>
                </div>

                <Field label="Notes (optional)" className="mb-4">
                  <input
                    type="text"
                    placeholder="e.g. Gave wrong change earlier, short by ₹50"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2 border rounded"
                  />
                </Field>

                <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                  {existing ? 'Update Closing' : 'Save Closing'}
                </button>
                {message && <p className={`mt-3 text-sm ${message === 'Closing saved' ? 'text-green-600' : 'text-red-600'}`}>{message}</p>}
              </form>
            )}
          </div>

          <h2 className="text-xl font-bold mb-3">Closing History</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-right">Expected</th>
                  <th className="px-6 py-3 text-right">Actual</th>
                  <th className="px-6 py-3 text-right">Variance</th>
                  <th className="px-6 py-3 text-left">Closed By</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => {
                  const v = varianceLabel(h.variance)
                  return (
                    <tr key={h.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setDate(h.closing_date)}>
                      <td className="px-6 py-3">{h.closing_date}</td>
                      <td className="px-6 py-3 text-right">₹{h.expected_cash.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right">₹{h.actual_cash.toFixed(2)}</td>
                      <td className={`px-6 py-3 text-right ${v.className}`}>{v.text}</td>
                      <td className="px-6 py-3">{h.closed_by_username || '-'}</td>
                    </tr>
                  )
                })}
                {history.length === 0 && (
                  <tr><td colSpan="5" className="px-6 py-6 text-center text-gray-400">No closings recorded yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
