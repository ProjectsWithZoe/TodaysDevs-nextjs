import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { isMember }     from '@/lib/server/middleware/requireMember.js'
import { getPool }      from '@/lib/server/db.js'
import { updateScore }  from '@/lib/server/services/scoring.js'
import { posthog }      from '@/lib/server/posthog.js'

// GET /api/submissions/:teamId — fetch submission for a team
export async function GET(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: teamId } = await params

  if (!await isMember(teamId, user.sub)) {
    return NextResponse.json({ error: 'Forbidden', message: 'Not a member of this team' }, { status: 403 })
  }

  const { rows: [submission] } = await getPool().query(
    `SELECT s.*,
            u_sub.email AS submitted_by_name,
            u_rev.email AS reviewed_by_name
     FROM submissions s
     JOIN users u_sub ON u_sub.id = s.submitted_by
     LEFT JOIN users u_rev ON u_rev.id = s.reviewed_by
     WHERE s.team_id = $1`,
    [teamId]
  )

  if (!submission) return NextResponse.json({ error: 'Not Found', message: 'No submission for this team' }, { status: 404 })
  return NextResponse.json(submission)
}

// PATCH /api/submissions/:id — review a submission
const TERMINAL = new Set(['accepted', 'rejected'])

export async function PATCH(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status: newStatus, feedback } = await request.json()

  const pool = getPool()

  const { rows: [submission] } = await pool.query(
    'SELECT id, status, team_id FROM submissions WHERE id = $1',
    [id]
  )
  if (!submission) return NextResponse.json({ error: 'Not Found', message: 'Submission not found' }, { status: 404 })

  if (TERMINAL.has(submission.status)) {
    return NextResponse.json(
      { error: 'Bad Request', message: `Cannot transition from '${submission.status}' — this submission is finalised` },
      { status: 400 }
    )
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE submissions
     SET status = $1, reviewed_at = NOW(), reviewed_by = $2, notes = COALESCE($3, notes)
     WHERE id = $4 RETURNING *`,
    [newStatus, user.sub, feedback ?? null, id]
  )

  if (newStatus === 'accepted') {
    const { rows: members } = await pool.query(
      'SELECT user_id FROM team_members WHERE team_id = $1',
      [submission.team_id]
    )
    Promise.all(members.map(m => updateScore(m.user_id, pool).catch(() => {}))).catch(() => {})
  }

  posthog.capture({
    distinctId: user.sub,
    event: 'submission_reviewed',
    properties: { submission_id: id, team_id: submission.team_id, status: newStatus },
  })

  return NextResponse.json(updated)
}
