#!/usr/bin/env bash
# Deploy the local working tree to the self-hosted host after taking a
# database backup and tagging the currently running image for rollback.
# Usage: scripts/deploy.sh [ssh-alias]
set -euo pipefail

REMOTE="${1:-${DEPLOY_HOST:?Set DEPLOY_HOST or pass an ssh alias}}"
REMOTE_DIR="${DEPLOY_DIR:?Set DEPLOY_DIR to the remote project path}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

cd "$LOCAL_DIR"

echo "==> local gate: typecheck, lint, tests, build"
./scripts/check.sh

# Syncing source files does not affect the running container, so it is safe
# (and necessary — the host needs scripts/backup-db.sh) to sync first.
echo "==> sync sources (keeps remote .env.local, backups and logs)"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env.local --exclude backups --exclude data \
  --exclude 'scout.log*' --exclude tsconfig.tsbuildinfo \
  "$LOCAL_DIR/" "$REMOTE:$REMOTE_DIR/"

echo "==> backup current database"
ssh "$REMOTE" "cd '$REMOTE_DIR' && bash ./scripts/backup-db.sh '$REMOTE_DIR/backups'"

echo "==> tag current image for rollback"
ssh "$REMOTE" "cd '$REMOTE_DIR' && docker tag tech-competition-hub-web:latest 'tech-competition-hub-web:rollback-$STAMP' 2>/dev/null || true"

echo "==> apply idempotent schema migrations"
ssh "$REMOTE" "cd '$REMOTE_DIR' && set -a && . ./.env.local && set +a && docker compose --env-file .env.local exec -T db psql -U \"\${POSTGRES_USER}\" -d \"\${POSTGRES_DB}\" -v ON_ERROR_STOP=1 -q < db/migrations.sql"

echo "==> rebuild and restart web"
ssh "$REMOTE" "cd '$REMOTE_DIR' && docker compose --env-file .env.local up -d --build web"

echo "==> wait for health"
for attempt in $(seq 1 30); do
  if ssh "$REMOTE" "curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3000/api/health"; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "health check failed after 30 attempts" >&2
    ssh "$REMOTE" "cd '$REMOTE_DIR' && docker compose --env-file .env.local logs --tail=60 web" >&2 || true
    exit 1
  fi
  sleep 2
done

echo "==> verify routes"
ssh "$REMOTE" "for path in / /login /api/health '/api/competitions?status=all'; do printf '%s ' \"\$path\"; curl -sS -o /dev/null -w 'HTTP %{http_code}\\n' --max-time 15 \"http://127.0.0.1:3000\$path\"; done"

echo "deployed stamp=$STAMP"
echo "rollback image: tech-competition-hub-web:rollback-$STAMP"
