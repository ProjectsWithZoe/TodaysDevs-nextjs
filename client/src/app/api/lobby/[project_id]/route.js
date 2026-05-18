import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'

export async function GET(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { project_id } = await params
  const mode = new URL(request.url).searchParams.get('mode')

  if (!['duo', 'team'].includes(mode)) {
    return NextResponse.json({ error: 'Bad Request', message: 'mode must be duo or team' }, { status: 400 })
  }

  const { rows } = await getPool().query(
    `SELECT
       COALESCE(u.display_name, u.email) AS display_name,
       r.name                            AS role,
       EXTRACT(EPOCH FROM (NOW() - mq.queued_at))::int AS wait_seconds
     FROM matchmaking_queue mq
     LEFT JOIN users u ON u.id = mq.user_id
     LEFT JOIN roles r ON r.id = mq.role_id
     WHERE mq.project_id = $1 AND mq.mode = $2
     ORDER BY mq.queued_at ASC`,
    [project_id, mode]
  )

  return NextResponse.json(rows)
}
