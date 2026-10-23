#!/usr/bin/env bash
# Weekly D1 backup: export production database and store it in R2.
# Usage: ./ops/backup-d1.sh
set -euo pipefail

cd "$(dirname "$0")/.."

STAMP="$(date -u +%Y-%m-%d)"
FILE="/tmp/seofixkit-backup-${STAMP}.sql"

npx wrangler d1 export seofixkit_waitlist --remote --output "$FILE"
npx --no-install cf r2 objects put "d1/seofixkit-backup-${STAMP}.sql" --bucket-name seofixkit-backups --file "$FILE"
SIZE="$(wc -c <"$FILE" | tr -d ' ')"
rm -f "$FILE"

echo "Backup complete: d1/seofixkit-backup-${STAMP}.sql (${SIZE} bytes) in r2://seofixkit-backups"
