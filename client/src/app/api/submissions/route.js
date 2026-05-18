import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'
import { posthog }      from '@/lib/server/posthog.js'

const ALLOWED_HOSTS = new Set(['github.com', 'gitlab.com', 'bitbucket.org'])

export async function POST(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { team_id, repo_url, notes } = await request.json()

  let parsedUrl
  try { parsedUrl = new URL(repo_url) } catch {
    return NextResponse.json({ error: 'Bad Request', message: 'Invalid repo_url' }, { status: 400 })
  }
  if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
    return NextResponse.json({ error: 'Bad Request', message: `repo_url must be from: ${[...ALLOWED_HOSTS].join(', ')}` }, { status: 400 })
  }

  const pool = getPool()

  const { rows: memberRows } = await pool.query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
    [team_id, user.sub]
  )
  if (memberRows.length === 0) return NextResponse.json({ error: 'Forbidden', message: 'Not a member of this team' }, { status: 403 })

  const { rows: [team] } = await pool.query(
    'SELECT id, project_id, status FROM teams WHERE id = $1',
    [team_id]
  )
  if (!team) return NextResponse.json({ error: 'Not Found', message: 'Team not found' }, { status: 404 })
  if (team.status !== 'active') {
    return NextResponse.json({
      error: 'Bad Request',
      message: team.status === 'completed' ? 'This team has already submitted' : 'Team is not active — cannot submit',
    }, { status: 400 })
  }

  const client = await pool.connect()
  let submission
  try {
    await client.query('BEGIN')
    const { rows: [sub] } = await client.query(
      `INSERT INTO submissions (team_id, project_id, submitted_by, repo_url, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [team_id, team.project_id, user.sub, repo_url, notes ?? null]
    )
    submission = sub
    await client.query("UPDATE teams SET status = 'completed' WHERE id = $1", [team_id])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') return NextResponse.json({ error: 'Conflict', message: 'This team has already submitted' }, { status: 409 })
    throw err
  } finally {
    client.release()
  }

  posthog.capture({
    distinctId: user.sub,
    event: 'project_submitted',
    properties: { submission_id: submission.id, team_id, project_id: team.project_id, repo_host: parsedUrl.hostname },
  })

  return NextResponse.json(submission, { status: 201 })
}
