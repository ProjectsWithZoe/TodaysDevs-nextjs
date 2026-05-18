import crypto from 'crypto'

export function generateJoinCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}
