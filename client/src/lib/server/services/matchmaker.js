const FRONTEND_ROLES  = ['frontend']
const BACKEND_ROLES   = ['backend']
const FULLSTACK_ROLES = ['fullstack']

export function isRoleCompatible(roleA, roleB) {
  const a = roleA?.toLowerCase() ?? null
  const b = roleB?.toLowerCase() ?? null
  if (FRONTEND_ROLES.includes(a) && FRONTEND_ROLES.includes(b)) return false
  if (BACKEND_ROLES.includes(a)  && BACKEND_ROLES.includes(b))  return false
  return true
}

export function isExperienceCompatible(levelA, levelB, relaxed = false) {
  if (relaxed) return true
  return Math.abs(levelA - levelB) <= 1
}

export function shouldRelaxConstraints(queuedAt) {
  return Date.now() - new Date(queuedAt).getTime() > 60_000
}

function buildPairSet(pairingHistory, projectId) {
  const set = new Set()
  for (const row of pairingHistory) {
    if (row.project_id === projectId) {
      const key = `${Math.min(row.user_a, row.user_b)}-${Math.max(row.user_a, row.user_b)}`
      set.add(key)
    }
  }
  return set
}

function pairKey(a, b) {
  return `${Math.min(a, b)}-${Math.max(a, b)}`
}

export function findDuoMatch(candidate, otherEntries, pairingHistory) {
  const relaxed = shouldRelaxConstraints(candidate.queued_at)
  const paired  = buildPairSet(pairingHistory, candidate.project_id)

  const pool = otherEntries.filter(e =>
    e.user_id    !== candidate.user_id &&
    e.project_id === candidate.project_id &&
    e.mode       === candidate.mode
  )

  const eligible = pool.filter(e =>
    isRoleCompatible(candidate.role, e.role) &&
    isExperienceCompatible(candidate.experience_level, e.experience_level, relaxed) &&
    !paired.has(pairKey(candidate.user_id, e.user_id))
  )

  if (eligible.length === 0) {
    if (relaxed) {
      const fallback = pool.filter(e =>
        isRoleCompatible(candidate.role, e.role) &&
        isExperienceCompatible(candidate.experience_level, e.experience_level, true)
      )
      if (fallback.length === 0) return null
      return fallback.reduce((oldest, e) =>
        new Date(e.queued_at) < new Date(oldest.queued_at) ? e : oldest
      )
    }
    return null
  }

  return eligible.reduce((oldest, e) =>
    new Date(e.queued_at) < new Date(oldest.queued_at) ? e : oldest
  )
}

export function findRoleReplacement(leavingRole, queueEntries, projectId) {
  const leaving = leavingRole?.toLowerCase() ?? null

  let acceptedRoles
  if (FRONTEND_ROLES.includes(leaving)) {
    acceptedRoles = [...FRONTEND_ROLES, ...FULLSTACK_ROLES]
  } else if (BACKEND_ROLES.includes(leaving)) {
    acceptedRoles = [...BACKEND_ROLES, ...FULLSTACK_ROLES]
  } else {
    acceptedRoles = [...FRONTEND_ROLES, ...BACKEND_ROLES, ...FULLSTACK_ROLES]
  }

  const compatible = queueEntries.filter(e =>
    e.project_id === projectId &&
    acceptedRoles.includes(e.role?.toLowerCase() ?? '')
  )

  if (compatible.length === 0) return null

  return compatible.reduce((oldest, e) =>
    new Date(e.queued_at) < new Date(oldest.queued_at) ? e : oldest
  )
}

export function assembleTeam(entries) {
  if (entries.length < 3) return null

  const hasFrontendish = entries.some(e =>
    FRONTEND_ROLES.includes(e.role?.toLowerCase()) ||
    FULLSTACK_ROLES.includes(e.role?.toLowerCase())
  )
  const hasBackendish = entries.some(e =>
    BACKEND_ROLES.includes(e.role?.toLowerCase()) ||
    FULLSTACK_ROLES.includes(e.role?.toLowerCase())
  )

  if (!hasFrontendish || !hasBackendish) return null

  const sorted = [...entries].sort(
    (a, b) => new Date(a.queued_at) - new Date(b.queued_at)
  )
  return sorted.slice(0, 6).map(e => e.user_id)
}
