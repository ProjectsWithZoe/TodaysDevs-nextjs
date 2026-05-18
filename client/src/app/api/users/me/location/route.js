import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'

export async function PATCH(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { lat, lng, city = null, country = null, country_code = null } = body

  if (typeof lat !== 'number' || typeof lng !== 'number' || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Bad Request', message: 'lat and lng are required numbers' }, { status: 400 })
  }

  await getPool().query(
    `UPDATE users SET lat = $1, lng = $2, city = $3, country = $4, country_code = $5 WHERE id = $6`,
    [lat, lng, city, country, country_code, user.sub]
  )

  return NextResponse.json({ lat, lng })
}
