CREATE TABLE IF NOT EXISTS chatgpt_visibility_runs (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  host TEXT NOT NULL,
  brand TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (owner_email, host)
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_visibility_runs_owner
  ON chatgpt_visibility_runs (owner_email, created_at);
