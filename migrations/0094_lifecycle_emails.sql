-- One-off lifecycle emails (for now: the nudge to run a first audit). A row
-- is claimed before the email is sent, so overlapping cron runs never send
-- the same email twice, and an owner gets each kind at most once.
CREATE TABLE IF NOT EXISTS lifecycle_emails (
  owner_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (owner_email, kind)
);
