import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'

export async function PATCH(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params
  const { decision } = await request.json()

  if (!['requeue', 'dissolve'].includes(decision)) {
    return NextResponse.json({ error: 'Bad Request', message: 'decision must be "requeue" or "dissolve"' }, { status: 400 })
  }

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    const { rows: [team] } = await client.query(
      `SELECT id, mode, status, project_id FROM teams WHERE id = $1 FOR UPDATE`,
      [teamId]
    )
    if (!team) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Not Found', message: 'Room not found' }, { status: 404 })
    }

    if (team.status !== 'partner_left') {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Conflict', message: 'Room is not in partner_left state' }, { status: 409 })
    }

    const { rows: membership } = await client.query(
      'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, user.sub]
    )
    if (membership.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden', message: 'Not a member of this room' }, { status: 403 })
    }

    if (decision === 'requeue') {
      const { rows: [userInfo] } = await client.query(
        `SELECT u.role_id,
                COALESCE(ls.score_count, 1) AS experience_level
         FROM users u
         LEFT JOIN (
           SELECT user_id, LEAST(3, FLOOR(COUNT(*) / 3)::int + 1) AS score_count
           FROM leaderboard_scores WHERE user_id = $1 GROUP BY user_id
         ) ls ON ls.user_id = u.id
         WHERE u.id = $1`,
        [user.sub]
      )
      await client.query(
        `INSERT INTO matchmaking_queue (user_id, project_id, mode, role_id, experience_level, queued_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           project_id = EXCLUDED.project_id, mode = EXCLUDED.mode,
           role_id = EXCLUDED.role_id, experience_level = EXCLUDED.experience_level, queued_at = NOW()`,
        [user.sub, team.project_id, team.mode, userInfo?.role_id ?? null, userInfo?.experience_level ?? 1]
      )
    }

    await client.query(`UPDATE teams SET status = 'dissolved' WHERE id = $1`, [teamId])
    await client.query('COMMIT')

    return NextResponse.json({ status: 'dissolved', requeued: decision === 'requeue' })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
