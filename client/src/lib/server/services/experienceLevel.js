export async function getExperienceLevel(pool, userId) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM submissions
       WHERE user_id = $1 AND status = 'accepted'`,
      [userId]
    )
    const count = rows[0]?.count ?? 0
    if (count === 0) return 1
    if (count <= 3)  return 2
    return 3
  } catch {
    return 1
  }
}
