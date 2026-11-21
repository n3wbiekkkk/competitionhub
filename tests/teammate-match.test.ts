import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveTeamNeeds,
  rankTeammates,
  type RankingCandidate,
  type RankingMember,
} from "../src/lib/utils/teammate-match.ts";

const competition = {
  recommended_roles: ["Frontend", "Backend", "AI / ML"],
  tech_stack_hints: ["React / Next.js", "Python"],
};

const members: RankingMember[] = [
  {
    user_id: "owner",
    assigned_role: "Frontend",
    skills: ["React / Next.js"],
  },
];

const candidates: RankingCandidate[] = [
  {
    user_id: "backend-peer",
    full_name: "Backend Peer",
    preferred_role: "Backend",
    skills: ["Node.js", "SQL"],
  },
  {
    user_id: "ai-peer",
    full_name: "AI Peer",
    preferred_role: "AI / ML",
    skills: ["Python", "PyTorch / TensorFlow"],
  },
  {
    user_id: "design-peer",
    full_name: "Design Peer",
    preferred_role: "UI/UX Design",
    skills: ["Figma"],
  },
];

test("deriveTeamNeeds subtracts covered roles and technologies", () => {
  const needs = deriveTeamNeeds({
    competition,
    members,
    open_roles: [{ role: "Backend", remaining: 1 }],
  });

  assert.deepEqual(needs.missing_roles, ["Backend", "AI / ML"]);
  assert.deepEqual(needs.missing_tech_hints, ["Python"]);
  assert.deepEqual(needs.open_roles, ["Backend"]);
});

test("rankTeammates rewards missing roles and missing tech hints", () => {
  const result = rankTeammates({
    competition,
    members,
    candidates,
  });

  assert.deepEqual(
    result.ranked.map((item) => item.candidate.user_id),
    ["ai-peer", "backend-peer"],
  );
  assert.equal(result.ranked[0]?.score, 59);
  assert.ok(
    result.ranked[0]?.reasons.some((reason) => reason.includes("Python")),
  );
  assert.deepEqual(result.explanation.missing_roles, ["Backend", "AI / ML"]);
});

test("rankTeammates explains open roles without recommending self or members", () => {
  const result = rankTeammates({
    competition: { recommended_roles: [], tech_stack_hints: [] },
    members: [{ user_id: "owner", assigned_role: "Frontend", skills: [] }],
    candidates: [
      {
        user_id: "owner",
        full_name: "Owner",
        preferred_role: "Backend",
        skills: [],
      },
      {
        user_id: "backend-peer",
        full_name: "Backend Peer",
        preferred_role: "Backend",
        skills: [],
      },
      {
        user_id: "full-peer",
        full_name: "Full Peer",
        preferred_role: "Full-Stack",
        skills: [],
      },
    ],
    open_roles: [
      { role: "Backend", remaining: 1 },
      { role: "Frontend", remaining: 0 },
    ],
    exclude_user_ids: ["owner"],
  });

  assert.deepEqual(
    result.ranked.map((item) => item.candidate.user_id),
    ["backend-peer"],
  );
  assert.equal(result.ranked[0]?.score, 10);
  assert.ok(
    result.ranked[0]?.reasons.some((reason) => reason.includes("Backend")),
  );
  assert.deepEqual(result.explanation.open_roles, ["Backend"]);
});

test("rankTeammates is deterministic for equal scores", () => {
  const result = rankTeammates({
    competition: { recommended_roles: [], tech_stack_hints: ["Git"] },
    members: [],
    candidates: [
      {
        user_id: "z",
        full_name: "Zed",
        preferred_role: "Backend",
        skills: ["Git"],
      },
      {
        user_id: "a",
        full_name: "Alpha",
        preferred_role: "Backend",
        skills: ["Git"],
      },
    ],
  });

  assert.deepEqual(
    result.ranked.map((item) => item.candidate.user_id),
    ["a", "z"],
  );
  assert.equal(result.ranked[0]?.score, 14);
});
