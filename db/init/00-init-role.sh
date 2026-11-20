#!/bin/sh
set -eu

APP_USER="${APP_DB_USER:-techhub_app}"
APP_PASS="${APP_DB_PASSWORD:-techhub_app_local}"
TARGET_DB="${POSTGRES_DB:-tech_competition_hub}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$TARGET_DB" \
  -v app_user="$APP_USER" \
  -v app_pass="$APP_PASS" \
  -v target_db="$TARGET_DB" <<'EOSQL'
SELECT set_config('init.app_user', :'app_user', false);
SELECT set_config('init.app_pass', :'app_pass', false);
SELECT set_config('init.target_db', :'target_db', false);

DO $$
DECLARE
  v_user text := current_setting('init.app_user', true);
  v_pass text := current_setting('init.app_pass', true);
  v_db   text := current_setting('init.target_db', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_user) THEN
    EXECUTE format(
      'CREATE ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN PASSWORD %L',
      v_user,
      v_pass
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN PASSWORD %L',
      v_user,
      v_pass
    );
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', v_db, v_user);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_user);
END $$;
EOSQL
