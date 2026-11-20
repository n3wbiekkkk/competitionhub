import { Pool, type PoolClient } from "pg";
import { z } from "zod";

const uuidSchema = z.string().uuid();

const globalForPg = globalThis as typeof globalThis & {
  techHubPool?: Pool;
};

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && url.length > 0);
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Set it in .env.local to connect to PostgreSQL 16.",
    );
  }

  if (!globalForPg.techHubPool) {
    globalForPg.techHubPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
    });
  }

  return globalForPg.techHubPool;
}

/**
 * Runs a database callback inside a transaction with RLS context bound
 * to the authenticated user UUID (or empty for anonymous public reads).
 */
export async function withUserDb<T>(
  userId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const validatedUserId = userId !== null ? uuidSchema.parse(userId) : "";
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.system_mode', 'off', true)");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [
      validatedUserId,
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original query/transaction error
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Runs a privileged system transaction (login/register/cron) with
 * app.system_mode = 'on'. Never expose directly to untrusted input.
 */
export async function withSystemDb<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.system_mode', 'on', true)");
    await client.query("SELECT set_config('app.current_user_id', '', true)");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original error
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface DatabaseHealthResult {
  ok: boolean;
  configured: boolean;
  reason?: string;
}

/**
 * Safely checks whether PostgreSQL 16 is configured and reachable.
 * Never throws when the database is offline during build or initial setup.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      reason: "ยังไม่ได้ตั้งค่า DATABASE_URL",
    };
  }

  try {
    const client = await getPool().connect();
    try {
      await client.query("SELECT 1");
      return { ok: true, configured: true };
    } finally {
      client.release();
    }
  } catch {
    return {
      ok: false,
      configured: true,
      reason: "ยังไม่สามารถเชื่อมต่อ PostgreSQL 16 (อาจยังไม่รัน docker compose)",
    };
  }
}
