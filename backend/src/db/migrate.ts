import { migrate, pool } from './database.js'

await migrate()
await pool.end()
console.log('PostgreSQL schema migrated.')
