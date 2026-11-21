import { z } from "zod";
import { withUserDb } from "@/lib/db/pool";

export const BADGE_CATEGORIES = [
  "academic",
  "collaboration",
  "milestone",
] as const;

export const BADGE_ICON_NAMES = [
  "Award",
  "Users",
  "Target",
  "CheckCircle2",
  "GraduationCap",
  "Trophy",
  "FolderCheck",
] as const;

export const BADGE_TIERS = ["bronze", "silver", "gold"] as const;

export const BADGE_CRITERION_KEYS = [
  "interest_count",
  "confirmed_team_count",
  "completed_task_count",
  "verified_award_count",
  "champion_award_count",
  "verified_skill_count",
  "portfolio_link_count",
] as const;

export const BADGE_CRITERIA = [
  { code: "first_interest", criterion: "interest_count", threshold: 1 },
  { code: "interest_explorer", criterion: "interest_count", threshold: 5 },
  { code: "first_confirmed_team", criterion: "confirmed_team_count", threshold: 1 },
  { code: "team_collaborator", criterion: "confirmed_team_count", threshold: 3 },
  { code: "task_five", criterion: "completed_task_count", threshold: 5 },
  { code: "task_ten", criterion: "completed_task_count", threshold: 10 },
  { code: "verified_award", criterion: "verified_award_count", threshold: 1 },
  { code: "champion_award", criterion: "champion_award_count", threshold: 1 },
  { code: "skill_evidence_three", criterion: "verified_skill_count", threshold: 3 },
  { code: "portfolio_ready", criterion: "portfolio_link_count", threshold: 1 },
] as const satisfies readonly {
  code: string;
  criterion: string;
  threshold: number;
}[];

export type BadgeCategory = (typeof BADGE_CATEGORIES)[number];
export type BadgeIconName = (typeof BADGE_ICON_NAMES)[number];
export type BadgeTier = (typeof BADGE_TIERS)[number];
export type BadgeCriterion = (typeof BADGE_CRITERION_KEYS)[number];

export interface BadgeDefinition {
  code: string;
  nameTh: string;
  descriptionTh: string;
  category: BadgeCategory;
  iconName: BadgeIconName;
  tier: BadgeTier;
  criterion: BadgeCriterion;
  threshold: number;
  sortOrder: number;
  isActive: boolean;
}

export interface UserBadge extends BadgeDefinition {
  awardedAt: string;
  evidenceCount: number;
}

export interface VerifiedSkillEvidence {
  skill: string;
  evidenceCount: number;
  roleLabels: string[];
}

export interface BadgeEvaluationInput {
  interestCount: number;
  confirmedTeamCount: number;
  completedTaskCount: number;
  verifiedAwardCount: number;
  championAwardCount: number;
  verifiedSkillCount: number;
  portfolioLinkCount: number;
}

export interface BadgeAwardSuggestion {
  code: string;
  evidenceCount: number;
}

const badgeDefinitionRowSchema = z.object({
  code: z.string().min(1),
  name_th: z.string().min(1),
  description_th: z.string().min(1),
  category: z.enum(BADGE_CATEGORIES),
  icon_name: z.enum(BADGE_ICON_NAMES),
  tier: z.enum(BADGE_TIERS),
  criterion: z.enum(BADGE_CRITERION_KEYS),
  threshold: z.coerce.number().int().positive(),
  sort_order: z.coerce.number().int(),
  is_active: z.boolean(),
});

const awardedBadgeRowSchema = badgeDefinitionRowSchema.extend({
  awarded_at: z.string().min(1),
  evidence_count: z.coerce.number().int().nonnegative(),
});

const verifiedSkillEvidenceRowSchema = z.object({
  skill: z.string().min(1),
  evidence_count: z.coerce.number().int().nonnegative(),
  role_labels: z.array(z.string()),
});

const uuidSchema = z.string().uuid();

