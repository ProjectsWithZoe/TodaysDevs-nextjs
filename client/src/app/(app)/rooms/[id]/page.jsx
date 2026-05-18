'use client'

import { useState, useEffect, useRef }  from 'react'
import Link                              from 'next/link'
import { useParams, useRouter }          from 'next/navigation'
import api                               from '@/api/client.js'
import { useAuth }                       from '@/context/AuthContext.jsx'
import { useTitleEffect }                from '@/hooks/useTitleEffect.js'
import { MemberList }                    from '@/components/MemberList.jsx'
import { MIN_TO_START }                  from '@/lib/constants.js'

const POLL_INTERVAL = 3000

export default function RoomLobby() {
  const { id }   = useParams()
  const router   = useRouter()
  const { user } = useAuth()

  const [room,     setRoom]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [starting, setStarting] = useState(false)
  const [error,    setError]    = useState(null)
  useTitleEffect(room ? `Lobby — ${room.project?.title}` : 'Lobby')

  useEffect(() => {
    api.get(`/rooms/${id}`)
      .then(({ data }) => setRoom(data))
      .catch(err => setError(err.response?.data?.message ?? 'Failed to load room'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (room?.status === 'active') router.replace(`/rooms/${id}/workspace`)
  }, [room?.status, id, router])

  const roomStatusRef = useRef(room?.status)
  useEffect(() => { roomStatusRef.current = room?.status }, [room?.status])

  useEffect(() => {
    if (room?.status !== 'lobby') return
    const timer = setInterval(() => {
      api.get(`/rooms/${id}`)
        .then(({ data }) => {
          setRoom(data)
          if (data.status === 'active') router.replace(`/rooms/${id}/workspace`)
        })
        .catch(() => {})
    }, POLL_INTERVAL)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status === 'lobby', id, router])

  async function handleStart() {
    setStarting(true)
    setError(null)
    try {
      const { data } = await api.post(`/rooms/${id}/start`)
      setRoom(data)
      router.replace(`/rooms/${id}/workspace`)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading room…</div>
  if (error && !room) return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-sm text-slate-500">{error}</p>
      <Link href="/projects" className="btn-secondary btn-sm">← Back to projects</Link>
    </div>
  )

  const isCreator = room.created_by === user?.id
  const min       = MIN_TO_START[room.mode]
  const canStart  = isCreator && room.members.length >= min
  const capacity  = room.mode === 'team' ? 6 : room.mode === 'duo' ? 2 : 1

  return (
    <div className="space-y-6">
      <nav className="detail-nav">
        <Link href="/projects">Projects</Link><span>/</span>
        <span>{room.project.title}</span><span>/</span>
        <span>Lobby</span>
      </nav>

      <div>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="badge badge-type">{room.mode}</span>
          <span className="badge badge-status-lobby">{room.status}</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-800">{room.project.title}</h2>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-5">
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Players ({room.members.length}/{capacity})</h3>
            <MemberList members={room.members} mode={room.mode} />
          </div>

          {error && <p className="field-error" role="alert">{error}</p>}

          {isCreator ? (
            <button className="btn-primary w-full justify-center py-2.5" onClick={handleStart} disabled={!canStart || starting} title={!canStart ? `Need at least ${min} player${min !== 1 ? 's' : ''} to start` : undefined}>
              {starting ? 'Starting…' : 'Start session'}
            </button>
          ) : (
            <p className="text-sm text-slate-500 text-center py-2">Waiting for the room creator to start the session…</p>
          )}
        </div>

        <aside className="lg:w-56 shrink-0">
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Project</h3>
            <p className="text-sm font-medium text-slate-800">{room.project.title}</p>
            <Link href={`/projects/${room.project_id}`} className="text-xs text-brand-600 hover:text-brand-700 font-medium">View project brief →</Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
