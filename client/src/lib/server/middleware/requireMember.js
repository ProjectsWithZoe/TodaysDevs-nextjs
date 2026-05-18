import { getPool } from '../db.js'

/** Returns true if user is a member of the given team. */
export async function isMember(teamId, userId) {
  const { rows } = await getPool().query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  )
  return rows.length > 0
}
