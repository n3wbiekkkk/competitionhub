import { NextResponse } from "next/server";
import { isTyphoonConfigured } from "@/lib/ai/opentyphoon";
import { checkDatabaseHealth, withSystemDb } from "@/lib/db/pool";
import {
  EXPECTED_MIGRATION,
  REQUIRED_FUNCTIONS,
  REQUIRED_TABLES,
  REQUIRED_TRIGGERS,
  isSchemaCurrent,
  type SchemaProbe,
} from "@/lib/health/schema";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const database = await checkDatabaseHealth();
  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

  let probe: SchemaProbe | null = null;
  if (database.ok) {
    try {
      probe = await withSystemDb(async (client) => {
        const res = await client.query<SchemaProbe>(
          `select
             (select version from public.schema_migrations order by applied_at desc limit 1) as version,
             (select count(*)::int from information_schema.tables
              where table_schema = 'public' and table_name = any($1::text[])) as tables,
             (select count(*)::int from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = any($2::text[])) as functions,
             (select count(*)::int from pg_trigger where tgname = any($3::text[])) as triggers`,
          [REQUIRED_TABLES, REQUIRED_FUNCTIONS, REQUIRED_TRIGGERS],
        );
        return res.rows[0] ?? null;
      });
    } catch (error) {
      logError("health.schema_lookup_failed", error, {
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    }
  }

  const schemaOk = isSchemaCurrent(probe);
  const ready = database.ok && schemaOk;

  const payload = {
    status: ready ? "ok" : "unavailable",
    database: { status: database.ok ? "ok" : "unavailable", latencyMs },
    migration: {
      version: probe?.version ?? null,
      expected: EXPECTED_MIGRATION,
      ok: schemaOk,
    },
    typhoonConfigured: isTyphoonConfigured(),
    smtpConfigured: Boolean(
      process.env.SMTP_HOST && process.env.SMTP_FROM,
    ),
  };

  return NextResponse.json(payload, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
