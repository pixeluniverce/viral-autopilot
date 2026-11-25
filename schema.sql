-- Viral Autopilot schema for Neon (Postgres)
-- Run once in the Neon SQL Editor. (The app also runs this automatically if the table is missing.)

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  status        TEXT    NOT NULL DEFAULT 'queued',  -- queued | rendering | ready | publishing | published | failed
  scheduled_at  BIGINT,                              -- epoch milliseconds (when to upload)
  created_at    BIGINT  NOT NULL,
  updated_at    BIGINT  NOT NULL,
  data          JSONB   NOT NULL                     -- full job: title, description, hashtags, videoUrl, published{}, error...
);

CREATE INDEX IF NOT EXISTS jobs_created_idx   ON jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_status_idx    ON jobs (status, scheduled_at);
