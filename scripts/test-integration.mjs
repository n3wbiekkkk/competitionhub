import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const pool = new Pool({ connectionString: url(), max: 1 });

async function main() {
  const client = await pool.connect();
  try {
    const tables = [
      "profiles", "competitions", "interests", "teams", "team_members",
      "auth_security", "rate_limit_buckets", "schema_migrations",
      "user_sessions", "email_outbox", "audit_logs",
      "scout_sources", "scout_runs", "competition_bookmarks",
      "competition_comments", "team_tasks", "notifications",
    ];
    const result = await client.query(
      `select c.relname as tablename
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and not c.relforcerowsecurity and c.relname = any($1::text[])`,
      [tables],
    );
    assert.deepEqual(result.rows, [], "all listed tables must FORCE RLS");
    const migrations = await client.query(
      "select count(*)::text as count from public.schema_migrations",
    );
    assert.ok(Number(migrations.rows[0]?.count ?? 0) > 0, "migration ledger not empty");

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

    console.log(`integration ok tables=${tables.length} migrations=${migrations.rows[0]?.count}`);
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
