-- "Have it fixed for you" requests handed from SEO Fix Kit to TinyStudio's
-- desk queue (seo-fix-kit#412). A row stays `pending` until TinyStudio
-- answers 202 with an id; the scheduled queue retries pending rows, so a
-- TinyStudio outage delays a request instead of dropping it. Site and email
-- live here only — never in a URL path or a log line.
CREATE TABLE IF NOT EXISTS fix_for_me_requests (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  email TEXT NOT NULL,
  report_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  tiny_studio_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  last_attempt_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_fix_for_me_dedupe
  ON fix_for_me_requests (email, report_id);

CREATE INDEX IF NOT EXISTS idx_fix_for_me_pending
  ON fix_for_me_requests (status, last_attempt_at);
