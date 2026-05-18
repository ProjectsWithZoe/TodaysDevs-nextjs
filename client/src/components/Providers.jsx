'use client'

import { AuthProvider } from '@/context/AuthContext.jsx'
import { Toaster }      from 'react-hot-toast'
import { Analytics }    from '@vercel/analytics/react'

export function Providers({ children }) {
  return (
    <AuthProvider>
      {children}
      <Toaster position="top-right" />
      <Analytics />
    </AuthProvider>
  )
}
