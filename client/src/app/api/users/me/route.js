import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'
import { posthog }      from '@/lib/server/posthog.js'

export async function GET(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows } = await getPool().query(
    `SELECT u.id, u.email, u.display_name, u.created_at, r.name AS role
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [user.sub]
  )
  if (rows.length === 0) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function PATCH(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { display_name } = body

  if (!display_name || typeof display_name !== 'string' || display_name.trim().length < 2 || display_name.trim().length > 50) {
    return NextResponse.json({ error: 'Bad Request', message: 'display_name must be 2–50 characters' }, { status: 400 })
  }

  const { rows } = await getPool().query(
    `UPDATE users SET display_name = $1 WHERE id = $2
     RETURNING id, email, display_name, created_at`,
    [display_name.trim(), user.sub]
  )

  posthog.capture({ distinctId: user.sub, event: 'user_display_name_updated', properties: {} })

  return NextResponse.json(rows[0])
}
