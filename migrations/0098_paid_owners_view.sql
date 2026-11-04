-- One home for "this owner has paid for a Fix Pack". Every paid perk
-- (branded reports, report domains, audit widget, downtime alerts) reads
-- this view, so test orders, refunds and disputes are handled the same way
-- everywhere. Same rule as before this view: a non-test order whose status
-- is paid, in_progress or delivered.
-- https://developers.cloudflare.com/d1/sql-api/sql-statements/
CREATE VIEW IF NOT EXISTS paid_owners AS
SELECT owner_email
FROM fix_requests
WHERE is_test = 0
  AND status IN ('paid', 'in_progress', 'delivered')
GROUP BY owner_email;
