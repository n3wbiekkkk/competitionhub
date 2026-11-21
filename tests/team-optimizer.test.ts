import test from "node:test";
import assert from "node:assert/strict";
import {
  optimizeTeams,
  scoreTeam,
  type CompetitionTargets,
  type OptimizerInput,
  type OptimizerStudent,
} from "../src/lib/utils/team-optimizer.ts";

function targets(
  overrides: Partial<CompetitionTargets> = {},
): CompetitionTargets {
  return {
    min_size: 2,
    max_size: 4,
    recommended_roles: [],
    tech_stack_hints: [],
    ...overrides,
  };
}

function student(
  id: string,
  preferredRole: string,
  grade: string,
  skills: string[],
): OptimizerStudent {
  return {
    user_id: id,
    preferred_role: preferredRole,
    grade,
    skills,
  };
}

function assigned(
  students: readonly OptimizerStudent[],
): Array<{ user_id: string; assigned_role: string }> {
  return students.map((item) => ({
    user_id: item.user_id,
    assigned_role: item.preferred_role ?? "",
  }));
}

function ids(members: readonly { user_id: string }[]): string[] {
  return members.map((member) => member.user_id).sort();
}

test("scoreTeam separates coverage, diversity and grade balance", () => {
  const competition = targets({
    min_size: 4,
    max_size: 4,
    recommended_roles: ["Frontend", "Backend", "AI / ML"],
    tech_stack_hints: ["React / Next.js", "Python", "Docker"],
  });

  const balanced = [
    student("a", "Frontend", "ม.3", ["React / Next.js", "Git"]),
    student("b", "Backend", "ม.4", ["TypeScript", "Git"]),
    student("c", "AI / ML", "ม.5", ["Python", "Docker"]),
    student("d", "UI/UX Design", "ม.6", ["Figma", "Git"]),
  ];
  const duplicated = [
    student("e", "Frontend", "ม.4", ["Git"]),
    student("f", "Frontend", "ม.4", ["Git"]),
    student("g", "Frontend", "ม.4", ["Git"]),
    student("h", "Frontend", "ม.4", ["Git"]),
  ];

  const strongScore = scoreTeam({
    members: assigned(balanced),
    students: balanced,
    competition,
  });
  const weakScore = scoreTeam({
    members: assigned(duplicated),
    students: duplicated,
    competition,
  });

  for (const objective of [
    "roleCoverage",
    "techCoverage",
    "skillDiversity",
    "gradeBalance",
    "weighted",
  ] as const) {
    assert.ok(
      strongScore[objective] > weakScore[objective],
      `${objective} should reward the balanced team`,
    );
  }
});

test("objective weights change which team scores higher", () => {
  const competition = targets({
    min_size: 2,
    max_size: 2,
    recommended_roles: ["Frontend", "Backend"],
    tech_stack_hints: ["Git"],
  });

  const roleFocused = scoreTeam({
    members: [
      { user_id: "a", assigned_role: "Frontend", grade: "ม.4", skills: ["Git"] },
      { user_id: "b", assigned_role: "Backend", grade: "ม.4", skills: ["Git"] },
    ],
    competition,
    weights: {
      roleCoverage: 1,
      techCoverage: 0,
      skillDiversity: 0,
      gradeBalance: 0,
    },
  });
  const gradeFocused = scoreTeam({
    members: [
      { user_id: "c", assigned_role: "Frontend", grade: "ม.4", skills: ["Git"] },
      { user_id: "d", assigned_role: "Frontend", grade: "ม.5", skills: ["Git"] },
    ],
    competition,
    weights: {
      roleCoverage: 0,
      techCoverage: 0,
      skillDiversity: 0,
      gradeBalance: 1,
    },
  });

  const roleFocusedGrade = scoreTeam({
    members: [
      { user_id: "a", assigned_role: "Frontend", grade: "ม.4", skills: ["Git"] },
      { user_id: "b", assigned_role: "Backend", grade: "ม.4", skills: ["Git"] },
    ],
    competition,
    weights: {
      roleCoverage: 0,
      techCoverage: 0,
      skillDiversity: 0,
      gradeBalance: 1,
    },
  });
  const gradeFocusedRole = scoreTeam({
    members: [
      { user_id: "c", assigned_role: "Frontend", grade: "ม.4", skills: ["Git"] },
      { user_id: "d", assigned_role: "Frontend", grade: "ม.5", skills: ["Git"] },
    ],
    competition,
    weights: {
      roleCoverage: 1,
      techCoverage: 0,
      skillDiversity: 0,
      gradeBalance: 0,
    },
  });

  assert.equal(roleFocused.roleCoverage, 1);
  assert.equal(gradeFocused.gradeBalance, 1);
  assert.ok(roleFocused.weighted > gradeFocusedRole.weighted);
  assert.ok(gradeFocused.weighted > roleFocusedGrade.weighted);
});

