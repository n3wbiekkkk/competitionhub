import { withSystemDb } from "@/lib/db/pool";
import { getActiveSseStreamCount } from "@/lib/ops/sse-streams";
import {
  summarizeAiAudits,
  summarizeOutbox,
  summarizeScoutSources,
  summarizeScoutTotals,
  toCount,
  type AiCounters,
  type OutboxBucket,
  type ScoutSourceRow,
  type ScoutSourceStat,
  type ScoutTotals,
} from "@/lib/ops/telemetry-aggregate";

export const AI_COUNTER_WINDOW_HOURS = 24;

export const TELEMETRY_TABLES = [
  "auth_accounts",
  "auth_security",
  "profiles",
  "competitions",
  "interests",
  "teams",
  "team_members",
  "competition_bookmarks",
  "competition_comments",
  "competition_results",
  "team_tasks",
  "team_activity_logs",
  "notifications",
  "notification_preferences",
  "profile_avatars",
  "user_sessions",
  "email_outbox",
  "audit_logs",
  "rate_limit_buckets",
  "scout_sources",
  "scout_runs",
  "scout_run_sources",
  "schema_migrations",
] as const;

export interface TableStat {
  name: string;
  rows: number;
  bytes: number;
}

export interface ScoutSummary extends ScoutTotals {
  windowDays: number;
  sources: ScoutSourceStat[];
}

export interface RealtimeCounters {
  activeSseStreams: number;
  sseScope: "process-local";
  rateLimitBucketsActive: number;
  rateLimitHitsLastHour: number;
}

export interface OpsTelemetrySnapshot {
  generatedAt: string;
  tables: TableStat[];
  outbox: OutboxBucket[];
  scout: ScoutSummary;
  ai: AiCounters;
  realtime: RealtimeCounters;
}

interface TableStatRow {
  name: string;
  rows: string | number;
  bytes: string | number;
}

interface ScoutTotalsRow {
  runs: string | number;
  found: string | number;
  inserted: string | number;
  duplicates: string | number;
  failed_runs: string | number;
}

interface ScoutHealthRow {
  name: string;
  last_status: string | null;
  consecutive_failures: string | number;
}

interface RealtimeRow {
  active_buckets: string | number;
  hits_last_hour: string | number;
}

export function buildTableStatsQuery(): string {
  const selects = TELEMETRY_TABLES.map(
    (table) =>
      `select '${table}'::text as name,
              (select count(*) from public.${table})::bigint as rows,
              pg_total_relation_size('public.${table}')::bigint as bytes`,
  );
  return `${selects.join("\nunion all\n")}\norder by name`;
}

/**
 * Collects admin telemetry. Call only from a server route after the teacher
 * role check: system mode is required for outbox, audit and rate-limit tables.
 */
export async function loadOpsTelemetry(): Promise<OpsTelemetrySnapshot> {
  return withSystemDb(async (client) => {
    const [tablesRes, outboxRes, scoutTotalsRes, scoutSourcesRes, scoutHealthRes, aiRes, realtimeRes] =
      await Promise.all([
        client.query<TableStatRow>(buildTableStatsQuery()),
        client.query<{ status: string; count: string | number }>(
          `select status, count(*)::bigint as count
           from public.email_outbox
           group by status`,
        ),
        client.query<ScoutTotalsRow>(
          `select count(*)::bigint as runs,
                  coalesce(sum(found_count), 0)::bigint as found,
                  coalesce(sum(inserted_count), 0)::bigint as inserted,
                  coalesce(sum(duplicate_count), 0)::bigint as duplicates,
                  count(*) filter (where status = 'failed')::bigint as failed_runs
           from public.scout_runs
           where started_at >= now() - interval '30 days'`,
        ),
        client.query<ScoutSourceRow>(
          `select r.source_name,
                  count(*)::bigint as runs,
                  coalesce(sum(r.found_count), 0)::bigint as found,
                  coalesce(sum(r.inserted_count), 0)::bigint as inserted,
                  count(*) filter (where r.status = 'failed')::bigint as failed,
                  max(s.started_at)::text as last_seen
           from public.scout_run_sources r
           join public.scout_runs s on s.id = r.run_id
           where s.started_at >= now() - interval '30 days'
           group by r.source_name
           order by r.source_name`,
        ),
        client.query<ScoutHealthRow>(
          `select name, last_status, consecutive_failures
           from public.scout_sources
           order by name`,
        ),
        client.query<{ metadata: unknown }>(
          `select metadata
           from public.audit_logs
           where action = 'ai.request'
             and created_at >= now() - make_interval(hours => $1)`,
          [AI_COUNTER_WINDOW_HOURS],
        ),
        client.query<RealtimeRow>(
          `select count(*) filter (where expires_at > now())::bigint as active_buckets,
                  coalesce(sum(hit_count) filter (
                    where window_start >= now() - interval '1 hour'
                  ), 0)::bigint as hits_last_hour
           from public.rate_limit_buckets`,
        ),
      ]);

    const realtime = realtimeRes.rows[0];

    return {
      generatedAt: new Date().toISOString(),
      tables: tablesRes.rows.map((row) => ({
        name: row.name,
        rows: toCount(row.rows),
        bytes: toCount(row.bytes),
      })),
      outbox: summarizeOutbox(outboxRes.rows),
      scout: {
        ...summarizeScoutTotals(scoutTotalsRes.rows[0]),
        windowDays: 30,
        sources: summarizeScoutSources(scoutSourcesRes.rows, scoutHealthRes.rows),
      },
      ai: summarizeAiAudits(aiRes.rows, AI_COUNTER_WINDOW_HOURS),
      realtime: {
        activeSseStreams: getActiveSseStreamCount(),
        sseScope: "process-local",
        rateLimitBucketsActive: toCount(realtime?.active_buckets),
        rateLimitHitsLastHour: toCount(realtime?.hits_last_hour),
      },
    };
  });
}
