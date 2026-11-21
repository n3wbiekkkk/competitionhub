import type { PoolClient } from "pg";
import { TECH_CATEGORY_META, type TechCategory } from "@/lib/constants/tech-taxonomy";

export interface ShowcaseResultItem {
  id: string;
  competitionId: string;
  competitionTitle: string;
  category: string;
  teamId: string;
  teamName: string;
  awardTitle: string;
  rankTier: string | null;
  reflection: string | null;
  verifiedByName: string;
  createdAt: string;
}

interface ShowcaseRow {
  id: string;
  competition_id: string;
  competition_title: string;
  category: string;
  team_id: string;
  team_name: string;
  award_title: string;
  rank_tier: string | null;
  reflection: string | null;
  verified_by_name: string;
  created_at: string;
}

/**
 * Reads only the curated projection. The security definer function performs
 * the opt-in, verification, and competition-status filtering in PostgreSQL.
 */
export async function loadPublicShowcaseResults(
  client: PoolClient,
): Promise<ShowcaseResultItem[]> {
  const result = await client.query<ShowcaseRow>(
    `select id, competition_id, competition_title, category, team_id, team_name,
            award_title, rank_tier, reflection, verified_by_name, created_at::text
     from public.get_public_showcase_results()`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    competitionId: row.competition_id,
    competitionTitle: row.competition_title,
    category: row.category,
    teamId: row.team_id,
    teamName: row.team_name,
    awardTitle: row.award_title,
    rankTier: row.rank_tier,
    reflection: row.reflection,
    verifiedByName: row.verified_by_name,
    createdAt: row.created_at,
  }));
}

export interface CompetitionOgMeta {
  title: string;
  summary: string | null;
  category: string;
}

export async function loadCompetitionOgMeta(
  client: PoolClient,
  competitionId: string,
): Promise<CompetitionOgMeta | null> {
  const result = await client.query<CompetitionOgMeta>(
    `select title, summary, category
     from public.competitions
     where id = $1 and status in ('open', 'closed')
     limit 1`,
    [competitionId],
  );
  return result.rows[0] ?? null;
}

export function showcaseCategoryLabel(category: string): string {
  return TECH_CATEGORY_META[category as TechCategory]?.shortLabel ?? category;
}
