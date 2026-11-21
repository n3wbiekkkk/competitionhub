import { z } from "zod";
import { TECH_ROLES } from "@/lib/constants/tech-taxonomy";

export const teamFormationModeSchema = z.enum(["teacher", "student", "hybrid"]);
export type TeamFormationMode = z.infer<typeof teamFormationModeSchema>;

export const studentTeamStatusSchema = z.enum(["draft", "confirmed"]);
export const studentInvitationDirectionSchema = z.enum([
  "team_invite",
  "join_request",
]);
export const studentInvitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "revoked",
  "expired",
]);
export const studentOpenRoleStatusSchema = z.enum([
  "open",
  "paused",
  "closed",
]);

export const directoryCandidateSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string(),
  nickname: z.string().nullable(),
  grade: z.string().nullable(),
  skills: z.array(z.string()),
  preferred_role: z.string().nullable(),
});
export type DirectoryCandidate = z.infer<typeof directoryCandidateSchema>;

export const studentTeamMemberSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string(),
  nickname: z.string().nullable(),
  grade: z.string().nullable(),
  skills: z.array(z.string()),
  assigned_role: z.string(),
  is_owner: z.boolean(),
});
export type StudentTeamMember = z.infer<typeof studentTeamMemberSchema>;

export const studentTeamOpenRoleSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  role: z.string(),
  slots: z.number().int(),
  taken: z.number().int(),
  status: studentOpenRoleStatusSchema,
  note: z.string().nullable(),
});
export type StudentTeamOpenRole = z.infer<typeof studentTeamOpenRoleSchema>;

export const studentTeamInvitationSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  direction: studentInvitationDirectionSchema,
  sender_id: z.string().uuid(),
  recipient_id: z.string().uuid(),
  open_role_id: z.string().uuid().nullable(),
  role: z.string(),
  note: z.string().nullable(),
  status: studentInvitationStatusSchema,
  created_at: z.string(),
  responded_at: z.string().nullable(),
});
export type StudentTeamInvitation = z.infer<typeof studentTeamInvitationSchema>;

export const studentTeamSummarySchema = z.object({
  id: z.string().uuid(),
  competition_id: z.string().uuid(),
  name: z.string(),
  status: studentTeamStatusSchema,
  created_by: z.string().uuid().nullable(),
  teacher_approved: z.boolean(),
  recruitment_locked: z.boolean(),
  created_at: z.string(),
  members: z.array(studentTeamMemberSchema),
  open_roles: z.array(studentTeamOpenRoleSchema),
  invitations: z.array(studentTeamInvitationSchema),
});
export type StudentTeamSummary = z.infer<typeof studentTeamSummarySchema>;

export const rankedTeammateSchema = z.object({
  candidate: directoryCandidateSchema,
  score: z.number().int(),
  reasons: z.array(z.string()),
  matched_roles: z.array(z.string()),
  matched_tech_hints: z.array(z.string()),
});
export type RankedTeammate = z.infer<typeof rankedTeammateSchema>;

export const teammateRankingExplanationSchema = z.object({
  missing_roles: z.array(z.string()),
  missing_tech_hints: z.array(z.string()),
  open_roles: z.array(z.string()),
});
export type TeammateRankingExplanation = z.infer<
  typeof teammateRankingExplanationSchema
>;

export const studentTeamOpenRoleListingSchema =
  studentTeamOpenRoleSchema.extend({
    team_name: z.string(),
  });
export type StudentTeamOpenRoleListing = z.infer<
  typeof studentTeamOpenRoleListingSchema
>;

export const studentTeamsPayloadSchema = z.object({
  competition: z.object({
    id: z.string().uuid(),
    title: z.string(),
    deadline: z.string().nullable(),
    min_size: z.number().int(),
    max_size: z.number().int(),
    status: z.enum(["pending_review", "open", "closed", "rejected"]),
    team_formation_mode: teamFormationModeSchema,
    recommended_roles: z.array(z.string()),
    tech_stack_hints: z.array(z.string()),
  }),
  viewer: z.object({
    id: z.string().uuid(),
    role: z.enum(["student", "teacher"]),
    is_teacher: z.boolean(),
  }),
  eligible: z.boolean(),
  teams: z.array(studentTeamSummarySchema),
  open_roles: z.array(studentTeamOpenRoleListingSchema),
  suggestions: z.array(rankedTeammateSchema),
  ranking: teammateRankingExplanationSchema,
  directory_candidates: z.array(directoryCandidateSchema),
});
export type StudentTeamsPayload = z.infer<typeof studentTeamsPayloadSchema>;

export interface RankingCompetition {
  readonly recommended_roles: readonly string[];
  readonly tech_stack_hints: readonly string[];
}

export interface RankingMember {
  readonly user_id: string;
  readonly assigned_role: string;
  readonly skills: readonly string[];
}

export interface RankingOpenRole {
  readonly role: string;
  readonly remaining: number;
}

