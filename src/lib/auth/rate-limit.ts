import { withSystemDb } from "@/lib/db/pool";
import { logError } from "@/lib/utils/logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimitDecision(
  hitCount: number,
  limit: number,
  retryAfterSeconds: number,
): RateLimitResult {
  const allowed = hitCount <= limit;
  return {
    allowed,
    remaining: allowed ? Math.max(0, limit - hitCount) : 0,
    retryAfterSeconds: Math.max(1, retryAfterSeconds),
  };
}

/**
 * Atomic fixed-window limiter backed by PostgreSQL. Safe across container
 * restarts and multiple web processes. System scope is intentional because
 * the keys are not tied to one user's RLS context.
 */
export async function consumeRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  if (!key || key.length > 300) {
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }
  if (process.env.E2E_BYPASS_RATE_LIMIT === "true") {
    return { allowed: true, remaining: limit, retryAfterSeconds: 1 };
  }

  try {
    const row = await withSystemDb(async (client) => {
      await client.query(
        "DELETE FROM public.rate_limit_buckets WHERE expires_at < now() - interval '1 hour'",
      );
      const result = await client.query<{
        hit_count: number;
        retry_after: number;
      }>(
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
         RETURNING hit_count,
                   GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - now()))))::int AS retry_after`,
        [key, windowMs],
      );
      return result.rows[0] ?? null;
    });

    if (!row) {
      return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
    }
    return rateLimitDecision(row.hit_count, limit, row.retry_after);
  } catch (error) {
    logError("[rate-limit] unavailable", error);
    return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  }
}
