import { GRADE_LEVELS, parseClassroom } from "@/lib/constants/classroom";
import { TECH_ROLES, TECH_SKILLS } from "@/lib/constants/tech-taxonomy";
import type { TeamStatus } from "@/lib/constants/tech-taxonomy";

export interface OptimizerStudent {
  user_id: string;
  preferred_role: string | null;
  grade: string | null;
  skills: readonly string[];
}

export interface OptimizerMember {
  user_id: string;
  assigned_role: string;
  grade?: string | null;
  skills?: readonly string[];
}

export interface OptimizerTeam {
  id: string;
  status?: TeamStatus;
  members: readonly OptimizerMember[];
}

export interface CompetitionTargets {
  min_size: number;
  max_size: number;
  recommended_roles: readonly string[];
  tech_stack_hints: readonly string[];
}

export interface TeamObjectiveWeights {
  roleCoverage: number;
  techCoverage: number;
  skillDiversity: number;
  gradeBalance: number;
}

export const DEFAULT_TEAM_OBJECTIVE_WEIGHTS: TeamObjectiveWeights = {
  roleCoverage: 0.35,
  techCoverage: 0.25,
  skillDiversity: 0.25,
  gradeBalance: 0.15,
};

export interface TeamScore {
  roleCoverage: number;
  techCoverage: number;
  skillDiversity: number;
  gradeBalance: number;
  weighted: number;
}

export interface ScoreTeamInput {
  members: readonly OptimizerMember[];
  students?: readonly OptimizerStudent[];
  competition: CompetitionTargets;
  weights?: Partial<TeamObjectiveWeights>;
}

export interface OptimizerInput {
  students: readonly OptimizerStudent[];
  teams: readonly OptimizerTeam[];
  competition: CompetitionTargets;
  weights?: Partial<TeamObjectiveWeights>;
  lockedTeamIds?: readonly string[];
  lockedStudentIds?: readonly string[];
}

export interface OptimizedTeamMember {
  user_id: string;
  assigned_role: string;
}

export interface OptimizedTeam {
  id: string;
  status?: TeamStatus;
  members: OptimizedTeamMember[];
  score: TeamScore;
}

export interface OptimizerResult {
  teams: OptimizedTeam[];
  unassigned: string[];
  totalScore: number;
}

interface WorkingMember extends OptimizerMember {
  locked: boolean;
}

interface WorkingTeam {
  id: string;
  status?: TeamStatus;
  members: WorkingMember[];
  mutable: boolean;
}

interface MoveCandidate {
  from: WorkingTeam;
  to: WorkingTeam;
  index: number;
  role: string;
  score: number;
}

interface SwapCandidate {
  teamA: WorkingTeam;
  teamB: WorkingTeam;
  indexA: number;
  indexB: number;
  roleA: string;
  roleB: string;
  score: number;
}

const SCORE_EPSILON = 1e-9;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeGrade(value: string | null | undefined): string {
  const parsed = parseClassroom(value);
  return normalize(parsed.gradeLevel || parsed.customGrade);
}

