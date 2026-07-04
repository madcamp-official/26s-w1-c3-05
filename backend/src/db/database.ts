import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { QueryResultRow } from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://myocatmongo:myocatmongo@localhost:5432/myocatmongo',
})

export const query = async <T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) => {
  const result = await pool.query<T>(text, params)
  return result
}

export const migrate = async () => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const schema = await readFile(resolve(currentDir, 'schema.sql'), 'utf8')
  await pool.query(schema)
}
