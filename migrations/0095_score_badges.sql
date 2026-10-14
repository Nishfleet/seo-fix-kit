-- Public score badges. An owner turns one on for a site they audit; the badge
-- and its /score page read the latest score_history row for that owner and
-- host, so they update after every check without exposing the full report.
CREATE TABLE IF NOT EXISTS score_badges (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  target_host TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_score_badges_owner_host ON score_badges(owner_email, target_host);
