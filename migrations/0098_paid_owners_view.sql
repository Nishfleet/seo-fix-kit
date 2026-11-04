-- One home for "this owner has paid for a Fix Pack". Every paid perk
-- (branded reports, report domains, audit widget, downtime alerts) reads
-- this view, so test orders, refunds and disputes are handled the same way
-- everywhere.
-- https://developers.cloudflare.com/d1/sql-api/sql-statements/
CREATE VIEW IF NOT EXISTS paid_owners AS
SELECT owner_email
FROM fix_requests
WHERE is_test = 0
  AND status IN ('paid', 'in_progress', 'delivered')
  AND refunded_at IS NULL
  AND (dispute_event IS NULL OR dispute_event LIKE '%won%')
GROUP BY owner_email;
