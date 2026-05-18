import { NextResponse }  from 'next/server'
import { authenticate }  from '@/lib/server/middleware/authenticate.js'
import { isMember }      from '@/lib/server/middleware/requireMember.js'
import { getPool }       from '@/lib/server/db.js'
import { fetchRoom }     from '@/lib/server/fetchRoom.js'
import { MIN_TO_START }  from '@/lib/server/constants.js'
import { posthog }       from '@/lib/server/posthog.js'

export async function POST(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  if (!await isMember(id, user.sub)) {
    return NextResponse.json({ error: 'Forbidden', message: 'Not a member of this room' }, { status: 403 })
  }

  const pool = getPool()
  const team = await fetchRoom(id, pool)
  if (!team) return NextResponse.json({ error: 'Not Found', message: 'Room not found' }, { status: 404 })

  if (team.created_by !== user.sub) {
    return NextResponse.json({ error: 'Forbidden', message: 'Only the room creator can start the session' }, { status: 403 })
  }

  if (team.status !== 'lobby') {
    return NextResponse.json({ error: 'Bad Request', message: `Room is already ${team.status}` }, { status: 400 })
  }

  const min = MIN_TO_START[team.mode]
  if (team.members.length < min) {
    return NextResponse.json(
      { error: 'Bad Request', message: `Need at least ${min} member${min !== 1 ? 's' : ''} to start (have ${team.members.length})` },
      { status: 400 }
    )
  }

  await pool.query("UPDATE teams SET status = 'active' WHERE id = $1", [id])

  posthog.capture({
    distinctId: user.sub,
    event: 'room_started',
    properties: { room_id: id, project_id: team.project_id, mode: team.mode, member_count: team.members.length },
  })

  return NextResponse.json(await fetchRoom(id, pool))
}