test("optimizeTeams fills draft teams, respects max size and does not mutate input", () => {
  const students = [
    student("s1", "Frontend", "ม.4", ["React / Next.js"]),
    student("s2", "Backend", "ม.5", ["Python"]),
    student("s3", "AI / ML", "ม.6", ["Docker"]),
    student("s4", "Frontend", "ม.3", ["TypeScript"]),
    student("s5", "Backend", "ม.4", ["Git"]),
    student("s6", "AI / ML", "ม.5", ["Figma"]),
  ];
  const input: OptimizerInput = {
    students,
    teams: [
      { id: "team-a", members: [] },
      { id: "team-b", members: [] },
    ],
    competition: targets({
      min_size: 2,
      max_size: 3,
      recommended_roles: ["Frontend", "Backend", "AI / ML"],
      tech_stack_hints: ["React / Next.js", "Python", "Docker"],
    }),
  };
  const snapshot = JSON.parse(JSON.stringify(input)) as OptimizerInput;

  const result = optimizeTeams(input);

  assert.equal(result.teams.length, 2);
  assert.deepEqual(
    result.teams.map((team) => team.members.length),
    [3, 3],
  );
  assert.deepEqual(
    result.teams.flatMap((team) => team.members.map((member) => member.user_id)).sort(),
    ["s1", "s2", "s3", "s4", "s5", "s6"],
  );
  assert.deepEqual(result.unassigned, []);
  assert.deepEqual(input, snapshot);
});

test("tech hints steer a student to the team missing that skill", () => {
  const input: OptimizerInput = {
    students: [
      student("py", "AI / ML", "ม.4", ["Python"]),
      student("react", "AI / ML", "ม.4", ["React / Next.js"]),
    ],
    teams: [
      {
        id: "team-a",
        members: [
          {
            user_id: "a1",
            assigned_role: "Frontend",
            grade: "ม.4",
            skills: ["React / Next.js", "Docker"],
          },
        ],
      },
      {
        id: "team-b",
        members: [
          {
            user_id: "b1",
            assigned_role: "Backend",
            grade: "ม.4",
            skills: ["Docker"],
          },
        ],
      },
    ],
    competition: targets({
      min_size: 2,
      max_size: 3,
      recommended_roles: ["Frontend", "Backend", "AI / ML"],
      tech_stack_hints: ["React / Next.js", "Python", "Docker"],
    }),
  };

  const result = optimizeTeams(input);
  const teamB = result.teams.find((team) => team.id === "team-b");

  assert.ok(teamB);
  assert.deepEqual(ids(teamB.members), ["b1", "py", "react"]);
  assert.equal(teamB.score.techCoverage, 1);
});

test("grade balance puts mixed grades on both teams", () => {
  const input: OptimizerInput = {
    students: [
      student("g4b", "Frontend", "ม.4", ["Git"]),
      student("g5b", "Backend", "ม.5", ["Git"]),
    ],
    teams: [
      {
        id: "team-a",
        members: [
          {
            user_id: "g4a",
            assigned_role: "Frontend",
            grade: "ม.4",
            skills: ["Git"],
          },
        ],
      },
      {
        id: "team-b",
        members: [
          {
            user_id: "g5a",
            assigned_role: "Backend",
            grade: "ม.5",
            skills: ["Git"],
          },
        ],
      },
    ],
    competition: targets({ min_size: 2, max_size: 2 }),
  };

  const result = optimizeTeams(input);

  for (const team of result.teams) {
    const memberIds = ids(team.members);
    assert.equal(memberIds.length, 2);
    assert.equal(team.score.gradeBalance, 1);
  }
  assert.deepEqual(result.unassigned, []);
});

test("confirmed teams, locked teams and locked students stay unchanged", () => {
  const input: OptimizerInput = {
    students: [
      student("c1", "Frontend", "ม.4", ["Git"]),
      student("l1", "Backend", "ม.5", ["Git"]),
      student("free", "AI / ML", "ม.6", ["Python"]),
      student("held", "Frontend", "ม.4", ["Git"]),
    ],
    teams: [
      {
        id: "confirmed",
        status: "confirmed",
        members: [
          { user_id: "c1", assigned_role: "Frontend", grade: "ม.4", skills: ["Git"] },
        ],
      },
      {
        id: "locked",
        members: [
          { user_id: "l1", assigned_role: "Backend", grade: "ม.5", skills: ["Git"] },
        ],
      },
      { id: "draft", members: [] },
    ],
    competition: targets({
      min_size: 1,
      max_size: 3,
      recommended_roles: ["Frontend", "Backend", "AI / ML"],
      tech_stack_hints: ["Git", "Python"],
    }),
    lockedTeamIds: ["locked"],
    lockedStudentIds: ["held"],
  };

  const result = optimizeTeams(input);
  const confirmed = result.teams.find((team) => team.id === "confirmed");
  const locked = result.teams.find((team) => team.id === "locked");
  const draft = result.teams.find((team) => team.id === "draft");

  assert.ok(confirmed);
  assert.ok(locked);
  assert.ok(draft);
  assert.equal(confirmed.status, "confirmed");
  assert.deepEqual(ids(confirmed.members), ["c1"]);
  assert.deepEqual(ids(locked.members), ["l1"]);
  assert.deepEqual(ids(draft.members), ["free"]);
  assert.deepEqual(result.unassigned, ["held"]);
});

test("optimizeTeams is deterministic for the same input", () => {
  const input: OptimizerInput = {
    students: [
      student("s1", "Frontend", "ม.4", ["React / Next.js"]),
      student("s2", "Backend", "ม.5", ["Python"]),
      student("s3", "AI / ML", "ม.6", ["Docker"]),
      student("s4", "Frontend", "ม.3", ["TypeScript"]),
    ],
    teams: [{ id: "team-a", members: [] }],
    competition: targets({
      min_size: 2,
      max_size: 4,
      recommended_roles: ["Frontend", "Backend", "AI / ML"],
      tech_stack_hints: ["React / Next.js", "Python", "Docker"],
    }),
  };

  assert.deepEqual(optimizeTeams(input), optimizeTeams(input));
});
