#!/usr/bin/env bash
# Verify the latest compressed timestamped backup by restoring it into a
# throwaway PostgreSQL database, then comparing row counts and schema shape
# against the live database. Never writes to the live database.
# Usage: scripts/verify-backup.sh [backup-dir]
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

OUT_DIR="${1:-$PROJECT_DIR/backups}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_DB="${POSTGRES_DB:-tech_competition_hub}"

if [ ! -d "$OUT_DIR" ]; then
  echo "Backup directory does not exist: $OUT_DIR" >&2
  exit 1
fi

if [ -f .env.local ]; then
  # shellcheck source=/dev/null
  set -a; . ./.env.local; set +a
  COMPOSE_ENV=(--env-file .env.local)
else
  COMPOSE_ENV=()
fi
PG_USER="${POSTGRES_USER:-$PG_USER}"
PG_DB="${POSTGRES_DB:-$PG_DB}"

BACKUP_FILE="$(find "$OUT_DIR" -maxdepth 1 -type f -name 'competition-hub-*.sql.gz' -print | sort | tail -n 1)"
if [ -z "$BACKUP_FILE" ]; then
  echo "No compressed timestamped backup found in $OUT_DIR" >&2
  exit 1
fi
if ! basename "$BACKUP_FILE" | grep -Eq '^competition-hub-[0-9]{8}T[0-9]{6}Z\.sql\.gz$'; then
  echo "Backup filename is not timestamped: $BACKUP_FILE" >&2
  exit 1
fi

echo "==> static migration/schema parity"
npm run check:schema

echo "==> gzip integrity"
gzip -t "$BACKUP_FILE"

VERIFY_DB="techhub_verify_$(date -u +%Y%m%dT%H%M%SZ)_$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"

compose_psql() {
  docker compose "${COMPOSE_ENV[@]}" exec -T db \
    psql -X -w -v ON_ERROR_STOP=1 -U "$PG_USER" "$@"
}

cleanup() {
  local exit_code=$?
  if [ -n "${VERIFY_DB:-}" ]; then
    compose_psql -d postgres -c "drop database if exists $VERIFY_DB with (force);" >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT

echo "==> restoring into temporary database $VERIFY_DB"
compose_psql -d postgres -c "create database $VERIFY_DB;" >/dev/null
gunzip -c "$BACKUP_FILE" | compose_psql -d "$VERIFY_DB" >/dev/null

TABLES=(
  auth_accounts auth_security profiles competitions interests teams team_members
  competition_bookmarks competition_comments competition_results team_tasks
  team_activity_logs notifications notification_preferences profile_avatars
  user_sessions email_outbox audit_logs rate_limit_buckets scout_sources
  scout_runs scout_run_sources schema_migrations
)

COUNT_SQL=""
for table in "${TABLES[@]}"; do
  if [ -n "$COUNT_SQL" ]; then COUNT_SQL+=$'\nunion all\n'; fi
  COUNT_SQL+="select '${table}' as name, (select count(*) from public.${table})::text as value"
done
COUNT_SQL+=$'\norder by name'

FINGERPRINT_SQL="
select md5(coalesce(string_agg(sig, '|' order by sig), '')) from (
  select 'column:' || table_name || ':' || column_name || ':' || data_type || ':' ||
         coalesce(is_nullable, '') || ':' || coalesce(column_default, '') as sig
  from information_schema.columns where table_schema = 'public'
  union all
  select 'index:' || tablename || ':' || indexname || ':' || indexdef
  from pg_indexes where schemaname = 'public'
  union all
  select 'function:' || p.proname || ':' ||
         pg_get_function_identity_arguments(p.oid) || ':' ||
         pg_get_function_result(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
  union all
  select 'trigger:' || c.relname || ':' || t.tgname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal
) as objects;"

LEDGER_SQL="select coalesce(string_agg(version || ':' || checksum, ',' order by version), '') from public.schema_migrations;"

echo "==> comparing row counts"
LIVE_COUNTS="$(compose_psql -d "$PG_DB" -At -F '|' -c "$COUNT_SQL")"
RESTORED_COUNTS="$(compose_psql -d "$VERIFY_DB" -At -F '|' -c "$COUNT_SQL")"
if [ "$LIVE_COUNTS" != "$RESTORED_COUNTS" ]; then
  echo "Row counts differ between live and restored databases:" >&2
  diff -u <(printf '%s\n' "$LIVE_COUNTS") <(printf '%s\n' "$RESTORED_COUNTS") >&2 || true
  exit 1
fi

echo "==> comparing schema fingerprint"
LIVE_FP="$(compose_psql -d "$PG_DB" -At -c "$FINGERPRINT_SQL")"
RESTORED_FP="$(compose_psql -d "$VERIFY_DB" -At -c "$FINGERPRINT_SQL")"
if [ "$LIVE_FP" != "$RESTORED_FP" ]; then
  echo "Schema fingerprint differs: live=$LIVE_FP restored=$RESTORED_FP" >&2
  exit 1
fi

echo "==> comparing migration ledger"
LIVE_LEDGER="$(compose_psql -d "$PG_DB" -At -c "$LEDGER_SQL")"
RESTORED_LEDGER="$(compose_psql -d "$VERIFY_DB" -At -c "$LEDGER_SQL")"
if [ "$LIVE_LEDGER" != "$RESTORED_LEDGER" ]; then
  echo "Migration ledger differs between live and restored databases" >&2
  exit 1
fi

echo "backup=$BACKUP_FILE"
echo "row_counts=ok tables=${#TABLES[@]}"
echo "schema_fingerprint=ok $LIVE_FP"
echo "migration_ledger=ok"
echo "BACKUP VERIFICATION PASSED"
