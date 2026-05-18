import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'

const SCORE_COL = {
  solo:   'ls.solo_score',
  duo:    'ls.duo_score',
  team:   'ls.team_score',
  global: 'ls.score',
}

export async function GET(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type   = searchParams.get('type')   ?? 'global'
  const role   = searchParams.get('role')   ?? null
  const limit  = Math.min(Math.max(parseInt(searchParams.get('limit')  ?? '20', 10), 1), 100)
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0)

  const scoreCol = SCORE_COL[type] ?? 'ls.score'
  const params   = []
  const filters  = []

  if (role) {
    params.push(role)
    filters.push(`r.name = $${params.length}`)
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  params.push(limit, offset)
  const limitIdx  = params.length - 1
  const offsetIdx = params.length

  const { rows } = await getPool().query(
    `SELECT
       RANK() OVER (ORDER BY ${scoreCol} DESC)::int AS rank,
       ls.user_id, ls.score, ls.solo_score, ls.duo_score, ls.team_score,
       ls.projects_completed, ls.streak_days,
       u.email AS display_name,
       r.name  AS role,
       COUNT(*) OVER ()::int AS total
     FROM leaderboard_scores ls
     JOIN users u ON u.id = ls.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     ${whereClause}
     ORDER BY ${scoreCol} DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  )

  const total = rows[0]?.total ?? 0
  const data  = rows.map(({ total: _t, ...rest }) => rest)

  return NextResponse.json({ data, total, limit, offset })
}
