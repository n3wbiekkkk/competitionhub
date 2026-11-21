import { z } from "zod";

export interface AiCounters {
  source: "audit_logs";
  windowHours: number;
  requests: number;
  errors: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  instrumented: boolean;
}

export interface AiAuditSample {
  durationMs: number;
  ok: boolean;
}

const aiAuditMetadataSchema = z.object({
  duration_ms: z.number().finite().nonnegative().optional(),
  latency_ms: z.number().finite().nonnegative().optional(),
  ok: z.boolean().optional(),
  error: z.string().optional(),
});

export function parseAiAuditMetadata(value: unknown): AiAuditSample | null {
  const parsed = aiAuditMetadataSchema.safeParse(value);
  if (!parsed.success) return null;

  const durationMs = parsed.data.duration_ms ?? parsed.data.latency_ms;
  if (durationMs === undefined) return null;

  return {
    durationMs: Math.round(durationMs),
    ok: parsed.data.ok ?? parsed.data.error === undefined,
  };
}

export function percentileLatency(
  samples: readonly AiAuditSample[],
  percentile: number,
): number | null {
  if (samples.length === 0) return null;
  if (percentile <= 0) return Math.min(...samples.map((s) => s.durationMs));
  if (percentile >= 1) return Math.max(...samples.map((s) => s.durationMs));

  const sorted = samples
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

export function summarizeAiAudits(
  rows: readonly { metadata: unknown }[],
  windowHours = 24,
): AiCounters {
  const samples = rows
    .map((row) => parseAiAuditMetadata(row.metadata))
    .filter((sample): sample is AiAuditSample => sample !== null);
  const totalLatency = samples.reduce((sum, sample) => sum + sample.durationMs, 0);

  return {
    source: "audit_logs",
    windowHours,
    requests: samples.length,
    errors: samples.filter((sample) => !sample.ok).length,
    avgLatencyMs:
      samples.length === 0 ? null : Math.round(totalLatency / samples.length),
    p95LatencyMs: percentileLatency(samples, 0.95),
    instrumented: samples.length > 0,
  };
}

export const OUTBOX_STATUSES = ["pending", "sent", "failed"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export interface OutboxBucket {
  status: OutboxStatus;
  count: number;
}

function isOutboxStatus(value: string): value is OutboxStatus {
  return OUTBOX_STATUSES.some((status) => status === value);
}

export function toCount(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

export function summarizeOutbox(
  rows: readonly { status: string; count: string | number }[],
): OutboxBucket[] {
  const counts = new Map<OutboxStatus, number>();
  for (const row of rows) {
    if (!isOutboxStatus(row.status)) continue;
    counts.set(row.status, (counts.get(row.status) ?? 0) + toCount(row.count));
  }
  return OUTBOX_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
}

export interface ScoutTotals {
  runs: number;
  found: number;
  inserted: number;
  duplicates: number;
  failedRuns: number;
}

export function summarizeScoutTotals(row: {
  runs: string | number | null | undefined;
  found: string | number | null | undefined;
  inserted: string | number | null | undefined;
  duplicates: string | number | null | undefined;
  failed_runs: string | number | null | undefined;
} | undefined): ScoutTotals {
  return {
    runs: toCount(row?.runs),
    found: toCount(row?.found),
    inserted: toCount(row?.inserted),
    duplicates: toCount(row?.duplicates),
    failedRuns: toCount(row?.failed_runs),
  };
}

export interface ScoutSourceRow {
  source_name: string;
  runs: string | number | null | undefined;
  found: string | number | null | undefined;
  inserted: string | number | null | undefined;
  failed: string | number | null | undefined;
  last_seen: string | null | undefined;
}

export interface ScoutSourceHealthRow {
  name: string;
  last_status: string | null | undefined;
  consecutive_failures: string | number | null | undefined;
}

export interface ScoutSourceStat {
  name: string;
  runs: number;
  found: number;
  inserted: number;
  failed: number;
  lastStatus: string | null;
  consecutiveFailures: number;
  lastSeen: string | null;
}

export function summarizeScoutSources(
  rows: readonly ScoutSourceRow[],
  healthRows: readonly ScoutSourceHealthRow[],
): ScoutSourceStat[] {
  const healthByName = new Map(
    healthRows.map((row) => [row.name, row] as const),
  );

  return rows.map((row) => {
    const health = healthByName.get(row.source_name);
    return {
      name: row.source_name,
      runs: toCount(row.runs),
      found: toCount(row.found),
      inserted: toCount(row.inserted),
      failed: toCount(row.failed),
      lastStatus: health?.last_status ?? null,
      consecutiveFailures: toCount(health?.consecutive_failures),
      lastSeen: row.last_seen ?? null,
    };
  });
}
