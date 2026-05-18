import { NextResponse }        from 'next/server'
import { authenticate }        from '@/lib/server/middleware/authenticate.js'
import { getPool }             from '@/lib/server/db.js'
import { getGithubProject }    from '@/lib/server/github.js'
import { generateJoinCode }    from '@/lib/server/joinCode.js'
import { posthog }             from '@/lib/server/posthog.js'
import { fetchRoom }           from '@/lib/server/fetchRoom.js'

export async function POST(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { project_id, repo } = await request.json()
  const pool = getPool()

  let project
  try {
    project = await getGithubProject(project_id, repo || undefined)
  } catch {
    return NextResponse.json({ error: 'Bad Gateway', message: 'Could not reach GitHub' }, { status: 502 })
  }
  if (!project) return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })

  const { rows: existing } = await pool.query(
    `SELECT id FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = $1 AND t.project_id = $2 AND t.status = 'active'`,
    [user.sub, project_id]
  )
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'Conflict', message: 'You already have an active session for this project', room_id: existing[0].id },
      { status: 409 }
    )
  }

  const join_code = generateJoinCode()
  const { rows: [team] } = await pool.query(
    `INSERT INTO teams (project_id, project_title, created_by, mode, status, join_code)
     VALUES ($1, $2, $3, 'solo', 'active', $4)
     RETURNING id`,
    [project_id, project.title, user.sub, join_code]
  )

  await pool.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [team.id, user.sub])

  posthog.capture({
    distinctId: user.sub,
    event: 'room_created',
    properties: { room_id: team.id, project_id, project_title: project.title, mode: 'solo' },
  })

  return NextResponse.json(await fetchRoom(team.id, pool), { status: 201 })
}
