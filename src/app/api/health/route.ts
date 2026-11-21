import { NextResponse } from "next/server";
import { isTyphoonConfigured } from "@/lib/ai/opentyphoon";
import { checkDatabaseHealth, withSystemDb } from "@/lib/db/pool";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const database = await checkDatabaseHealth();
  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

  let migrationVersion: string | null = null;
  if (database.ok) {
    try {
      const result = await withSystemDb(async (client) => {
        const res = await client.query<{ version: string }>(
          "select version from public.schema_migrations order by applied_at desc limit 1",
        );
        return res.rows[0]?.version ?? null;
      });
      migrationVersion = result;
    } catch (error) {
      logError("health.migration_lookup_failed", error, {
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    }
  }

  const payload = {
    status: database.ok ? "ok" : "unavailable",
    database: { status: database.ok ? "ok" : "unavailable", latencyMs },
    migration: { version: migrationVersion },
    typhoonConfigured: isTyphoonConfigured(),
    smtpConfigured: Boolean(
      process.env.SMTP_HOST && process.env.SMTP_FROM,
    ),
  };

  return NextResponse.json(payload, {
    status: database.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
