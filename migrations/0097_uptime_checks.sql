-- Uptime watch for sites with weekly checks on. Every cron tick pings each
-- active monitor's URL; two failures in a row mark it down and email the owner.
ALTER TABLE audit_schedules ADD COLUMN uptime_status TEXT;
ALTER TABLE audit_schedules ADD COLUMN uptime_checked_at TEXT;
ALTER TABLE audit_schedules ADD COLUMN uptime_fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_schedules ADD COLUMN uptime_first_fail_at TEXT;
ALTER TABLE audit_schedules ADD COLUMN uptime_down_since TEXT;
ALTER TABLE audit_schedules ADD COLUMN uptime_last_error TEXT;
ALTER TABLE audit_schedules ADD COLUMN uptime_alerted TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_schedules_uptime
  ON audit_schedules(status, uptime_checked_at);
