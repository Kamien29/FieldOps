import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute.jsx'

const authState = {
  isAuthenticated: false,
  initializing: false,
}

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => authState,
}))

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/jobs']}>
      <Routes>
        <Route path="/login" element={<p>Strona logowania</p>} />
        <Route
          path="/jobs"
          element={
            <ProtectedRoute>
              <p>Lista zleceń</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.initializing = false
  })

  it('shows a session check while auth is initializing', () => {
    authState.initializing = true
    renderProtected()
    expect(screen.getByRole('status')).toHaveTextContent('Sprawdzanie sesji')
  })

  it('redirects anonymous users to login', () => {
    renderProtected()
    expect(screen.getByText('Strona logowania')).toBeInTheDocument()
  })

  it('renders protected content for signed-in users', () => {
    authState.isAuthenticated = true
    renderProtected()
    expect(screen.getByText('Lista zleceń')).toBeInTheDocument()
  })
})
