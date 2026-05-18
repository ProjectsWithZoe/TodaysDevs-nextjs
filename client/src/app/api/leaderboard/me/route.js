import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'

const EMPTY_ROW = { rank: null, score: 0, solo_score: 0, duo_score: 0, team_score: 0, projects_completed: 0, streak_days: 0 }

export async function GET(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pool = getPool()
  const { rows: [row] } = await pool.query(
    `SELECT ls.score, ls.solo_score, ls.duo_score, ls.team_score,
            ls.projects_completed, ls.streak_days, ls.last_active
     FROM leaderboard_scores ls WHERE ls.user_id = $1`,
    [user.sub]
  )

  if (!row) return NextResponse.json(EMPTY_ROW)

  const { rows: [rankRow] } = await pool.query(
    `SELECT (COUNT(*) + 1)::int AS rank FROM leaderboard_scores WHERE score > $1`,
    [row.score]
  )

  return NextResponse.json({ rank: rankRow.rank, ...row })
}
