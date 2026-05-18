const ROOM_QUERY = `
  SELECT
    t.id, t.project_id, t.created_by, t.mode, t.status, t.created_at,
    json_build_object('title', t.project_title) AS project,
    COALESCE(
      json_agg(
        json_build_object(
          'user_id',      tm.user_id,
          'display_name', u.email,
          'role',         r.name,
          'joined_at',    tm.joined_at
        ) ORDER BY tm.joined_at
      ) FILTER (WHERE tm.user_id IS NOT NULL),
      '[]'::json
    ) AS members
  FROM teams t
  LEFT JOIN team_members tm ON tm.team_id = t.id
  LEFT JOIN users u         ON u.id = tm.user_id
  LEFT JOIN roles r         ON r.id = u.role_id
  WHERE t.id = $1
  GROUP BY t.id
`

import { getPool } from './db.js'

export async function fetchRoom(teamId, pool = getPool()) {
  const { rows } = await pool.query(ROOM_QUERY, [teamId])
  return rows[0] ?? null
}
