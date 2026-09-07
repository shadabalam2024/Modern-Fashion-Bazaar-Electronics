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
          <label className="block text-xs text-gray-500 mb-1">License Key</label>
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
