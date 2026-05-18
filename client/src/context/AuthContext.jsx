'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { authClient } from '../lib/auth-client.js'
import api            from '../api/client.js'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { data: session, isPending: sessionLoading } = authClient.useSession()

  const [appUser,        setAppUser]        = useState(null)
  const [appUserFetched, setAppUserFetched] = useState(false)

  useEffect(() => {
    if (!session?.user) {
      setAppUser(null)
      setAppUserFetched(false)
      return
    }
    let cancelled = false
    api.get('/users/me')
      .then(({ data }) => { if (!cancelled) setAppUser(data) })
      .catch(() =>         { if (!cancelled) setAppUser(null) })
      .finally(() =>       { if (!cancelled) setAppUserFetched(true) })
    return () => { cancelled = true }
  }, [session?.user?.id])

  const user = session?.user
    ? { ...session.user, ...appUser }
    : null

  const value = {
    user,
    isLoading: sessionLoading || (!!session?.user && !appUserFetched),

    login:  (email, password) => authClient.signIn.email({ email, password }),

    logout: async () => {
      await authClient.signOut()
      setAppUser(null)
    },

    updateUser: (patch) =>
      setAppUser(prev => prev ? { ...prev, ...patch } : patch),
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
