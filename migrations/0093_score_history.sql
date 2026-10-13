-- A small, long-lived score history so the app's progress card can show a
-- site improving over months. Full reports still expire after 30 days; each
-- row here keeps only the page address, score, problem count and date
-- (12 months, cleaned up by the cron in worker/lib/db.js). report_id points
-- at the full report while it still exists.
CREATE TABLE IF NOT EXISTS score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_email TEXT NOT NULL,
  report_id TEXT NOT NULL,
  url TEXT NOT NULL,
  target_host TEXT NOT NULL,
  score INTEGER NOT NULL,
  total_findings INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_score_history_report ON score_history(report_id);

CREATE INDEX IF NOT EXISTS idx_score_history_owner_created ON score_history(owner_email, created_at);

INSERT OR IGNORE INTO score_history (owner_email, report_id, url, target_host, score, total_findings, created_at)
SELECT
  owner_email,
  id,
  url,
  COALESCE(target_host, ''),
  COALESCE(score, 0),
  CASE WHEN json_valid(summary_json) THEN COALESCE(json_extract(summary_json, '$.totalFindings'), 0) ELSE 0 END,
  created_at
FROM audit_reports
WHERE owner_email IS NOT NULL AND owner_email != '';
