import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../store/slices/auth'

export default function Navbar() {
  const user = useSelector(state => state.auth.user)
  const dispatch = useDispatch()

  return (
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
  )
}
