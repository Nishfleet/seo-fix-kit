CREATE TABLE IF NOT EXISTS gsc_connections (
  owner_email TEXT PRIMARY KEY,
  site_url TEXT NOT NULL DEFAULT '',
  refresh_token_enc TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS gsc_auth_states (
  state_hash TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gsc_page_data (
  owner_email TEXT PRIMARY KEY,
  site_url TEXT NOT NULL DEFAULT '',
  page_rows_json TEXT NOT NULL DEFAULT '[]',
  synced_at TEXT NOT NULL
);