function uniqueNormalized(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalize(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function positiveInteger(value: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

function resolveWeights(
  overrides: Partial<TeamObjectiveWeights> | undefined,
): TeamObjectiveWeights {
  const source = overrides ?? DEFAULT_TEAM_OBJECTIVE_WEIGHTS;
  const roleCoverage = weightValue(
    source.roleCoverage,
    DEFAULT_TEAM_OBJECTIVE_WEIGHTS.roleCoverage,
  );
  const techCoverage = weightValue(
    source.techCoverage,
    DEFAULT_TEAM_OBJECTIVE_WEIGHTS.techCoverage,
  );
  const skillDiversity = weightValue(
    source.skillDiversity,
    DEFAULT_TEAM_OBJECTIVE_WEIGHTS.skillDiversity,
  );
  const gradeBalance = weightValue(
    source.gradeBalance,
    DEFAULT_TEAM_OBJECTIVE_WEIGHTS.gradeBalance,
  );
  const total = roleCoverage + techCoverage + skillDiversity + gradeBalance;

  if (total <= 0) {
    return DEFAULT_TEAM_OBJECTIVE_WEIGHTS;
  }

  return {
    roleCoverage: roleCoverage / total,
    techCoverage: techCoverage / total,
    skillDiversity: skillDiversity / total,
    gradeBalance: gradeBalance / total,
  };
}

function weightValue(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function sanitizeCompetition(
  competition: CompetitionTargets,
): CompetitionTargets {
  const minSize = positiveInteger(competition.min_size, 1);
  const maxSize = Math.max(
    positiveInteger(competition.max_size, minSize),
    minSize,
  );
  return {
    min_size: minSize,
    max_size: maxSize,
    recommended_roles: competition.recommended_roles ?? [],
    tech_stack_hints: competition.tech_stack_hints ?? [],
  };
}

function buildStudentMap(
  students: readonly OptimizerStudent[],
): Map<string, OptimizerStudent> {
  const byId = new Map<string, OptimizerStudent>();
  for (const student of students) {
    if (byId.has(student.user_id)) {
      throw new Error("รหัสนักเรียนซ้ำในรายชื่อผู้สนใจ");
    }
    byId.set(student.user_id, student);
  }
  return byId;
}

function studentForMember(
  member: OptimizerMember,
  byId: ReadonlyMap<string, OptimizerStudent>,
): OptimizerStudent {
  const profile = byId.get(member.user_id);
  if (profile) {
    return profile;
  }
  return {
    user_id: member.user_id,
    preferred_role: member.assigned_role,
    grade: member.grade ?? null,
    skills: member.skills ?? [],
  };
}

function scoreMembers(
  members: readonly OptimizerMember[],
  byId: ReadonlyMap<string, OptimizerStudent>,
  competition: CompetitionTargets,
  weights: TeamObjectiveWeights,
): TeamScore {
  if (members.length === 0) {
    return {
      roleCoverage: 0,
      techCoverage: 0,
      skillDiversity: 0,
      gradeBalance: 0,
      weighted: 0,
    };
  }

  const recommendedRoles = uniqueNormalized(competition.recommended_roles);
  const coveredRoles = new Set<string>();
  const allSkills = new Set<string>();
  const gradeCounts = new Map<string, number>();

  for (const member of members) {
    const role = normalize(member.assigned_role);
    if (role) {
      coveredRoles.add(role);
    }

    const profile = byId.get(member.user_id);
    const skills = member.skills ?? profile?.skills ?? [];
    for (const skill of skills) {
      const normalized = normalize(skill);
      if (normalized) {
        allSkills.add(normalized);
      }
    }

    const grade = normalizeGrade(member.grade ?? profile?.grade);
    if (grade) {
      gradeCounts.set(grade, (gradeCounts.get(grade) ?? 0) + 1);
    }
  }

  let roleCoverage: number;
  if (recommendedRoles.length > 0) {
    const coveredCount = recommendedRoles.filter((role) =>
      coveredRoles.has(role),
    ).length;
    roleCoverage = coveredCount / recommendedRoles.length;
  } else {
    const targetRoles = Math.min(
      Math.max(members.length, 1),
      Math.max(competition.max_size, 1),
      TECH_ROLES.length,
    );
    roleCoverage = coveredRoles.size / targetRoles;
  }

  const techHints = uniqueNormalized(competition.tech_stack_hints);
  const techCoverage =
    techHints.length === 0
      ? 1
      : techHints.filter((hint) => allSkills.has(hint)).length /
        techHints.length;

  const skillTarget = Math.min(
    Math.max(members.length * 2, 1),
    TECH_SKILLS.length,
  );
  const skillDiversity =
    allSkills.size === 0 ? 0 : clamp01(allSkills.size / skillTarget);

  const knownGrades = [...gradeCounts.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  let gradeBalance: number;
  if (knownGrades === 0) {
    gradeBalance = 1;
  } else {
    let entropy = 0;
    for (const count of gradeCounts.values()) {
      const probability = count / knownGrades;
      entropy -= probability * Math.log(probability);
    }
    const maxGroups = Math.min(knownGrades, GRADE_LEVELS.length);
    gradeBalance =
      maxGroups <= 1 ? 0 : clamp01(entropy / Math.log(maxGroups));
  }

  const weighted = clamp01(
    weights.roleCoverage * roleCoverage +
      weights.techCoverage * techCoverage +
      weights.skillDiversity * skillDiversity +
      weights.gradeBalance * gradeBalance,
  );

  return {
    roleCoverage: clamp01(roleCoverage),
    techCoverage: clamp01(techCoverage),
    skillDiversity: clamp01(skillDiversity),
    gradeBalance: clamp01(gradeBalance),
    weighted,
  };
}

function chooseRole(
  team: WorkingTeam,
  student: OptimizerStudent,
  competition: CompetitionTargets,
  fallbackRole: string,
): string {
  const covered = new Set<string>();
  for (const member of team.members) {
    const role = normalize(member.assigned_role);
    if (role) {
      covered.add(role);
    }
  }

  const preferred = (student.preferred_role ?? "").trim();
  const preferredKey = normalize(preferred);
  if (
    preferredKey &&
    competition.recommended_roles.some(
      (role) => normalize(role) === preferredKey,
    ) &&
    !covered.has(preferredKey)
  ) {
    return preferred;
  }

  const missingRole = competition.recommended_roles.find((role) => {
    const key = normalize(role);
    return key.length > 0 && !covered.has(key);
  });
  if (missingRole) {
    return missingRole.trim();
  }

  if (preferredKey) {
    return preferred;
  }

  return fallbackRole.trim().length > 0 ? fallbackRole : "Pitching & PM";
}

export function scoreTeam(input: ScoreTeamInput): TeamScore {
  const competition = sanitizeCompetition(input.competition);
  const weights = resolveWeights(input.weights);
  const byId = buildStudentMap(input.students ?? []);
  return scoreMembers(input.members, byId, competition, weights);
}

export function optimizeTeams(input: OptimizerInput): OptimizerResult {
  const competition = sanitizeCompetition(input.competition);
  const weights = resolveWeights(input.weights);
  const byId = buildStudentMap(input.students);
  const lockedTeams = new Set(input.lockedTeamIds ?? []);
  const lockedStudents = new Set(input.lockedStudentIds ?? []);
  const assignedIds = new Set<string>();

  const teams: WorkingTeam[] = [];
  for (const team of input.teams) {
    const mutable = team.status !== "confirmed" && !lockedTeams.has(team.id);
    const members: WorkingMember[] = [];
    for (const member of team.members) {
      if (assignedIds.has(member.user_id)) {
        throw new Error(`สมาชิกทีมซ้ำ: ${member.user_id}`);
      }
      assignedIds.add(member.user_id);
      members.push({
        user_id: member.user_id,
        assigned_role: member.assigned_role,
        grade: member.grade,
        skills: member.skills,
        locked: !mutable || lockedStudents.has(member.user_id),
      });
    }
    teams.push({
      id: team.id,
      status: team.status,
      members,
      mutable,
    });
  }

  const scoreOf = (team: WorkingTeam): TeamScore =>
    scoreMembers(team.members, byId, competition, weights);
  const mutableTeams = (): WorkingTeam[] => teams.filter((team) => team.mutable);
  const totalMutableScore = (): number =>
    mutableTeams().reduce((sum, team) => sum + scoreOf(team).weighted, 0);

  const availableStudents = input.students.filter(
    (student) =>
      !assignedIds.has(student.user_id) &&
      !lockedStudents.has(student.user_id),
  );

  for (const student of availableStudents) {
    const currentScore = totalMutableScore();
    let bestTeam: WorkingTeam | undefined;
    let bestRole = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const team of teams) {
      if (!team.mutable || team.members.length >= competition.max_size) {
        continue;
      }

      const role = chooseRole(team, student, competition, "");
      team.members.push({
        user_id: student.user_id,
        assigned_role: role,
        locked: false,
      });
      const candidateScore = totalMutableScore();
      team.members.pop();

      const better =
        bestTeam === undefined ||
        candidateScore > bestScore + SCORE_EPSILON ||
        (Math.abs(candidateScore - bestScore) <= SCORE_EPSILON &&
          team.id < bestTeam.id);
      if (better) {
        bestTeam = team;
        bestRole = role;
        bestScore = candidateScore;
      }
    }

    if (bestTeam && currentScore >= 0) {
      bestTeam.members.push({
        user_id: student.user_id,
        assigned_role: bestRole,
        locked: false,
      });
      assignedIds.add(student.user_id);
    }
  }

  let improved = true;
  let iterations = 0;
  while (improved && iterations < 16) {
    improved = false;
    iterations += 1;
    const currentScore = totalMutableScore();
    let bestMove: MoveCandidate | undefined;

    for (const from of mutableTeams()) {
      for (let index = 0; index < from.members.length; index += 1) {
        const member = from.members[index];
        if (member.locked) {
          continue;
        }
        if (from.members.length - 1 < competition.min_size) {
          continue;
        }

        for (const to of mutableTeams()) {
          if (to.id === from.id || to.members.length >= competition.max_size) {
            continue;
          }

          const student = studentForMember(member, byId);
          const role = chooseRole(to, student, competition, member.assigned_role);
          from.members.splice(index, 1);
          to.members.push({
            user_id: member.user_id,
            assigned_role: role,
            locked: false,
          });
          const candidateScore = totalMutableScore();
          to.members.pop();
          from.members.splice(index, 0, member);

          if (
            candidateScore > currentScore + SCORE_EPSILON &&
            (bestMove === undefined || candidateScore > bestMove.score)
          ) {
            bestMove = {
              from,
              to,
              index,
              role,
              score: candidateScore,
            };
          }
        }
      }
    }

    if (bestMove) {
      const member = bestMove.from.members[bestMove.index];
      bestMove.from.members.splice(bestMove.index, 1);
      if (member) {
        bestMove.to.members.push({
          user_id: member.user_id,
          assigned_role: bestMove.role,
          locked: false,
        });
      }
      improved = true;
      continue;
    }

    const mutable = mutableTeams();
    let bestSwap: SwapCandidate | undefined;
    for (let i = 0; i < mutable.length; i += 1) {
      const teamA = mutable[i];
      if (!teamA) {
        continue;
      }
      for (let j = i + 1; j < mutable.length; j += 1) {
        const teamB = mutable[j];
        if (!teamB) {
          continue;
        }

        for (let indexA = 0; indexA < teamA.members.length; indexA += 1) {
          const memberA = teamA.members[indexA];
          if (memberA.locked) {
            continue;
          }
          for (let indexB = 0; indexB < teamB.members.length; indexB += 1) {
            const memberB = teamB.members[indexB];
            if (memberB.locked) {
              continue;
            }

            const studentA = studentForMember(memberA, byId);
            const studentB = studentForMember(memberB, byId);
            const roleA = chooseRole(
              teamB,
              studentA,
              competition,
              memberB.assigned_role,
            );
            const roleB = chooseRole(
              teamA,
              studentB,
              competition,
              memberA.assigned_role,
            );

            teamA.members[indexA] = {
              ...memberA,
              assigned_role: roleB,
              locked: false,
            };
            teamB.members[indexB] = {
              ...memberB,
              assigned_role: roleA,
              locked: false,
            };
            const candidateScore = totalMutableScore();
            teamA.members[indexA] = memberA;
            teamB.members[indexB] = memberB;

            if (
              candidateScore > currentScore + SCORE_EPSILON &&
              (bestSwap === undefined || candidateScore > bestSwap.score)
            ) {
              bestSwap = {
                teamA,
                teamB,
                indexA,
                indexB,
                roleA,
                roleB,
                score: candidateScore,
              };
            }
          }
        }
      }
    }

    if (bestSwap) {
      bestSwap.teamA.members[bestSwap.indexA] = {
        ...bestSwap.teamA.members[bestSwap.indexA],
        assigned_role: bestSwap.roleB,
        locked: false,
      };
      bestSwap.teamB.members[bestSwap.indexB] = {
        ...bestSwap.teamB.members[bestSwap.indexB],
        assigned_role: bestSwap.roleA,
        locked: false,
      };
      improved = true;
    }
  }

  const optimizedTeams: OptimizedTeam[] = teams.map((team) => {
    const optimized: OptimizedTeam = {
      id: team.id,
      members: team.members.map((member) => ({
        user_id: member.user_id,
        assigned_role: member.assigned_role,
      })),
      score: scoreOf(team),
    };
    if (team.status !== undefined) {
      optimized.status = team.status;
    }
    return optimized;
  });

  return {
    teams: optimizedTeams,
    unassigned: input.students
      .filter((student) => !assignedIds.has(student.user_id))
      .map((student) => student.user_id),
    totalScore: optimizedTeams.reduce(
      (sum, team) => sum + team.score.weighted,
      0,
    ),
  };
}
