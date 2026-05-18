import { auth }    from '../auth.js'
import { getPool } from '../db.js'

function resolvePublicIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = (
    (forwarded ? forwarded.split(',')[0] : null) ||
    request.headers.get('x-real-ip') ||
    ''
  ).trim()

  if (!ip || /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|localhost)/i.test(ip)) {
    return null
  }
  return ip
}

async function geolocateIp(ip) {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { 'User-Agent': 'TodaysDevs/1.0' },
      signal:  AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.error || !data.latitude || !data.longitude) return null
    return {
      lat:          data.latitude,
      lng:          data.longitude,
      city:         data.city         || null,
      country:      data.country_name || null,
      country_code: data.country_code || null,
    }
  } catch {
    return null
  }
}

function parseUserAgent(ua = '') {
  let browser = 'Unknown'
  let device  = 'Desktop'

  if      (/Edg\//i.test(ua))                             browser = 'Edge'
  else if (/OPR\/|Opera/i.test(ua))                       browser = 'Opera'
  else if (/Chrome\//i.test(ua))                          browser = 'Chrome'
  else if (/Firefox\//i.test(ua))                         browser = 'Firefox'
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua))  browser = 'Safari'

  if      (/iPhone/i.test(ua))           device = 'iPhone'
  else if (/iPad/i.test(ua))             device = 'iPad'
  else if (/Android.*Mobile/i.test(ua))  device = 'Android'
  else if (/Android/i.test(ua))          device = 'Tablet'
  else if (/Macintosh/i.test(ua))        device = 'Mac'
  else if (/Windows NT/i.test(ua))       device = 'Windows'
  else if (/Linux/i.test(ua))            device = 'Linux'

  return { browser, device }
}

/**
 * Validates the session and resolves the app-level user.
 * Returns { sub, email, role, roleId } or null if unauthenticated.
 */
export async function authenticate(request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return null

  const email = session.user.email
  const pool  = getPool()

  let { rows } = await pool.query(
    `SELECT u.id, u.email, u.display_name, r.name AS role, u.role_id,
            u.lat, u.lng, u.ua_browser, u.ua_device
     FROM   users u
     LEFT   JOIN roles r ON r.id = u.role_id
     WHERE  u.email = $1`,
    [email]
  )

  if (rows.length === 0) {
    const ins = await pool.query(
      `INSERT INTO users (email) VALUES ($1) RETURNING id, email, display_name, role_id`,
      [email]
    )
    rows = ins.rows.map(r => ({ ...r, role: null, lat: null, lng: null, ua_browser: null, ua_device: null }))
  }

  const u = rows[0]

  const { browser, device } = parseUserAgent(request.headers.get('user-agent') || '')
  pool.query(
    'UPDATE users SET ua_browser = $1, ua_device = $2, last_seen_at = NOW() WHERE id = $3',
    [browser, device, u.id]
  ).catch(() => {})

  if (u.lat == null) {
    const publicIp = resolvePublicIp(request)
    if (publicIp) {
      geolocateIp(publicIp).then(geo => {
        if (geo) {
          pool.query(
            `UPDATE users
             SET lat = $1, lng = $2, city = $3, country = $4, country_code = $5
             WHERE id = $6`,
            [geo.lat, geo.lng, geo.city, geo.country, geo.country_code, u.id]
          ).catch(() => {})
        }
      })
    }
  }

  return {
    sub:    u.id,
    email:  u.email,
    role:   u.role    ?? null,
    roleId: u.role_id ?? null,
  }
}
