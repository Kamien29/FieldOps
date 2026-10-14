import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../services/api.js'
import { getCurrentUser, login as loginRequest, logout as logoutRequest, register as registerRequest } from '../services/auth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        const currentUser = await getCurrentUser()
        if (!cancelled) {
          setUser(currentUser)
        }
      } catch {
        if (!cancelled) {
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setInitializing(false)
        }
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      initializing,
      isAuthenticated: Boolean(user),
      async login(credentials) {
        const nextUser = await loginRequest(credentials)
        const resolvedUser = nextUser?.email ? nextUser : await getCurrentUser()
        setUser(resolvedUser)
        return resolvedUser
      },
      async register(input) {
        const nextUser = await registerRequest(input)
        if (nextUser?.email) {
          setUser(nextUser)
          return nextUser
        }
        try {
          const currentUser = await getCurrentUser()
          setUser(currentUser)
          return currentUser
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            return nextUser
          }
          throw error
        }
      },
      async logout() {
        await logoutRequest()
        setUser(null)
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
