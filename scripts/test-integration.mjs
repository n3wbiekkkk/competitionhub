import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

function loadEnv() {
  if (process.env.MIGRATION_DATABASE_URL || process.env.POSTGRES_USER) return;
  try {
    const content = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (match && !(match[1] in process.env)) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // CI provides the environment directly.
  }
}
loadEnv();

function url() {
  if (process.env.MIGRATION_DATABASE_URL) return process.env.MIGRATION_DATABASE_URL;
  const user = process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_PASSWORD ?? "";
  const db = process.env.POSTGRES_DB ?? "tech_competition_hub_test";
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

const migrationVersions = readdirSync(path.join(process.cwd(), "db/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.replace(/\.sql$/, ""))
  .sort();

const pool = new Pool({ connectionString: url(), max: 1 });

async function main() {
  const client = await pool.connect();
  try {
    const unprotected = await client.query(
      `select c.relname as tablename
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and not c.relforcerowsecurity
       order by 1`,
    );
    assert.deepEqual(unprotected.rows, [], "every public table must FORCE RLS");

    const tableCount = await client.query(
      `select count(*)::int as count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    assert.ok(Number(tableCount.rows[0]?.count ?? 0) > 0, "schema has no tables");

    const applied = await client.query(
      "select version from public.schema_migrations",
    );
    const appliedVersions = new Set(applied.rows.map((row) => row.version));
    const missingMigrations = migrationVersions.filter(
      (version) => !appliedVersions.has(version),
    );
    assert.deepEqual(missingMigrations, [], "all migrations must be applied");

    const objects = await client.query(
      `select
         (select count(*)::int from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('app_uid','app_session_version','ensure_notification_preferences')) as functions,
         (select count(*)::int from pg_trigger
          where tgname in ('assert_confirmed_team_size_trigger','ensure_notification_preferences_trigger')) as triggers`,
    );
    assert.equal(objects.rows[0]?.functions, 3, "required functions must exist");
    assert.equal(objects.rows[0]?.triggers, 2, "required triggers must exist");

    const rateKey = `integration:rate-limit:${Date.now()}`;
    const bucket = await client.query(
      `INSERT INTO public.rate_limit_buckets (key, hit_count, window_start, expires_at)
       VALUES ($1, 1, now(), now() + ($2 || ' milliseconds')::interval)
       ON CONFLICT (key) DO UPDATE
       SET hit_count = CASE
             WHEN public.rate_limit_buckets.expires_at <= now() THEN 1
             ELSE public.rate_limit_buckets.hit_count + 1
           END,
           window_start = CASE
             WHEN public.rate_limit_buckets.expires_at <= now() THEN now()
             ELSE public.rate_limit_buckets.window_start
           END,
           expires_at = CASE
             WHEN public.rate_limit_buckets.expires_at <= now()
               THEN now() + ($2 || ' milliseconds')::interval
             ELSE public.rate_limit_buckets.expires_at
           END
       RETURNING hit_count`,
      [rateKey, 60_000],
    );
    assert.equal(bucket.rows[0]?.hit_count, 1, "rate limit upsert must accept typed parameters");
    await client.query("DELETE FROM public.rate_limit_buckets WHERE key = $1", [rateKey]);

    console.log(
      `integration ok tables=${tableCount.rows[0].count} migrations=${migrationVersions.length}`,
    );
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error("[integration] failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return pool.end();
  });
