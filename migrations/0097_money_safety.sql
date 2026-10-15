-- Money safety: one live Dodo checkout per fix request, expected price, partial
-- refunds, dispute recovery, extra payments, and one monitoring checkout per owner.

-- Short lease taken with a conditional UPDATE before calling Dodo, so
-- concurrent clicks cannot each create a checkout session.
ALTER TABLE fix_requests ADD COLUMN checkout_lock_until TEXT;
-- Price Dodo previewed when checkout was created (minor units + ISO currency).
ALTER TABLE fix_requests ADD COLUMN expected_amount INTEGER;
ALTER TABLE fix_requests ADD COLUMN expected_currency TEXT;
ALTER TABLE fix_requests ADD COLUMN refund_reason TEXT;
-- Status before a dispute opened, restored when the dispute is won or withdrawn.
ALTER TABLE fix_requests ADD COLUMN pre_dispute_status TEXT;

-- Every Dodo payment recorded against a fix request. role = 'primary' for the
-- payment that bought the request, 'duplicate' for extra payments that need a refund.
CREATE TABLE IF NOT EXISTS fix_request_payments (
  payment_id TEXT PRIMARY KEY,
  fix_request_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  checkout_session_id TEXT,
  amount INTEGER,
  currency TEXT,
  refund_id TEXT,
  refund_amount INTEGER,
  refund_currency TEXT,
  refunded_at TEXT,
  dispute_event TEXT,
  webhook_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fix_request_payments_request
  ON fix_request_payments (fix_request_id, created_at);

-- The open Proof Monitoring checkout per owner, reused instead of minting a
-- new Dodo subscription session on every click.
CREATE TABLE IF NOT EXISTS monitoring_checkout_sessions (
  owner_email TEXT PRIMARY KEY,
  target_host TEXT,
  checkout_session_id TEXT,
  checkout_url TEXT,
  checkout_created_at TEXT,
  lock_until TEXT,
  updated_at TEXT NOT NULL
);
