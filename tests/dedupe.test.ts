import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeCompetition,
  normalizeCompetitionSourceUrl,
  normalizeCompetitionTitle,
} from "../src/lib/ai/dedupe.ts";

test("URL canonicalization strips tracking, hash and default port noise", () => {
  assert.equal(
    normalizeCompetitionSourceUrl(
      "https://www.Example.com:443/event/?utm_source=x&b=2&a=1#top",
    ),
    "https://example.com/event?a=1&b=2",
  );
  assert.equal(normalizeCompetitionSourceUrl("not-a-url"), null);
  assert.equal(
    normalizeCompetitionTitle("  Thailand AI!   Hackathon 2026  "),
    "thailand ai hackathon 2026",
  );
});

test("an exact source URL blocks a differently titled candidate", () => {
  const decision = dedupeCompetition(
    {
      title: "完全不同的一场活动",
      sourceUrl: "https://www.example.com/event?id=1#top",
    },
    [
      {
        id: "existing-1",
        title: "Thailand AI Hackathon 2026",
        sourceUrl: "https://example.com/event?id=1",
      },
    ],
  );

  assert.deepEqual(decision, {
    action: "skip",
    reason: "exact_url",
    score: 1,
    matchId: "existing-1",
  });
});

test("a near-identical title with the same deadline is skipped", () => {
  const decision = dedupeCompetition(
    { title: "Thailand AI Hackathon 2026", deadline: "2026-12-01" },
    [
      {
        id: "previous-1",
        title: "Thailand AI Hackathon 2026 Final",
        deadline: "2026-12-01",
      },
    ],
  );

  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "near_duplicate");
  assert.equal(decision.matchId, "previous-1");
  assert.ok(decision.score >= 0.85);
});

test("a medium title match is sent to review instead of being discarded", () => {
  const decision = dedupeCompetition(
    { title: "Thailand AI Hackathon 2026", deadline: "2026-12-01" },
    [
      {
        id: "previous-1",
        title: "Thailand AI Hackathon 2026 Bangkok",
        deadline: "2026-12-02",
      },
    ],
  );

  assert.equal(decision.action, "needs_review");
  assert.equal(decision.reason, "possible_duplicate");
  assert.equal(decision.matchId, "previous-1");
  assert.ok(decision.score >= 0.72 && decision.score < 0.85);
});

test("the same title with a distant deadline needs review", () => {
  const decision = dedupeCompetition(
    { title: "Thailand AI Hackathon 2026", deadline: "2026-12-01" },
    [
      {
        id: "previous-1",
        title: "Thailand AI Hackathon 2026",
        deadline: "2027-01-15",
      },
    ],
  );

  assert.equal(decision.action, "needs_review");
  assert.equal(decision.reason, "possible_duplicate");
  assert.equal(decision.matchId, "previous-1");
});

test("an unrelated competition is inserted", () => {
  const decision = dedupeCompetition(
    { title: "Thailand AI Hackathon 2026", deadline: "2026-12-01" },
    [
      {
        id: "previous-1",
        title: "Thailand IoT Contest 2026",
        deadline: "2026-12-01",
      },
    ],
  );

  assert.equal(decision.action, "insert");
  assert.equal(decision.reason, "unique");
  assert.equal(decision.matchId, null);
  assert.ok(decision.score < 0.72);
});

test("the strongest title match wins and invalid URLs fall back to titles", () => {
  const decision = dedupeCompetition(
    {
      title: "Thailand AI Hackathon 2026",
      sourceUrl: "not-a-url",
      deadline: "2026-12-01",
    },
    [
      {
        id: "low",
        title: "Thailand IoT Contest 2026",
        deadline: "2026-12-01",
      },
      {
        id: "high",
        title: "Thailand AI Hackathon 2026 Bangkok",
        deadline: "2026-12-01",
      },
    ],
  );

  assert.equal(decision.action, "needs_review");
  assert.equal(decision.matchId, "high");
});
