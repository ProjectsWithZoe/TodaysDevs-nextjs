import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/server/middleware/authenticate.js'
import { getPool }      from '@/lib/server/db.js'
import { fetchRoom }    from '@/lib/server/fetchRoom.js'
import { CAPACITY }     from '@/lib/server/constants.js'
import { posthog }      from '@/lib/server/posthog.js'

export async function POST(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const pool = getPool()

  const team = await fetchRoom(id, pool)
  if (!team) return NextResponse.json({ error: 'Not Found', message: 'Room not found' }, { status: 404 })

  if (team.status !== 'lobby') {
    return NextResponse.json({ error: 'Bad Request', message: `Room is already ${team.status}` }, { status: 400 })
  }

  const capacity = CAPACITY[team.mode]
  if (team.members.length >= capacity) {
    return NextResponse.json({ error: 'Bad Request', message: `Room is full (${capacity}/${capacity})` }, { status: 400 })
  }

  if (team.members.some(m => m.user_id === user.sub)) {
    return NextResponse.json({ error: 'Bad Request', message: 'You are already a member of this room' }, { status: 400 })
  }

  await pool.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)', [id, user.sub])

  posthog.capture({
    distinctId: user.sub,
    event: 'room_joined',
    properties: { room_id: id, project_id: team.project_id, mode: team.mode, method: 'direct' },
  })

  return NextResponse.json(await fetchRoom(id, pool))
}
