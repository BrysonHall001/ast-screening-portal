import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

// Plain Postgres via node-postgres. Works with ANY Postgres: Render's
// managed Postgres, a local install, Supabase, whatever — just set
// DATABASE_URL. No vendor-specific driver.
//
// On first use, the app runs lib/schema.sql automatically (every statement
// is CREATE ... IF NOT EXISTS, so this is safe to run every boot). That
// means: create the database, point DATABASE_URL at it, done. No SQL
// editors involved.

let _pool: Pool | null = null
let _ready: Promise<void> | null = null

function pool(): Pool {
  if (_pool) return _pool
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it in your environment (Render env vars or .env.local).'
    )
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(url)
  _pool = new Pool({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 5,
  })
  return _pool
}

async function ensureSchema(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql')
      const schema = fs.readFileSync(schemaPath, 'utf8')
      await pool().query(schema)
    })().catch((err) => {
      _ready = null // allow retry on next request
      throw err
    })
  }
  return _ready
}

// Tagged-template helper so the whole codebase keeps its
// sql`SELECT ... ${value}` ergonomics. Values become $1, $2, ... params
// (properly escaped by pg — never string-concatenated).
export async function sql(
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<any[]> {
  await ensureSchema()
  let text = strings[0]
  for (let i = 0; i < values.length; i++) {
    text += `$${i + 1}` + strings[i + 1]
  }
  const result = await pool().query(text, values)
  return result.rows
}
