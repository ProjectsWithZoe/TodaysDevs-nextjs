import pg from 'pg'

function cleanUrl(raw) {
  const url = new URL(raw)
  url.searchParams.delete('sslmode')
  url.searchParams.delete('channel_binding')
  url.searchParams.delete('uselibpqcompat')
  return url.toString()
}

let _pool

export function getPool() {
  if (!_pool) {
    const isProduction = process.env.NODE_ENV === 'production'
    _pool = new pg.Pool({
      connectionString: cleanUrl(process.env.DATABASE_URL),
      ssl: isProduction
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    })
  }
  return _pool
}

export const db = getPool
