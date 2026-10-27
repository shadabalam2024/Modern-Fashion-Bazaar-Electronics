import { COMPANY } from '../utils/brand'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../store/slices/auth'
import useAppUpdater from '../hooks/useAppUpdater'

export default function Navbar() {
  const user = useSelector(state => state.auth.user)
  const dispatch = useDispatch()
  const { status, version, progress, dismissed, updateNow, later, installNow } = useAppUpdater()
  const isAdmin = user?.role === 'Admin'

  return (
    <>
      <nav className="sticky top-0 z-10 bg-white shadow-md px-8 py-4 flex justify-between items-center">
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

      {isAdmin && !dismissed && (status === 'available' || status === 'downloading' || status === 'downloaded') && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            {status === 'available' ? (
              <>
                <h2 className="text-lg font-bold mb-1">Update available</h2>
                <p className="text-sm text-gray-600 mb-5">
                  A new version{version ? ` (v${version})` : ''} from {COMPANY} is ready. Update now? The app will restart, and your data stays safe.
                </p>
                <div className="flex gap-3">
                  <button onClick={later} className="flex-1 border py-2 rounded text-gray-700 hover:bg-gray-50">Later</button>
                  <button onClick={updateNow} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Update now</button>
                </div>
              </>
            ) : status === 'downloading' ? (
              <>
                <h2 className="text-lg font-bold mb-3">Downloading update...</h2>
                <div className="w-full bg-gray-200 rounded h-2 mb-2">
                  <div className="bg-blue-600 h-2 rounded" style={{ width: `${Math.round(progress)}%` }} />
                </div>
                <p className="text-sm text-gray-500">{Math.round(progress)}% - the app restarts by itself when it finishes.</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-1">Update ready</h2>
                <p className="text-sm text-gray-600 mb-5">Restart the app to finish installing it.</p>
                <div className="flex gap-3">
                  <button onClick={later} className="flex-1 border py-2 rounded text-gray-700 hover:bg-gray-50">Later</button>
                  <button onClick={installNow} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Restart &amp; install</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
