import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'
import { posthog }      from '@/lib/server/posthog.js'

export async function PATCH(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { role } = await request.json()
  if (!['frontend', 'backend', 'fullstack'].includes(role)) {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid role' }, { status: 400 })
  }

  const { rows } = await getPool().query('SELECT id FROM roles WHERE name = $1', [role])
  if (rows.length === 0) return NextResponse.json({ error: 'Bad Request', message: 'Invalid role' }, { status: 400 })

  await getPool().query('UPDATE users SET role_id = $1 WHERE id = $2', [rows[0].id, user.sub])

  posthog.capture({ distinctId: user.sub, event: 'user_role_updated', properties: { role } })

  return NextResponse.json({ role })
}
