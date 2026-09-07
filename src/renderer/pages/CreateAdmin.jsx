import { useState } from 'react'

export default function CreateAdmin({ onCreated }) {
  const [shopName, setShopName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setMessage('Passwords do not match')
      return
    }

    const result = await window.ipcRenderer.invoke('create-admin', { username, password, shopName })

    if (result.success) {
      onCreated()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-1 text-center">Welcome</h1>
        <p className="text-sm text-gray-600 mb-6 text-center">Set up your shop and admin account to get started.</p>
        <form onSubmit={handleCreate}>
          <label className="block text-xs text-gray-500 mb-1">Shop Name</label>
          <input
            type="text"
            placeholder="Shop Name"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded mb-4"
          />
          <label className="block text-xs text-gray-500 mb-1">Admin Username</label>
          <input
            type="text"
            placeholder="Admin Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded mb-4"
          />
          <label className="block text-xs text-gray-500 mb-1">Password</label>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded mb-4"
          />
          <label className="block text-xs text-gray-500 mb-1">Confirm Password</label>
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded mb-4"
          />
          {message && <p className="text-red-500 mb-4">{message}</p>}
          <button type="submit" className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
            Create Account
          </button>
        </form>
      </div>
    </div>
  )
}
