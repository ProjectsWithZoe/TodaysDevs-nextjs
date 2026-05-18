import { NextResponse }                       from 'next/server'
import { authenticate }                       from '@/lib/server/middleware/authenticate.js'
import { getPool }                            from '@/lib/server/db.js'
import { getGithubProject }                   from '@/lib/server/github.js'
import { generateJoinCode }                   from '@/lib/server/joinCode.js'
import { getExperienceLevel }                 from '@/lib/server/services/experienceLevel.js'
import { findDuoMatch, assembleTeam }         from '@/lib/server/services/matchmaker.js'
import { posthog }                            from '@/lib/server/posthog.js'

export async function POST(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { project_id, mode } = await request.json()
  if (!['duo', 'team'].includes(mode)) {
    return NextResponse.json({ error: 'Bad Request', message: 'mode must be duo or team' }, { status: 400 })
  }

  const pool = getPool()

  let project
  try {
    project = await getGithubProject(project_id)
  } catch {
    return NextResponse.json({ error: 'Bad Gateway', message: 'Could not reach GitHub' }, { status: 502 })
  }
  if (!project) return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })

  const experienceLevel = await getExperienceLevel(pool, user.sub)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO matchmaking_queue (user_id, project_id, mode, role_id, experience_level)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         project_id = EXCLUDED.project_id, mode = EXCLUDED.mode,
         role_id = EXCLUDED.role_id, experience_level = EXCLUDED.experience_level, queued_at = NOW()`,
      [user.sub, project_id, mode, user.roleId, experienceLevel]
    )

    const { rows: queueEntries } = await client.query(
      `SELECT mq.id, mq.user_id, mq.project_id, mq.mode, mq.role_id, mq.experience_level, mq.queued_at, r.name AS role
       FROM matchmaking_queue mq
       LEFT JOIN roles r ON r.id = mq.role_id
       WHERE mq.project_id = $1 AND mq.mode = $2
       ORDER BY mq.queued_at ASC FOR UPDATE OF mq`,
      [project_id, mode]
    )

    let matchedUserIds = null
    if (mode === 'duo') {
      const candidate = queueEntries.find(e => e.user_id === user.sub)
      const others    = queueEntries.filter(e => e.user_id !== user.sub)
      const partner   = findDuoMatch(candidate, others, [])
      if (partner) matchedUserIds = [user.sub, partner.user_id]
    } else {
      const matched = assembleTeam(queueEntries)
      if (matched) matchedUserIds = matched
    }

    if (matchedUserIds) {
      const joinCode = generateJoinCode()
      const { rows: [room] } = await client.query(
        `INSERT INTO teams (project_id, project_title, created_by, mode, status, join_code)
         VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
        [project_id, project.title, user.sub, mode, joinCode]
      )
      for (const uid of matchedUserIds) {
        await client.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [room.id, uid])
      }
      await client.query('DELETE FROM matchmaking_queue WHERE user_id = ANY($1)', [matchedUserIds])
      await client.query('COMMIT')
      for (const uid of matchedUserIds) {
        posthog.capture({ distinctId: uid, event: 'matchmaking_matched', properties: { room_id: room.id, project_id, project_title: project.title, mode, match_size: matchedUserIds.length } })
      }
      return NextResponse.json({ status: 'matched', room_id: room.id }, { status: 201 })
    }

    await client.query('COMMIT')
    posthog.capture({ distinctId: user.sub, event: 'matchmaking_queue_joined', properties: { project_id, project_title: project.title, mode, experience_level: experienceLevel } })
    return NextResponse.json({ status: 'queued' }, { status: 202 })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function DELETE(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rowCount } = await getPool().query(
    'DELETE FROM matchmaking_queue WHERE user_id = $1',
    [user.sub]
  )
  if (rowCount === 0) return NextResponse.json({ error: 'Not Found', message: 'Not in queue' }, { status: 404 })

  posthog.capture({ distinctId: user.sub, event: 'matchmaking_queue_left', properties: {} })
  return new Response(null, { status: 204 })
}
