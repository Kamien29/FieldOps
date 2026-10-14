import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  const displayName = user?.name || user?.email || 'Użytkownik'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">System serwisowy</p>
          <h1>FieldOps</h1>
        </div>

        <nav className="topnav" aria-label="Główna nawigacja">
          <NavLink to="/jobs" end>
            Zlecenia
          </NavLink>
          <NavLink to="/jobs/new">Nowe zlecenie</NavLink>
        </nav>

        <div className="session">
          <p className="session-user">{displayName}</p>
          <button type="button" className="button-ghost" onClick={handleLogout}>
            Wyloguj
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
