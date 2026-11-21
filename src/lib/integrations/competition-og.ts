import type { PoolClient } from "pg";

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
