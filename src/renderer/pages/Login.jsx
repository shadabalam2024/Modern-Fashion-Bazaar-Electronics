import PoweredBy from '../components/PoweredBy'
import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { setUser } from '../store/slices/auth'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const dispatch = useDispatch()

  // Forgot-password flow: 'login' -> 'request' (show request code) -> 'newpass' (code verified)
  const [mode, setMode] = useState('login')
  const [challenge, setChallenge] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetUsers, setResetUsers] = useState([])
  const [resetUserId, setResetUserId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [info, setInfo] = useState('')

  const startReset = async () => {
    setMessage(''); setInfo('')
    const result = await window.ipcRenderer.invoke('get-reset-challenge')
    if (!result.success) { setMessage(result.message); return }
    setChallenge(result.challenge)
    setResetCode('')
    setMode('request')
  }

  const verifyCode = async (e) => {
    e.preventDefault()
    setMessage('')
    const result = await window.ipcRenderer.invoke('verify-reset-code', { resetCode })
    if (!result.success) { setMessage(result.message); return }
    setResetUsers(result.users)
    setResetUserId(String(result.users[0]?.id ?? ''))
    setMode('newpass')
  }

  const completeReset = async (e) => {
    e.preventDefault()
    setMessage('')
    const result = await window.ipcRenderer.invoke('complete-password-reset', {
      resetCode, userId: Number(resetUserId), newPassword
    })
    if (!result.success) { setMessage(result.message); return }
    const chosen = resetUsers.find(u => String(u.id) === resetUserId)
    setUsername(chosen?.username || '')
    setPassword('')
    setNewPassword('')
    setInfo('Password changed. Please log in with your new password.')
    setMode('login')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    const result = await window.ipcRenderer.invoke('user-login', { username, password })
    
    if (result.success) {
      dispatch(setUser({ user: result.user, permissions: result.user.permissions }))
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-3xl font-bold mb-6 text-center">Modern Fashion Bazaar</h1>
        {mode === 'request' && (
          <form onSubmit={verifyCode}>
            <p className="text-sm text-gray-600 mb-2">
              Send this request code to support. Keep this app open, then enter the reset code you get back.
            </p>
            <div className="bg-gray-100 border rounded px-3 py-2 mb-4 font-mono text-sm break-all select-all">{challenge}</div>
            <label className="block text-xs text-gray-500 mb-1">Reset code</label>
            <textarea
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border rounded mb-4 font-mono text-xs"
            />
            {message && <p className="text-red-500 mb-4">{message}</p>}
            <button type="submit" disabled={!resetCode.trim()} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
              Verify code
            </button>
            <button type="button" onClick={() => { setMode('login'); setMessage('') }} className="w-full text-sm text-gray-500 mt-3 hover:text-gray-700">
              Back to login
            </button>
          </form>
        )}
        {mode === 'newpass' && (
          <form onSubmit={completeReset}>
            <label className="block text-xs text-gray-500 mb-1">Account</label>
            <select value={resetUserId} onChange={(e) => setResetUserId(e.target.value)} className="w-full px-4 py-2 border rounded mb-4">
              {resetUsers.map(u => <option key={u.id} value={u.id}>{u.username} ({u.role_name})</option>)}
            </select>
            <label className="block text-xs text-gray-500 mb-1">New password</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded mb-4"
            />
            {message && <p className="text-red-500 mb-4">{message}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
              Set new password
            </button>
          </form>
        )}
        {mode === 'login' && (
        <form onSubmit={handleLogin}>
          <label className="block text-xs text-gray-500 mb-1">Username</label>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 border rounded mb-4"
          />
          <label className="block text-xs text-gray-500 mb-1">Password</label>
          <div className="relative mb-4">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {info && <p className="text-green-600 mb-4">{info}</p>}
          {message && <p className="text-red-500 mb-4">{message}</p>}
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
            Login
          </button>
          <button type="button" onClick={startReset} className="w-full text-sm text-blue-600 mt-3 hover:underline">
            Forgot username or password?
          </button>
        </form>
        )}
        <PoweredBy className="mt-6" />
      </div>
    </div>
  )
}
