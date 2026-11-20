import test from "node:test";
import assert from "node:assert/strict";
import { filterDiscoveryCandidates, parseDiscoveryQuery, rankFallbackCompetitions, parseAiDiscoveryResponse } from "../src/lib/ai/discovery.ts";
import type { Competition } from "../src/types/database.ts";

function competition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: "f6ce96a4-0991-481a-ac41-4a5e3fe83ab0",
    title: "AI & Robotics for Students",
    category: "Robotics & IoT",
    deadline: "2026-12-01",
    min_size: 3,
    max_size: 3,
    recommended_roles: ["AI / ML"],
    tech_stack_hints: ["Python", "ESP32"],
    eligibility: "นักเรียนมัธยมศึกษาตอนปลาย",
    summary: "Build a robot that solves problems with AI",
    source_url: null,
    source_type: "manual",
    status: "open",
    created_by: null,
    created_at: "2026-11-01",
    updated_at: "2026-11-01",
    ...overrides,
  };
}

const today = "2026-11-20";

test("Thai natural-language query extracts category and team size", () => {
  const intent = parseDiscoveryQuery("อยากแข่ง AI หุ่นยนต์สำหรับนักเรียนทีม3คน");
  assert.deepEqual(intent.categories, ["Robotics & IoT", "AI & Data Science"]);
  assert.equal(intent.teamSize, 3);
  assert.equal(intent.highSchoolOnly, true);
});

test("candidate filter excludes expired, wrong-team and university-only work", () => {
  const rows = [
    competition(),
    competition({ id: "d7fc0b03-f0bc-4caf-a0d5-14411da796cc", deadline: "2026-11-01" }),
    competition({ id: "b362c200-8d61-4b78-9e1d-5cfd05bbc9fb", min_size: 5 }),
    competition({ id: "bf6ac0b7-4d48-4f2f-8c21-055f232499cb", eligibility: "นิสิตนักศึกษาระดับปริญญาตรี" }),
  ];
  const intent = parseDiscoveryQuery("AI หุ่นยนต์สำหรับนักเรียนทีม3คน");
  assert.deepEqual(filterDiscoveryCandidates(rows, intent, today).map((row) => row.id), [rows[0].id]);
});

test("fallback ranks matched expertise and returns honest deadline/team reasons", () => {
  const rows = [
    competition({ category: "Programming / Competitive" }),
    competition({ id: "d7fc0b03-f0bc-4caf-a0d5-14411da796cc" }),
  ];
  const results = rankFallbackCompetitions(rows, parseDiscoveryQuery("AI หุ่นยนต์ทีม3คน"), ["Python"], today);
  assert.equal(results[0].competition.id, rows[1].id);
  assert.match(results[0].reasons.join(" "), /ทีม 3 คน/);
});

test("AI output cannot invent rows and is safe to reject entirely", () => {
  const valid = competition().id;
  const other = "d7fc0b03-f0bc-4caf-a0d5-14411da796cc";
  const payload = JSON.stringify({ results: [
    { id: valid, reasons: ["ตรงสายหุ่นยนต์ และรองรับทีม 3 คน"] },
    { id: other, reasons: ["ไม่มีรายการนี้ในระบบ"] },
    { id: valid, reasons: ["duplicate"] },
  ] });
  const result = parseAiDiscoveryResponse(payload, new Set([valid]));
  assert.equal(result?.results.length, 1);
  assert.equal(result?.results[0].id, valid);
  assert.equal(parseAiDiscoveryResponse("not-json", new Set([valid])), null);
  assert.equal(parseAiDiscoveryResponse(JSON.stringify({ results: [{ id: other, reasons: ["fabricated"] }] }), new Set([valid])), null);
});

test("one malformed AI item does not discard valid rankings", () => {
  const valid = competition().id;
  const result = parseAiDiscoveryResponse(
    JSON.stringify({ results: [
      { id: valid, reasons: ["ตรงสายหุ่นยนต์"] },
      { id: "not-a-uuid", reasons: ["ผิดรูปแบบ"] },
      null,
    ] }),
    new Set([valid]),
  );
  assert.deepEqual(result, { results: [{ id: valid, reasons: ["ตรงสายหุ่นยนต์"] }] });
});

test("AI responses using reason_th instead of reasons are accepted", () => {
  const valid = competition().id;
  const result = parseAiDiscoveryResponse(
    JSON.stringify({ ranked: [], results: [{ id: valid, reason_th: "ตรงสายหุ่นยนต์และทีม 3 คน" }] }),
    new Set([valid]),
  );
  assert.deepEqual(result, { results: [{ id: valid, reasons: ["ตรงสายหุ่นยนต์และทีม 3 คน"] }] });
});
