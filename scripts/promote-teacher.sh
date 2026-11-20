#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <email>"
  exit 1
fi

EMAIL="$1"

docker compose --env-file .env.local exec -T db \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-tech_competition_hub}" \
  -v target_email="$EMAIL" <<'EOSQL'
SELECT set_config('app.system_mode', 'on', false);
UPDATE public.profiles
SET role = 'teacher'
WHERE lower(email) = lower(:'target_email')
RETURNING id, email, full_name, role;
EOSQL
