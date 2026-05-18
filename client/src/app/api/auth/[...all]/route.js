import { auth }             from '@/lib/server/auth.js'
import { toNextJsHandler }  from 'better-auth/next-js'

export const { GET, POST } = toNextJsHandler(auth)
