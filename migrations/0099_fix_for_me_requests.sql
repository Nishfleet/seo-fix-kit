-- "Have it fixed for you" requests (seo-fix-kit#412). Delivery is the
-- Cloudflare Queue `tinystudio-requests`; this table only dedupes a repeat
-- click on the same report and email, and is deleted with the account. Site
-- and email live here only, never in a URL path or a log line.
CREATE TABLE IF NOT EXISTS fix_for_me_requests (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  email TEXT NOT NULL,
  report_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fix_for_me_dedupe
  ON fix_for_me_requests (email, report_id);
