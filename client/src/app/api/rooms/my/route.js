import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'

export async function GET(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows } = await getPool().query(
    `SELECT
       t.id, t.project_id, t.project_title, t.mode, t.status, t.created_at,
       COUNT(all_members.user_id)::int AS member_count
     FROM teams t
     JOIN team_members my_seat
       ON my_seat.team_id = t.id AND my_seat.user_id = $1
     LEFT JOIN team_members all_members
       ON all_members.team_id = t.id
     GROUP BY t.id
     ORDER BY t.created_at DESC`,
    [user.sub]
  )

  return NextResponse.json(rows)
}
