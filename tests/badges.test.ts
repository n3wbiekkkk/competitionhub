import test from "node:test";
import assert from "node:assert/strict";
import {
  BADGE_CRITERIA,
  evaluateBadgeAwards,
  isChampionRankTier,
  normalizeEvidenceSkill,
  type BadgeEvaluationInput,
} from "../src/lib/db/badges.ts";

function input(overrides: Partial<BadgeEvaluationInput> = {}): BadgeEvaluationInput {
  return {
    interestCount: 0,
    confirmedTeamCount: 0,
    completedTaskCount: 0,
    verifiedAwardCount: 0,
    championAwardCount: 0,
    verifiedSkillCount: 0,
    portfolioLinkCount: 0,
    ...overrides,
  };
}

function codes(result: ReturnType<typeof evaluateBadgeAwards>): string[] {
  return result.map((item) => item.code);
}

test("first interest unlocks the starting badge only", () => {
  const result = evaluateBadgeAwards(input({ interestCount: 1 }));
  assert.deepEqual(codes(result), ["first_interest"]);
  assert.equal(result[0]?.evidenceCount, 1);
});

test("five interests unlock the explorer badge without duplicating the first badge", () => {
  const result = evaluateBadgeAwards(input({ interestCount: 5 }));
  assert.deepEqual(codes(result), ["first_interest", "interest_explorer"]);
});

test("four completed tasks do not unlock the five-task badge", () => {
  assert.equal(
    codes(evaluateBadgeAwards(input({ completedTaskCount: 4 }))).includes("task_five"),
    false,
  );
  const five = evaluateBadgeAwards(input({ completedTaskCount: 5 }));
  assert.equal(codes(five).includes("task_five"), true);
  assert.equal(codes(five).includes("task_ten"), false);
});

test("confirmed teams and verified awards unlock separate collaboration and academic badges", () => {
  const result = evaluateBadgeAwards(
    input({
      confirmedTeamCount: 3,
      verifiedAwardCount: 1,
      verifiedSkillCount: 3,
      portfolioLinkCount: 1,
    }),
  );
  const awarded = codes(result);
  assert.ok(awarded.includes("first_confirmed_team"));
  assert.ok(awarded.includes("team_collaborator"));
  assert.ok(awarded.includes("verified_award"));
  assert.ok(awarded.includes("skill_evidence_three"));
  assert.ok(awarded.includes("portfolio_ready"));
});

test("badge criteria use unique codes and positive thresholds", () => {
  const unique = new Set(BADGE_CRITERIA.map((item) => item.code));
  assert.equal(unique.size, BADGE_CRITERIA.length);
  assert.ok(BADGE_CRITERIA.every((item) => item.threshold >= 1));
});

test("champion rank detection accepts Thai and English first-place labels", () => {
  assert.equal(isChampionRankTier(" รางวัลที่ 1 "), true);
  assert.equal(isChampionRankTier("First Place"), true);
  assert.equal(isChampionRankTier("รางวัลชมเชย"), false);
  assert.equal(isChampionRankTier(null), false);
});

test("evidence skills are normalized once at the boundary", () => {
  assert.equal(normalizeEvidenceSkill("  AI / ML  "), "ai / ml");
  assert.equal(normalizeEvidenceSkill("Frontend   Dev"), "frontend dev");
  assert.equal(normalizeEvidenceSkill("   "), null);
  assert.equal(normalizeEvidenceSkill(null), null);
});
