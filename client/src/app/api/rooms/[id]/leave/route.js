import { NextResponse }             from 'next/server'
import { authenticate }             from '@/lib/server/middleware/authenticate.js'
import { getPool }                  from '@/lib/server/db.js'
import { fetchRoom }                from '@/lib/server/fetchRoom.js'
import { findRoleReplacement }      from '@/lib/server/services/matchmaker.js'
import { posthog }                  from '@/lib/server/posthog.js'

export async function POST(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params
  const body = await request.json().catch(() => ({}))
  const shouldRequeue = body?.requeue !== false

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    const { rows: [team] } = await client.query(
      `SELECT t.id, t.mode, t.status, t.project_id FROM teams t WHERE t.id = $1 FOR UPDATE`,
      [teamId]
    )
    if (!team) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Not Found', message: 'Room not found' }, { status: 404 })
    }

    const { rows: membership } = await client.query(
      'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, user.sub]
    )
    if (membership.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Forbidden', message: 'Not a member of this room' }, { status: 403 })
    }

    const { rows: [leaverRow] } = await client.query(
      `SELECT r.name AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [user.sub]
    )
    const leavingRole = leaverRow?.role ?? null

    await client.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, user.sub])

    if (team.mode === 'solo') {
      await client.query(`UPDATE teams SET status = 'dissolved' WHERE id = $1`, [teamId])
      await client.query('COMMIT')
      posthog.capture({ distinctId: user.sub, event: 'room_left', properties: { room_id: teamId, project_id: team.project_id, mode: team.mode, result: 'dissolved', requeued: false } })
      return NextResponse.json({ status: 'dissolved', requeued: false })
    }

    if (shouldRequeue) {
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
    } else {
      await client.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [user.sub])
    }

    if (team.mode === 'duo') {
      await client.query(`UPDATE teams SET status = 'partner_left', partner_left_at = NOW() WHERE id = $1`, [teamId])
      await client.query('COMMIT')
      posthog.capture({ distinctId: user.sub, event: 'room_left', properties: { room_id: teamId, project_id: team.project_id, mode: team.mode, result: 'partner_left', requeued: shouldRequeue } })
      return NextResponse.json({ status: 'partner_left', requeued: shouldRequeue })
    }

    // Team leave — attempt role replacement
    const { rows: queueEntries } = await client.query(
      `SELECT mq.id, mq.user_id, mq.project_id, mq.mode, mq.role_id, mq.experience_level, mq.queued_at, r.name AS role
       FROM matchmaking_queue mq
       LEFT JOIN roles r ON r.id = mq.role_id
       WHERE mq.project_id = $1 AND mq.mode = $2
       ORDER BY mq.queued_at ASC FOR UPDATE OF mq`,
      [team.project_id, team.mode]
    )

    const replacement = findRoleReplacement(leavingRole, queueEntries, team.project_id)

    if (replacement) {
      await client.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [teamId, replacement.user_id])
      await client.query('DELETE FROM matchmaking_queue WHERE user_id = $1', [replacement.user_id])
      await client.query('COMMIT')
      posthog.capture({ distinctId: user.sub, event: 'room_left', properties: { room_id: teamId, project_id: team.project_id, mode: team.mode, result: 'replacement_found', requeued: shouldRequeue } })
      return NextResponse.json({ status: 'active', replacement_found: true, requeued: shouldRequeue })
    }

    await client.query(`UPDATE teams SET status = 'seeking_replacement', seeking_role = $1 WHERE id = $2`, [leavingRole, teamId])
    await client.query('COMMIT')
    posthog.capture({ distinctId: user.sub, event: 'room_left', properties: { room_id: teamId, project_id: team.project_id, mode: team.mode, result: 'seeking_replacement', requeued: shouldRequeue } })
    return NextResponse.json({ status: 'seeking_replacement', seeking_role: leavingRole, requeued: shouldRequeue })

  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
