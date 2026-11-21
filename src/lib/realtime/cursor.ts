import { z } from "zod";

const cursorSchema = z.string().datetime();

/** Rejects or defaults an untrusted cursor before it reaches SQL. */
export function normalizeCursor(raw: string | null | undefined, now: Date = new Date()): string {
  const parsed = cursorSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return new Date(now.getTime() - 30_000).toISOString();
}

/** Deterministic backoff used by the client fallback; no randomness to test. */
export function nextRetryDelay(attempt: number, baseMs = 1_000, capMs = 15_000): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 1;
  return Math.min(capMs, baseMs * 2 ** (safeAttempt - 1));
}