function toBadgeDefinition(row: z.infer<typeof badgeDefinitionRowSchema>): BadgeDefinition {
  return {
    code: row.code,
    nameTh: row.name_th,
    descriptionTh: row.description_th,
    category: row.category,
    iconName: row.icon_name,
    tier: row.tier,
    criterion: row.criterion,
    threshold: row.threshold,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function toAwardedBadge(row: z.infer<typeof awardedBadgeRowSchema>): UserBadge {
  return {
    ...toBadgeDefinition(row),
    awardedAt: row.awarded_at,
    evidenceCount: row.evidence_count,
  };
}

/** Normalizes a team role or tech hint into one comparable evidence skill. */
export function normalizeEvidenceSkill(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/** Matches teacher-verified first-place variants in Thai or English. */
export function isChampionRankTier(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return false;
  return [
    "1",
    "1st",
    "first",
    "first place",
    "winner",
    "champion",
    "gold",
    "ชนะเลิศ",
    "รางวัลที่ 1",
  ].includes(value) || value.includes("ชนะเลิศ");
}

/**
 * Pure mirror of the SQL badge evaluator. Used by unit tests and by API
 * responses that need to explain which milestones are still locked.
 */
export function evaluateBadgeAwards(
  input: BadgeEvaluationInput,
): BadgeAwardSuggestion[] {
  const counts: Record<BadgeCriterion, number> = {
    interest_count: input.interestCount,
    confirmed_team_count: input.confirmedTeamCount,
    completed_task_count: input.completedTaskCount,
    verified_award_count: input.verifiedAwardCount,
    champion_award_count: input.championAwardCount,
    verified_skill_count: input.verifiedSkillCount,
    portfolio_link_count: input.portfolioLinkCount,
  };

  return BADGE_CRITERIA.filter(
    (item) => counts[item.criterion] >= item.threshold,
  ).map((item) => ({
    code: item.code,
    evidenceCount: counts[item.criterion],
  }));
}

export async function listBadgeDefinitions(): Promise<BadgeDefinition[]> {
  return withUserDb(null, async (client) => {
    const result = await client.query(
      `SELECT code, name_th, description_th, category, icon_name, tier,
              criterion, threshold, sort_order, is_active
       FROM public.badge_definitions
       WHERE is_active
       ORDER BY sort_order, code`,
    );
    return badgeDefinitionRowSchema
      .array()
      .parse(result.rows)
      .map(toBadgeDefinition);
  });
}

export async function listMyBadges(userId: string): Promise<UserBadge[]> {
  const parsedUserId = uuidSchema.parse(userId);
  return withUserDb(parsedUserId, async (client) => {
    const result = await client.query(
      `SELECT b.code, b.name_th, b.description_th, b.category, b.icon_name,
              b.tier, b.criterion, b.threshold, b.sort_order, b.is_active,
              ub.awarded_at::text, ub.evidence_count
       FROM public.user_badges ub
       JOIN public.badge_definitions b ON b.code = ub.badge_code
       WHERE ub.user_id = $1 AND b.is_active
       ORDER BY b.sort_order, b.code`,
      [parsedUserId],
    );
    return awardedBadgeRowSchema.array().parse(result.rows).map(toAwardedBadge);
  });
}

export async function listVisibleUserBadges(input: {
  viewerId: string;
  profileId: string;
}): Promise<UserBadge[]> {
  const viewerId = uuidSchema.parse(input.viewerId);
  const profileId = uuidSchema.safeParse(input.profileId);
  if (!profileId.success) return [];

  return withUserDb(viewerId, async (client) => {
    const result = await client.query(
      `SELECT b.code, b.name_th, b.description_th, b.category, b.icon_name,
              b.tier, b.criterion, b.threshold, b.sort_order, b.is_active,
              ub.awarded_at::text, ub.evidence_count
       FROM public.user_badges ub
       JOIN public.badge_definitions b ON b.code = ub.badge_code
       WHERE ub.user_id = $1::uuid AND b.is_active
       ORDER BY b.sort_order, b.code`,
      [profileId.data],
    );
    return awardedBadgeRowSchema.array().parse(result.rows).map(toAwardedBadge);
  });
}

export async function listVisibleBadgesForProfiles(input: {
  viewerId: string;
  profileIds: string[];
}): Promise<Record<string, UserBadge[]>> {
  const viewerId = uuidSchema.parse(input.viewerId);
  const profileIds = z
    .array(uuidSchema)
    .max(100)
    .parse(Array.from(new Set(input.profileIds)));
  if (profileIds.length === 0) return {};

  return withUserDb(viewerId, async (client) => {
    const result = await client.query(
      `SELECT ub.user_id, b.code, b.name_th, b.description_th, b.category,
              b.icon_name, b.tier, b.criterion, b.threshold, b.sort_order,
              b.is_active, ub.awarded_at::text, ub.evidence_count
       FROM public.user_badges ub
       JOIN public.badge_definitions b ON b.code = ub.badge_code
       WHERE ub.user_id = ANY($1::uuid[]) AND b.is_active
       ORDER BY ub.user_id, b.sort_order, b.code`,
      [profileIds],
    );

    const rowSchema = awardedBadgeRowSchema.extend({ user_id: uuidSchema });
    const grouped: Record<string, UserBadge[]> = {};
    for (const row of rowSchema.array().parse(result.rows)) {
      const { user_id: userId, ...awardRow } = row;
      grouped[userId] ??= [];
      grouped[userId]?.push(toAwardedBadge(awardRow));
    }
    return grouped;
  });
}

export async function getVerifiedSkillEvidence(input: {
  viewerId: string;
  userId: string;
}): Promise<VerifiedSkillEvidence[]> {
  const viewerId = uuidSchema.parse(input.viewerId);
  const userId = uuidSchema.safeParse(input.userId);
  if (!userId.success) return [];

  return withUserDb(viewerId, async (client) => {
    const result = await client.query(
      `SELECT skill, evidence_count, role_labels
       FROM public.get_verified_skill_evidence($1::uuid)`,
      [userId.data],
    );
    return verifiedSkillEvidenceRowSchema
      .array()
      .parse(result.rows)
      .map((row) => ({
        skill: row.skill,
        evidenceCount: row.evidence_count,
        roleLabels: row.role_labels,
      }));
  });
}

export async function getBadgeShowcase(input: {
  viewerId: string;
  userId: string;
}): Promise<{ badges: UserBadge[]; skills: VerifiedSkillEvidence[] }> {
  const [badges, skills] = await Promise.all([
    listVisibleUserBadges({
      viewerId: input.viewerId,
      profileId: input.userId,
    }),
    getVerifiedSkillEvidence(input),
  ]);
  return { badges, skills };
}
