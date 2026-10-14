-- Embeddable audit widget. An owner gets one widget to put on their own site;
-- each visitor check through it is saved as a lead for that owner.
CREATE TABLE IF NOT EXISTS audit_widgets (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS widget_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  widget_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  email TEXT NOT NULL,
  url TEXT NOT NULL,
  score INTEGER,
  problems INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_widget_leads_owner_created ON widget_leads(owner_email, created_at);