export interface RankingCandidate {
  readonly user_id: string;
  readonly full_name: string;
  readonly nickname?: string | null;
  readonly grade?: string | null;
  readonly preferred_role?: string | null;
  readonly skills: readonly string[];
}

export interface RankTeammatesInput {
  readonly competition: RankingCompetition;
  readonly members: readonly RankingMember[];
  readonly candidates: readonly RankingCandidate[];
  readonly open_roles?: readonly RankingOpenRole[];
  readonly exclude_user_ids?: readonly string[];
  readonly limit?: number;
}

export interface TeammateRankingResult {
  readonly explanation: TeammateRankingExplanation;
  readonly ranked: readonly RankedTeammate[];
}

const CANONICAL_ROLE_KEYS: ReadonlySet<string> = new Set(
  TECH_ROLES.map((role) => compactKey(role)),
);

const ROLE_LABELS_BY_KEY: ReadonlyMap<string, string> = new Map(
  TECH_ROLES.map((role) => [compactKey(role), role]),
);

const ROLE_ALIASES: Readonly<Record<string, string>> = {
  front: "frontend",
  frontenddev: "frontend",
  frontenddeveloper: "frontend",
  back: "backend",
  backenddev: "backend",
  backenddeveloper: "backend",
  fullstackdev: "fullstack",
  mobile: "mobiledev",
  mobiledeveloper: "mobiledev",
  app: "mobiledev",
  ai: "aiml",
  ml: "aiml",
  artificialintelligence: "aiml",
  machinelearning: "aiml",
  deeplearning: "aiml",
  data: "datascience",
  datascientist: "datascience",
  cyber: "cybersecurity",
  ctf: "cybersecurity",
  security: "cybersecurity",
  cybersecurityctf: "cybersecurity",
  embedded: "embeddediot",
  iot: "embeddediot",
  robot: "robotics",
  roboticsengineer: "robotics",
  game: "gamedev",
  gamedeveloper: "gamedev",
  ui: "uidesign",
  ux: "uidesign",
  uxui: "uidesign",
  uidesigner: "uidesign",
  algorithm: "algorithmcp",
  cp: "algorithmcp",
  competitiveprogramming: "algorithmcp",
  pitch: "pitchingpm",
  pm: "pitchingpm",
  productmanager: "pitchingpm",
};

const TECH_ALIASES: Readonly<Record<string, string>> = {
  react: "react",
  reactjs: "react",
  next: "react",
  nextjs: "react",
  reactnextjs: "react",
  node: "node",
  nodejs: "node",
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  cplusplus: "cpp",
  "c++": "cpp",
  cpp: "cpp",
  pytorch: "ml",
  torch: "ml",
  tensorflow: "ml",
  ai: "ml",
  ml: "ml",
  deeplearning: "ml",
  datascience: "data",
  mysql: "sql",
  postgres: "sql",
  postgresql: "sql",
  sqlite: "sql",
  linux: "network",
  networking: "network",
  linuxnetworking: "network",
  arduino: "embedded",
  esp32: "embedded",
  arduinoesp32: "embedded",
  unity: "game",
  godot: "game",
  unitygodot: "game",
  uxdesign: "uidesign",
  uidesign: "uidesign",
  figma: "figma",
  git: "git",
  github: "git",
  docker: "docker",
  flutter: "flutter",
  dart: "flutter",
};

const SKILL_ROLE_HINTS: Readonly<Record<string, readonly string[]>> = {
  react: ["frontend", "fullstack"],
  javascript: ["frontend", "backend", "fullstack"],
  typescript: ["frontend", "backend", "fullstack"],
  node: ["backend", "fullstack"],
  python: ["aiml", "datascience"],
  ml: ["aiml"],
  data: ["datascience"],
  sql: ["backend", "datascience"],
  cpp: ["algorithmcp", "embeddediot"],
  embedded: ["embeddediot", "robotics"],
  ros: ["robotics"],
  game: ["gamedev"],
  figma: ["uidesign"],
  flutter: ["mobiledev"],
};

function compactKey(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "");
}

function roleKey(raw: string | null | undefined): string {
  const key = compactKey(raw);
  if (!key) return "";
  const alias = ROLE_ALIASES[key] ?? key;
  return CANONICAL_ROLE_KEYS.has(alias) ? alias : key;
}

function roleLabel(key: string): string {
  return ROLE_LABELS_BY_KEY.get(key) ?? key;
}

function techKeys(raw: string | null | undefined): string[] {
  const key = compactKey(raw);
  if (!key) return [];
  return [TECH_ALIASES[key] ?? key];
}

