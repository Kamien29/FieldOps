import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function GuestRoute({ children }) {
  const { isAuthenticated, initializing } = useAuth()

  if (initializing) {
    return (
      <div className="page-status" role="status">
        Sprawdzanie sesji…
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/jobs" replace />
  }

  return children
}
