import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { login as loginRequest, logout as logoutRequest } from '../services/auth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Backend nie ma /me ani ciasteczek sesyjnych, a token jest tylko w pamięci,
  // więc po odświeżeniu strony użytkownik loguje się ponownie.
  const [user, setUser] = useState(null)

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
      initializing: false,
      isAuthenticated: Boolean(user),
      async login(credentials) {
        const nextUser = await loginRequest(credentials)
        setUser(nextUser)
        return nextUser
      },
      logout() {
        logoutRequest()
        setUser(null)
      },
    }),
    [user],
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