function uniqueByKey(
  values: readonly string[],
  keyOf: (value: string) => string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = keyOf(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function candidateRoleKeys(candidate: RankingCandidate): Set<string> {
  const keys = new Set<string>();
  const preferred = roleKey(candidate.preferred_role);
  if (preferred) keys.add(preferred);

  for (const skill of candidate.skills) {
    for (const tech of techKeys(skill)) {
      for (const inferred of SKILL_ROLE_HINTS[tech] ?? []) {
        keys.add(inferred);
      }
    }
  }
  return keys;
}

export interface TeamNeeds {
  readonly missing_roles: string[];
  readonly missing_tech_hints: string[];
  readonly open_roles: string[];
  readonly missing_role_keys: string[];
  readonly missing_hint_keys: string[];
  readonly open_role_keys: string[];
}

export function deriveTeamNeeds(
  input: Omit<RankTeammatesInput, "candidates" | "exclude_user_ids" | "limit">,
): TeamNeeds {
  const coveredRoleKeys = new Set(
    input.members.map((member) => roleKey(member.assigned_role)).filter(Boolean),
  );
  const coveredHintKeys = new Set(
    input.members.flatMap((member) =>
      member.skills.flatMap((skill) => techKeys(skill)),
    ),
  );

  const missingRoles = uniqueByKey(
    input.competition.recommended_roles.filter(
      (role) => !coveredRoleKeys.has(roleKey(role)),
    ),
    roleKey,
  );
  const missingHints = uniqueByKey(
    input.competition.tech_stack_hints.filter(
      (hint) => !techKeys(hint).some((key) => coveredHintKeys.has(key)),
    ),
    (hint) => techKeys(hint)[0] ?? compactKey(hint),
  );
  const openRoles = uniqueByKey(
    (input.open_roles ?? [])
      .filter((role) => role.remaining > 0)
      .map((role) => role.role),
    roleKey,
  );

  return {
    missing_roles: missingRoles,
    missing_tech_hints: missingHints,
    open_roles: openRoles,
    missing_role_keys: missingRoles.map(roleKey),
    missing_hint_keys: missingHints.map((hint) => techKeys(hint)[0] ?? compactKey(hint)),
    open_role_keys: openRoles.map(roleKey),
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Deterministic, explainable teammate ranking. No AI call is made here, so
 * there is no external quota to rate-limit.
 */
export function rankTeammates(input: RankTeammatesInput): TeammateRankingResult {
  const needs = deriveTeamNeeds(input);
  const excluded = new Set(input.exclude_user_ids ?? []);
  const limit =
    Number.isInteger(input.limit) && (input.limit ?? 0) > 0
      ? Math.min(input.limit ?? 8, 50)
      : 8;

  const ranked: RankedTeammate[] = [];
  for (const candidate of input.candidates) {
    if (excluded.has(candidate.user_id)) continue;

    const candidateRoles = candidateRoleKeys(candidate);
    const candidateSkills = new Set(
      candidate.skills.flatMap((skill) => techKeys(skill)),
    );

    const matchedRoleKeys = needs.missing_role_keys.filter((key) =>
      candidateRoles.has(key),
    );
    const matchedOpenRoleKeys = needs.open_role_keys.filter((key) =>
      candidateRoles.has(key),
    );
    const matchedHintLabels = needs.missing_tech_hints.filter((hint) =>
      techKeys(hint).some((key) => candidateSkills.has(key)),
    );

    const roleScore = matchedRoleKeys.length > 0 ? 45 : 0;
    const techScore = Math.min(35, matchedHintLabels.length * 14);
    const openScore = Math.min(20, matchedOpenRoleKeys.length * 10);
    const score = clampScore(roleScore + techScore + openScore);
    if (score <= 0) continue;

    const matchedRoles = [...new Set([...matchedRoleKeys, ...matchedOpenRoleKeys])]
      .map(roleLabel)
      .filter((label) => label.length > 0);
    const reasons: string[] = [];
    if (matchedRoleKeys.length > 0) {
      reasons.push(
        `ช่วยเติมบทบาทที่ทีมยังขาด: ${matchedRoleKeys.map(roleLabel).join(", ")}`,
      );
    }
    if (matchedHintLabels.length > 0) {
      reasons.push(
        `มีทักษะตรงกับเทคโนโลยีที่รายการต้องการ: ${matchedHintLabels.join(", ")}`,
      );
    }
    if (matchedOpenRoleKeys.length > 0) {
      reasons.push(
        `ตรงกับตำแหน่งที่ทีมเปิดรับ: ${matchedOpenRoleKeys.map(roleLabel).join(", ")}`,
      );
    }

    ranked.push({
      candidate: {
        user_id: candidate.user_id,
        full_name: candidate.full_name,
        nickname: candidate.nickname ?? null,
        grade: candidate.grade ?? null,
        skills: [...candidate.skills],
        preferred_role: candidate.preferred_role ?? null,
      },
      score,
      reasons,
      matched_roles: matchedRoles,
      matched_tech_hints: matchedHintLabels,
    });
  }

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.candidate.full_name.localeCompare(b.candidate.full_name, "th") ||
      a.candidate.user_id.localeCompare(b.candidate.user_id),
  );

  return {
    explanation: {
      missing_roles: needs.missing_roles,
      missing_tech_hints: needs.missing_tech_hints,
      open_roles: needs.open_roles,
    },
    ranked: ranked.slice(0, limit),
  };
}
