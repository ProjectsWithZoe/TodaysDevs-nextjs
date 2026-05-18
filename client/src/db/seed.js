import { getPool } from '../lib/server/db.js'

const pool = getPool()

for (const name of ['frontend', 'backend', 'fullstack']) {
  await pool.query(
    'INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
    [name]
  )
  console.log(`Seeded role: ${name}`)
}

await pool.end()
console.log('Seeding complete.')
