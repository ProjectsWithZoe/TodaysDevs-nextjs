import { NextResponse }        from 'next/server'
import { authenticate }        from '@/lib/server/middleware/authenticate.js'
import { getPool }             from '@/lib/server/db.js'
import { getGithubProject }    from '@/lib/server/github.js'

export async function GET(request, { params }) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  const repo = new URL(request.url).searchParams.get('repo') || undefined

  const project = await getGithubProject(slug, repo)
  if (!project) return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })

  const { rows } = await getPool().query(
    `SELECT COUNT(DISTINCT tm.user_id)::int AS active_count
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     WHERE t.project_id = $1 AND t.status = 'active'`,
    [slug]
  )

  return NextResponse.json({
    id:           project.slug,
    title:        project.title,
    description:  project.description,
    active_count: rows[0]?.active_count ?? 0,
    repo:         project.repo,
  })
}
