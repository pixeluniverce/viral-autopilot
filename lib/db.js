import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export const dbConfigured = Boolean(connectionString);

let _sql;
let _ready;

function sql() {
  if (!connectionString) throw new Error('DATABASE_URL is not set (connect Neon in Vercel Storage)');
  if (!_sql) _sql = neon(connectionString);
  return _sql;
}

// Creates the table on first use, so the app works even if schema.sql was not run.
async function ready() {
  if (!_ready) {
    const q = sql();
    _ready = (async () => {
      await q`CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'queued',
        scheduled_at BIGINT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        data JSONB NOT NULL
      )`;
      await q`CREATE INDEX IF NOT EXISTS jobs_created_idx ON jobs (created_at DESC)`;
      await q`CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, scheduled_at)`;
    })().catch((e) => {
      _ready = undefined;
      throw e;
    });
  }
  return _ready;
}

export function newId() {
  return 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function saveJob(job) {
  await ready();
  job.updatedAt = Date.now();
  await sql()`
    INSERT INTO jobs (id, status, scheduled_at, created_at, updated_at, data)
    VALUES (${job.id}, ${job.status}, ${job.scheduledAt ?? null}, ${job.createdAt}, ${job.updatedAt}, ${JSON.stringify(job)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      scheduled_at = EXCLUDED.scheduled_at,
      updated_at = EXCLUDED.updated_at,
      data = EXCLUDED.data`;
  return job;
}

export async function getJob(id) {
  await ready();
  const rows = await sql()`SELECT data FROM jobs WHERE id = ${id}`;
  return rows[0]?.data ?? null;
}

export async function listJobs(limit = 100) {
  await ready();
  const rows = await sql()`SELECT data FROM jobs ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((r) => r.data);
}

export async function deleteJob(id) {
  await ready();
  await sql()`DELETE FROM jobs WHERE id = ${id}`;
}
