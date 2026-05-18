export function calculateBaseScore(difficultyWeight, mode, memberCount) {
  const base = difficultyWeight * 100
  if (mode === 'solo') return base
  if (mode === 'duo')  return Math.floor(base / 2)
  return Math.floor(base / memberCount)
}

export function calculateBonus(tasksCompleted, messagesSent) {
  const taskBonus = Math.min(tasksCompleted * 10, 50)
  const chatBonus = Math.min(Math.floor(messagesSent / 10) * 5, 25)
  return Math.min(taskBonus + chatBonus, 75)
}

export function calculateStreakMultiplier(streakDays) {
  if (streakDays <= 0)  return 1.0
  if (streakDays <= 7)  return 1.0  + (streakDays / 7)        * 0.25
  if (streakDays <= 30) return 1.25 + ((streakDays - 7) / 23) * 0.25
  return 1.5
}

export function applyStreakMultiplier(rawScore, streakDays) {
  return Math.floor(rawScore * calculateStreakMultiplier(streakDays))
}

export async function computeUserScore(userId, pool) {
  const { rows: submissions } = await pool.query(
    `SELECT s.id AS submission_id, s.team_id, t.mode, t.project_id,
            1 AS difficulty_weight
     FROM submissions s
     JOIN teams t         ON t.id = s.team_id
     JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1
     WHERE s.status = 'accepted'`,
    [userId]
  )

  let soloScore = 0, duoScore = 0, teamScore = 0

  for (const sub of submissions) {
    const { rows: [mc] } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM team_members WHERE team_id = $1',
      [sub.team_id]
    )
    const memberCount = mc.count
    const base = calculateBaseScore(sub.difficulty_weight, sub.mode, memberCount)

    let tasksCompleted = 0
    try {
      const { rows: [tc] } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM tasks
         WHERE team_id = $1 AND assigned_to = $2 AND status = 'done'`,
        [sub.team_id, userId]
      )
      tasksCompleted = tc.count ?? 0
    } catch { /* tasks table not yet created */ }

    let messagesSent = 0
    try {
      const { rows: [ms] } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM messages
         WHERE team_id = $1 AND user_id = $2`,
        [sub.team_id, userId]
      )
      messagesSent = ms.count ?? 0
    } catch { /* messages table not yet created */ }

    const bonus     = calculateBonus(tasksCompleted, messagesSent)
    const rawPoints = base + bonus

    if      (sub.mode === 'solo') soloScore += rawPoints
    else if (sub.mode === 'duo')  duoScore  += rawPoints
    else                          teamScore += rawPoints
  }

  return {
    totalScore:        soloScore + duoScore + teamScore,
    soloScore,
    duoScore,
    teamScore,
    projectsCompleted: submissions.length,
  }
}

export async function updateScore(userId, pool) {
  const { totalScore, soloScore, duoScore, teamScore, projectsCompleted } =
    await computeUserScore(userId, pool)

  const { rows: [existing] } = await pool.query(
    'SELECT streak_days FROM leaderboard_scores WHERE user_id = $1',
    [userId]
  )
  const streakDays = existing?.streak_days ?? 0
  const finalScore = applyStreakMultiplier(totalScore, streakDays)
  const finalSolo  = applyStreakMultiplier(soloScore,  streakDays)
  const finalDuo   = applyStreakMultiplier(duoScore,   streakDays)
  const finalTeam  = applyStreakMultiplier(teamScore,  streakDays)

  await pool.query(
    `INSERT INTO leaderboard_scores
       (user_id, score, solo_score, duo_score, team_score, projects_completed)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       score              = EXCLUDED.score,
       solo_score         = EXCLUDED.solo_score,
       duo_score          = EXCLUDED.duo_score,
       team_score         = EXCLUDED.team_score,
       projects_completed = EXCLUDED.projects_completed,
       updated_at         = NOW()`,
    [userId, finalScore, finalSolo, finalDuo, finalTeam, projectsCompleted]
  )
}
