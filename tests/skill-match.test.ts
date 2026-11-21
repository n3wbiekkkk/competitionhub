import test from "node:test";
import assert from "node:assert/strict";
import { explainSkillMatch } from "../src/lib/utils/skill-match.ts";

test("normalizes React and Next.js aliases and cites the source hint", () => {
  const result = explainSkillMatch({
    userSkills: ["ReactJS", "Next.js"],
    competition: {
      tech_stack_hints: ["React / Next.js"],
      recommended_roles: [],
      title: "",
      summary: "",
    },
  });

  assert.equal(result.score, 100);
  assert.deepEqual(result.matchedSkills.map((entry) => entry.skill), ["ReactJS", "Next.js"]);
  assert.deepEqual(result.matchedSkills[0].matchedAs, ["React"]);
  assert.deepEqual(result.matchedSkills[0].evidence, [
    { field: "tech_stack_hint", value: "React / Next.js" },
  ]);
  assert.deepEqual(result.matchedSkills[1].matchedAs, ["Next.js"]);
  assert.deepEqual(result.missingSkills, []);
});

test("normalizes C/C++ and Node aliases without matching unrelated prose", () => {
  const result = explainSkillMatch({
    userSkills: ["C/C++", "Node.js"],
    competition: {
      tech_stack_hints: ["CPP", "NodeJS"],
      recommended_roles: [],
      title: "Cybersecurity club",
      summary: "",
    },
  });

  assert.deepEqual(result.matchedSkills.map((entry) => entry.skill), ["C/C++", "Node.js"]);
  assert.deepEqual(result.matchedSkills[0].matchedAs, ["C++"]);
  assert.deepEqual(result.matchedSkills[1].matchedAs, ["Node.js"]);
  assert.equal(result.score, 100);
});

test("matches recommended roles and reports which skill earned each role", () => {
  const result = explainSkillMatch({
    userSkills: ["Python", "Figma"],
    competition: {
      tech_stack_hints: [],
      recommended_roles: ["AI / ML", "UI/UX Design"],
      title: "",
      summary: "",
    },
  });

  assert.equal(result.score, 100);
  assert.deepEqual(
    result.matchedSkills.map((entry) => entry.evidence[0]),
    [
      { field: "recommended_role", value: "AI / ML" },
      { field: "recommended_role", value: "UI/UX Design" },
    ],
  );
  assert.deepEqual(result.roleMatches, [
    { role: "AI / ML", skills: ["Python"] },
    { role: "UI/UX Design", skills: ["Figma"] },
  ]);
});

test("reports missing skills and scores only the matched share", () => {
  const result = explainSkillMatch({
    userSkills: ["Python", "Docker", "Flutter"],
    competition: {
      tech_stack_hints: ["Python"],
      recommended_roles: [],
      title: "",
      summary: "",
    },
  });

  assert.equal(result.score, 33);
  assert.deepEqual(result.matchedSkills.map((entry) => entry.skill), ["Python"]);
  assert.deepEqual(result.missingSkills, ["Docker", "Flutter"]);
});

test("finds evidence in title and summary with exact field values", () => {
  const result = explainSkillMatch({
    userSkills: ["Go", "R"],
    competition: {
      tech_stack_hints: [],
      recommended_roles: [],
      title: "Go workshop",
      summary: "R for analytics",
    },
  });

  assert.equal(result.score, 100);
  assert.deepEqual(result.matchedSkills[0].evidence, [
    { field: "title", value: "Go workshop" },
  ]);
  assert.deepEqual(result.matchedSkills[1].evidence, [
    { field: "summary", value: "R for analytics" },
  ]);
});

test("does not treat short skill names as substrings of longer words", () => {
  const result = explainSkillMatch({
    userSkills: ["C", "Go"],
    competition: {
      tech_stack_hints: [],
      recommended_roles: [],
      title: "Cybersecurity and MongoDB",
      summary: "",
    },
  });

  assert.equal(result.score, 0);
  assert.deepEqual(result.matchedSkills, []);
  assert.deepEqual(result.missingSkills, ["C", "Go"]);
});

test("collapses alias duplicates before scoring", () => {
  const result = explainSkillMatch({
    userSkills: ["React", "reactjs"],
    competition: {
      tech_stack_hints: ["React"],
      recommended_roles: [],
      title: "",
      summary: "",
    },
  });

  assert.equal(result.score, 100);
  assert.deepEqual(result.matchedSkills.map((entry) => entry.skill), ["React"]);
  assert.deepEqual(result.missingSkills, []);
});

test("keeps evidence deterministic and deduplicates repeated fields", () => {
  const result = explainSkillMatch({
    userSkills: ["Python"],
    competition: {
      tech_stack_hints: ["Python", "Python"],
      recommended_roles: ["AI / ML"],
      title: "Python hackathon",
      summary: "Python for data science",
    },
  });

  assert.deepEqual(result.matchedSkills[0].evidence, [
    { field: "tech_stack_hint", value: "Python" },
    { field: "recommended_role", value: "AI / ML" },
    { field: "title", value: "Python hackathon" },
    { field: "summary", value: "Python for data science" },
  ]);
});

test("ignores empty input without mutating frozen arguments", () => {
  const empty = explainSkillMatch({
    userSkills: ["", "   "],
    competition: { tech_stack_hints: [], recommended_roles: [] },
  });
  assert.deepEqual(empty, {
    score: 0,
    matchedSkills: [],
    missingSkills: [],
    roleMatches: [],
  });

  const userSkills = Object.freeze(["Python"]);
  const competition = Object.freeze({
    tech_stack_hints: Object.freeze(["Python"]),
    recommended_roles: Object.freeze([]),
    title: "",
    summary: "",
  });
  const first = explainSkillMatch({ userSkills, competition });
  const second = explainSkillMatch({ userSkills, competition });

  assert.deepEqual(first, second);
  assert.equal(first.score, 100);
  assert.deepEqual([...userSkills], ["Python"]);
  assert.deepEqual([...competition.tech_stack_hints], ["Python"]);
});
