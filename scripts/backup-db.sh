#!/usr/bin/env bash
# Backup the Competition Hub PostgreSQL volume and record a restore command.
# Usage: scripts/backup-db.sh [output-dir]
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

OUT_DIR="${1:-$PROJECT_DIR/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

# shellcheck source=/dev/null
set -a; . ./.env.local; set +a

FILE="$OUT_DIR/competition-hub-${STAMP}.sql.gz"
docker compose --env-file .env.local exec -T db \
  pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-tech_competition_hub}" \
  --no-owner --no-privileges \
  | gzip -9 > "$FILE"

chmod 600 "$FILE"
# A dump that cannot be listed is not a backup.
gzip -t "$FILE"
SIZE="$(wc -c < "$FILE" | tr -d ' ')"
if [ "$SIZE" -lt 1024 ]; then
  echo "Backup suspiciously small ($SIZE bytes): $FILE" >&2
  exit 1
fi

# Keep the newest N days, never delete the dump just written.
find "$OUT_DIR" -name 'competition-hub-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -print -delete

echo "backup=$FILE bytes=$SIZE"
echo "restore: gunzip -c '$FILE' | docker compose --env-file .env.local exec -T db psql -U \"\${POSTGRES_USER:-postgres}\" -d \"\${POSTGRES_DB:-tech_competition_hub}\""
