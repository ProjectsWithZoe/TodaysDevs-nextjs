import { NextResponse }  from 'next/server'
import { authenticate }  from '@/lib/server/middleware/authenticate.js'
import { isMember }      from '@/lib/server/middleware/requireMember.js'
import { fetchRoom }     from '@/lib/server/fetchRoom.js'

export async function GET(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  if (!await isMember(id, user.sub)) {
    return NextResponse.json({ error: 'Forbidden', message: 'Not a member of this room' }, { status: 403 })
  }

  const room = await fetchRoom(id)
  if (!room) return NextResponse.json({ error: 'Not Found', message: 'Room not found' }, { status: 404 })

  return NextResponse.json(room)
}
