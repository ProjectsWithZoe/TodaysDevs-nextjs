'use client'

import { useState, useEffect }        from 'react'
import Link                            from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import api                             from '@/api/client.js'
import { useTitleEffect }              from '@/hooks/useTitleEffect.js'

export default function ProjectDetail() {
  const { id }       = useParams()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const repo         = searchParams.get('repo')

  const [project,     setProject]     = useState(null)
  const [activeRoom,  setActiveRoom]  = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [starting,    setStarting]    = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error,       setError]       = useState(null)
  useTitleEffect(project?.title ?? 'Project')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get(`/projects/${id}`, { params: repo ? { repo } : {} }),
      api.get('/rooms/my')
    ])
      .then(([projectRes, roomsRes]) => {
        setProject(projectRes.data)
        const match = roomsRes.data.find(r => r.project_id === id && r.status !== 'completed')
        setActiveRoom(match ?? null)
      })
      .catch(err => {
        setError(err.response?.status === 404
          ? 'Project not found.'
          : (err.response?.data?.message ?? 'Failed to load project'))
      })
      .finally(() => setLoading(false))
  }, [id, repo])

  async function startProject() {
    setStarting(true)
    setError(null)
    try {
      const { data: room } = await api.post('/rooms', { project_id: id, ...(repo && { repo }) })
      router.replace(`/rooms/${room.id}/workspace`)
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.room_id) {
        router.replace(`/rooms/${err.response.data.room_id}/workspace`)
        return
      }
      setError(err.response?.data?.message ?? 'Failed to start project')
      setStarting(false)
    }
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const response = await api.get(`/projects/${id}/download`, { responseType: 'blob', params: repo ? { repo } : {} })
      const url = URL.createObjectURL(response.data)
      const a   = document.createElement('a')
      a.href = url; a.download = `${id}.zip`; a.click()
      URL.revokeObjectURL(url)
    } catch { } finally { setDownloading(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading project…</div>

  if (error && !project) return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-sm text-slate-500">{error}</p>
      <Link href="/projects" className="btn-secondary btn-sm">← Back to projects</Link>
    </div>
  )

  return (
    <div className="space-y-6">
      <nav className="detail-nav">
        <Link href="/projects">Projects</Link>
        <span>/</span>
        <span>{project.title}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">{project.title}</h1>
        {project.description && <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-2xl">{project.description}</p>}
      </div>

      {error && <p className="field-error text-sm" role="alert">{error}</p>}

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-56 shrink-0">
          <div className="card p-5 sticky top-6 space-y-3">
            {activeRoom ? (
              <>
                <button className="btn-primary w-full justify-center" onClick={() => router.push(`/rooms/${activeRoom.id}/workspace`)}>Continue project</button>
                <p className="text-xs text-slate-500 text-center">You already have an active session</p>
              </>
            ) : (
              <button className="btn-primary w-full justify-center" onClick={startProject} disabled={starting}>
                {starting ? 'Starting…' : 'Start project'}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
