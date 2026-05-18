import { NextResponse }                  from 'next/server'
import { authenticate }                  from '@/lib/server/middleware/authenticate.js'
import { getPool }                       from '@/lib/server/db.js'
import { listGithubProjectsFromRepo }    from '@/lib/server/github.js'

export async function GET(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let projects
  try {
    projects = await listGithubProjectsFromRepo('python-projects')
  } catch {
    return NextResponse.json({ error: 'Bad Gateway', message: 'Could not reach GitHub' }, { status: 502 })
  }

  const slugs = projects.map(p => p.slug)
  let activeCounts = {}

  if (slugs.length > 0) {
    const { rows } = await getPool().query(
      `SELECT t.project_id::text, COUNT(DISTINCT tm.user_id)::int AS active_count
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       WHERE t.status = 'active' AND t.project_id::text = ANY($1)
       GROUP BY t.project_id`,
      [slugs]
    )
    activeCounts = Object.fromEntries(rows.map(r => [r.project_id, r.active_count]))
  }

  const data = projects.map(p => ({
    id:           p.slug,
    title:        p.title,
    description:  p.description,
    html_url:     p.html_url,
    repo:         'python-projects',
    active_count: activeCounts[p.slug] ?? 0,
  }))

  return NextResponse.json({ data, total: data.length })
}
