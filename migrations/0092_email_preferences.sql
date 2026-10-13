-- Per-account email preferences for customer audit emails (report ready and
-- weekly check results). One row per owner, created the first time an audit
-- email is considered. `unsubscribe_token` is the secret in the one-click
-- unsubscribe link at the bottom of each email, so a customer can opt out
-- without signing in.
CREATE TABLE IF NOT EXISTS email_preferences (
  owner_email TEXT PRIMARY KEY,
  audit_emails TEXT NOT NULL DEFAULT 'on',
  unsubscribe_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_preferences_token
  ON email_preferences(unsubscribe_token);
