import { NextResponse }   from 'next/server'
import { authenticate }   from '@/lib/server/middleware/authenticate.js'
import { getPool }        from '@/lib/server/db.js'

export async function GET(request) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows } = await getPool().query(
    `SELECT
       u.id,
       COALESCE(u.display_name, split_part(u.email, '@', 1)) AS display_name,
       r.name        AS role,
       ROUND(u.lat::numeric, 1)  AS lat,
       ROUND(u.lng::numeric, 1)  AS lng,
       u.city,
       u.country,
       u.country_code,
       u.ua_browser,
       u.ua_device,
       u.last_seen_at,
       COALESCE(
         json_agg(
           json_build_object('title', t.project_title, 'mode', t.mode)
           ORDER BY t.created_at DESC
         ) FILTER (WHERE t.id IS NOT NULL AND t.status IN ('active','lobby')),
         '[]'
       ) AS active_projects
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN team_members tm ON tm.user_id = u.id
     LEFT JOIN teams t
       ON t.id = tm.team_id AND t.status IN ('active','lobby')
     WHERE u.last_seen_at >= CURRENT_DATE
     GROUP BY u.id, r.name
     ORDER BY u.last_seen_at DESC`
  )

  return NextResponse.json(rows)
}
