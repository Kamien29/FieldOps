import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from '../services/auth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  // Po odświeżeniu strony sesję odtwarza ciasteczko HttpOnly (GET /api/me).
  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const currentUser = await getCurrentUser()
        if (!cancelled) setUser(currentUser)
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function expireSession() {
      setUser(null)
    }
    window.addEventListener('fieldops:session-expired', expireSession)
    return () => window.removeEventListener('fieldops:session-expired', expireSession)
  }, [])

  const value = useMemo(
    () => ({
      user,
      initializing,
      isAuthenticated: Boolean(user),
      async login(credentials) {
        const nextUser = await loginRequest(credentials)
        setUser(nextUser)
        return nextUser
      },
      async register(input) {
        const nextUser = await registerRequest(input)
        setUser(nextUser)
        return nextUser
      },
      async logout() {
        try {
          await logoutRequest()
        } finally {
          setUser(null)
        }
      },
    }),
    [user, initializing],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth musi być używany wewnątrz AuthProvider.')
  }
  return context
}
