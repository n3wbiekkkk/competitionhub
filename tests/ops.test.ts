import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAiAuditMetadata,
  percentileLatency,
  summarizeAiAudits,
  summarizeOutbox,
  summarizeScoutSources,
  summarizeScoutTotals,
} from "../src/lib/ops/telemetry-aggregate.ts";
import { getActiveSseStreamCount, trackSseStream } from "../src/lib/ops/sse-streams.ts";
import { buildTableStatsQuery, TELEMETRY_TABLES } from "../src/lib/ops/telemetry.ts";

test("AI audit metadata is parsed only when it carries a duration", () => {
  assert.deepEqual(parseAiAuditMetadata({ duration_ms: 812.6, ok: false }), {
    durationMs: 813,
    ok: false,
  });
  assert.deepEqual(parseAiAuditMetadata({ latency_ms: 40, error: "timeout" }), {
    durationMs: 40,
    ok: false,
  });
  assert.equal(parseAiAuditMetadata({ ok: true }), null);
  assert.equal(parseAiAuditMetadata({ duration_ms: -1, ok: true }), null);
  assert.equal(parseAiAuditMetadata(null), null);
});

test("AI counters report errors, average and p95 from audit metadata", () => {
  const counters = summarizeAiAudits(
    [
      { metadata: { duration_ms: 100, ok: true } },
      { metadata: { duration_ms: 200, ok: true } },
      { metadata: { duration_ms: 900, ok: false } },
      { metadata: { full_name: "ignored" } },
    ],
    12,
  );

  assert.equal(counters.source, "audit_logs");
  assert.equal(counters.windowHours, 12);
  assert.equal(counters.requests, 3);
  assert.equal(counters.errors, 1);
  assert.equal(counters.avgLatencyMs, 400);
  assert.equal(counters.p95LatencyMs, 900);
  assert.equal(counters.instrumented, true);
});

test("empty AI counters are explicitly uninstrumented", () => {
  const counters = summarizeAiAudits([]);
  assert.equal(counters.requests, 0);
  assert.equal(counters.avgLatencyMs, null);
  assert.equal(counters.p95LatencyMs, null);
  assert.equal(counters.instrumented, false);
  assert.equal(percentileLatency([], 0.95), null);
});

test("outbox breakdown only emits the three known statuses", () => {
  assert.deepEqual(
    summarizeOutbox([
      { status: "sent", count: "4" },
      { status: "pending", count: 2 },
      { status: "unknown", count: 9 },
      { status: "sent", count: 1 },
    ]),
    [
      { status: "pending", count: 2 },
      { status: "sent", count: 5 },
      { status: "failed", count: 0 },
    ],
  );
});

test("scout totals and source health are normalized to numbers", () => {
  assert.deepEqual(
    summarizeScoutTotals({
      runs: "12",
      found: "340",
      inserted: "28",
      duplicates: "91",
      failed_runs: "2",
    }),
    { runs: 12, found: 340, inserted: 28, duplicates: 91, failedRuns: 2 },
  );
  assert.deepEqual(summarizeScoutTotals(undefined), {
    runs: 0,
    found: 0,
    inserted: 0,
    duplicates: 0,
    failedRuns: 0,
  });

  const sources = summarizeScoutSources(
    [
      {
        source_name: "CTF Thailand",
        runs: "4",
        found: "12",
        inserted: "3",
        failed: "1",
        last_seen: "2026-01-01T00:00:00.000Z",
      },
    ],
    [
      {
        name: "CTF Thailand",
        last_status: "failed",
        consecutive_failures: "2",
      },
    ],
  );
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.name, "CTF Thailand");
  assert.equal(sources[0]?.failed, 1);
  assert.equal(sources[0]?.lastStatus, "failed");
  assert.equal(sources[0]?.consecutiveFailures, 2);
});

test("SSE registry counts live streams and releases on abort", () => {
  const before = getActiveSseStreamCount();
  const controller = new AbortController();
  const release = trackSseStream(controller.signal);
  assert.equal(getActiveSseStreamCount(), before + 1);

  controller.abort();
  assert.equal(getActiveSseStreamCount(), before);
  release();
  assert.equal(getActiveSseStreamCount(), before);

  const secondRelease = trackSseStream();
  assert.equal(getActiveSseStreamCount(), before + 1);
  secondRelease();
  assert.equal(getActiveSseStreamCount(), before);
});

test("table stats query counts and sizes every telemetry table once", () => {
  const query = buildTableStatsQuery();
  assert.equal(new Set(TELEMETRY_TABLES).size, TELEMETRY_TABLES.length);
  for (const table of TELEMETRY_TABLES) {
    assert.equal(query.includes(`public.${table}`), true, `missing ${table}`);
  }
  assert.equal(query.includes("pg_total_relation_size"), true);
});
