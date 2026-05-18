export async function touchStreak(userId, pool) {
  const today     = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

  const { rows: [row] } = await pool.query(
    'SELECT last_active, streak_days FROM leaderboard_scores WHERE user_id = $1',
    [userId]
  )

  if (!row) {
    await pool.query(
      `INSERT INTO leaderboard_scores (user_id, streak_days, last_active)
       VALUES ($1, 1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, today]
    )
    return
  }

  const lastActive = row.last_active instanceof Date
    ? row.last_active.toISOString().split('T')[0]
    : String(row.last_active).slice(0, 10)

  if (lastActive === today) return

  const newStreak = lastActive === yesterday ? row.streak_days + 1 : 1

  await pool.query(
    `UPDATE leaderboard_scores
     SET streak_days = $1, last_active = $2, updated_at = NOW()
     WHERE user_id = $3`,
    [newStreak, today, userId]
  )
}
