import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'

export async function GET(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pool = getPool()

  const { rows: [entry] } = await pool.query(
    `SELECT mq.id, mq.project_id, mq.mode, mq.queued_at
     FROM matchmaking_queue mq WHERE mq.user_id = $1`,
    [user.sub]
  )

  if (!entry) {
    const { rows: [room] } = await pool.query(
      `SELECT t.id AS room_id
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       WHERE tm.user_id = $1
         AND t.status = 'active'
         AND t.created_at > NOW() - INTERVAL '10 minutes'
       ORDER BY t.created_at DESC LIMIT 1`,
      [user.sub]
    )
    if (room) return NextResponse.json({ status: 'matched', room_id: room.room_id })
    return NextResponse.json({ status: 'not_queued' })
  }

  const { rows: [pos] } = await pool.query(
    `SELECT COUNT(*)::int AS position FROM matchmaking_queue
     WHERE project_id = $1 AND mode = $2 AND queued_at < $3`,
    [entry.project_id, entry.mode, entry.queued_at]
  )
  const { rows: [tot] } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM matchmaking_queue
     WHERE project_id = $1 AND mode = $2`,
    [entry.project_id, entry.mode]
  )

  return NextResponse.json({
    status:     'queued',
    project_id: entry.project_id,
    mode:       entry.mode,
    queued_at:  entry.queued_at,
    position:   (pos.position ?? 0) + 1,
    total:      tot.total ?? 1,
  })
}
