import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import type { PoolClient, QueryResultRow } from 'pg'

const { Pool, types } = pg

// pg returns int8/bigint as strings by default. Every id/count in this schema fits
// safely in a JS number, so parse them as numbers to match our TS types (which all
// declare `number`) and avoid string-vs-number comparison bugs (e.g. cat_id === selectedCatId).
types.setTypeParser(20, (value) => (value === null ? null : Number(value)))

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://myocatmongo:myocatmongo@localhost:5432/myocatmongo',
})

export const query = async <T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) => {
  const result = await pool.query<T>(text, params)
  return result
}

/** Run fn inside a transaction, committing on success and rolling back on error. */
export const withTransaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export const migrate = async () => {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const schema = await readFile(resolve(currentDir, 'schema.sql'), 'utf8')
  await pool.query(schema)
}
