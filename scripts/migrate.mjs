import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const root = process.cwd();
const dir = path.join(root, "db", "migrations");
const statusOnly = process.argv.includes("--status");

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function loadEnvFile() {
  if (process.env.POSTGRES_USER) return;
  try {
    const content = readFileSync(path.join(root, ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (match && !(match[1] in process.env)) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Environment may be provided directly by the container.
  }
}

loadEnvFile();

function migrationUrl() {
  if (process.env.MIGRATION_DATABASE_URL) return process.env.MIGRATION_DATABASE_URL;
  const user = env("POSTGRES_USER", "postgres");
  const password = env("POSTGRES_PASSWORD");
  const database = env("POSTGRES_DB", "tech_competition_hub");
  const host = env("DB_HOST", "db");
  const port = env("DB_PORT", "5432");
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

const pool = new Pool({ connectionString: migrationUrl(), max: 1 });

async function ensureLedger(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
    alter table public.schema_migrations enable row level security;
    alter table public.schema_migrations force row level security;
    drop policy if exists schema_migrations_system_all on public.schema_migrations;
    create policy schema_migrations_system_all
      on public.schema_migrations for all
      using (public.app_is_system()) with check (public.app_is_system());
  `);
}

async function main() {
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const client = await pool.connect();
  let inTransaction = false;
  try {
    if (!statusOnly) {
      await client.query("begin");
      inTransaction = true;
      await client.query("select pg_advisory_xact_lock(742910)");
      await ensureLedger(client);
    }

    const ledgerExists = (
      await client.query(
        `select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'schema_migrations'`,
      )
    ).rowCount === 1;
    const applied = new Map(
      ledgerExists
        ? (
            await client.query("select version, checksum from public.schema_migrations")
          ).rows.map((row) => [row.version, row.checksum])
        : [],
    );

    let count = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const sql = await readFile(path.join(dir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = applied.get(version);

      if (existing === checksum) {
        console.log(`skip ${version} checksum=ok`);
        continue;
      }
      if (existing === "phase1-baseline" || existing === "legacy") {
        await client.query(
          "update public.schema_migrations set checksum = $2 where version = $1",
          [version, checksum],
        );
        console.log(`adopt ${version} checksum=updated`);
        continue;
      }
      if (existing) {
        throw new Error(`checksum mismatch for ${version}`);
      }

      if (statusOnly) {
        console.log(`pending ${version}`);
        continue;
      }

      await client.query(sql);
      await client.query(
        "insert into public.schema_migrations (version, checksum) values ($1, $2)",
        [version, checksum],
      );
      count += 1;
      console.log(`apply ${version} checksum=${checksum.slice(0, 12)}`);
    }
    if (inTransaction) {
      await client.query("commit");
      inTransaction = false;
    }
    console.log(statusOnly ? "status complete" : `migrations complete applied=${count}`);
  } catch (error) {
    if (inTransaction) await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error("[migrate] failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return pool.end();
  });
