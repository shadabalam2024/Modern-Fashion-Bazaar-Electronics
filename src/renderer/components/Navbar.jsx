import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../store/slices/auth'
import useAppUpdater from '../hooks/useAppUpdater'

export default function Navbar() {
  const user = useSelector(state => state.auth.user)
  const dispatch = useDispatch()
  const { status, version, progress, installNow } = useAppUpdater()

  return (
    <>
      <nav className="bg-white shadow-md px-8 py-4 flex justify-between items-center">
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

      {(status === 'available' || status === 'downloading' || status === 'downloaded') && (
        <div className="fixed bottom-4 right-4 z-30 bg-white border shadow-lg rounded-lg p-4 w-80">
          {status === 'available' && (
            <p className="text-sm">Update {version ? `v${version}` : ''} available - downloading...</p>
          )}
          {status === 'downloading' && (
            <>
              <p className="text-sm mb-2">Downloading update... {Math.round(progress)}%</p>
              <div className="w-full bg-gray-200 rounded h-2">
                <div className="bg-blue-600 h-2 rounded" style={{ width: `${Math.round(progress)}%` }} />
              </div>
            </>
          )}
          {status === 'downloaded' && (
            <>
              <p className="text-sm font-medium mb-2">Update ready to install</p>
              <button onClick={installNow} className="w-full bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700 text-sm">
                Restart & Install
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
