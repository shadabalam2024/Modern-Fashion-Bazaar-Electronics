import { COMPANY } from '../utils/brand'

export default function PoweredBy({ className = '' }) {
  return <p className={`text-center text-xs text-gray-400 ${className}`}>Powered by {COMPANY}</p>
}
