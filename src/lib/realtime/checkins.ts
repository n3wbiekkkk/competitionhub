import { z } from "zod";
import { withUserDb } from "@/lib/db/pool";
import { riskLevelSchema, type TeamCheckinItem } from "./types";

const checkinRowSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  author_id: z.string().uuid(),
  author_name: z.string(),
  nickname: z.string().nullable(),
  week_start: z.string(),
  progress: z.string(),
  blockers: z.string().nullable(),
  next_steps: z.string(),
  risk_level: riskLevelSchema,
  mentor_note: z.string().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewer_name: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export function toTeamCheckinItem(row: unknown): TeamCheckinItem | null {
  const parsed = checkinRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const value = parsed.data;
  return {
    id: value.id,
    teamId: value.team_id,
    authorId: value.author_id,
    authorName: value.author_name,
    nickname: value.nickname,
    weekStart: value.week_start.slice(0, 10),
    progress: value.progress,
    blockers: value.blockers,
    nextSteps: value.next_steps,
    riskLevel: value.risk_level,
    mentorNote: value.mentor_note,
    reviewedBy: value.reviewed_by,
    reviewerName: value.reviewer_name,
    reviewedAt: value.reviewed_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

export const CHECKIN_SELECT = `select c.id, c.team_id, c.author_id,
       p.full_name as author_name, p.nickname, c.week_start::text,
       c.progress, c.blockers, c.next_steps, c.risk_level,
       c.mentor_note, c.reviewed_by, reviewer.full_name as reviewer_name,
       c.reviewed_at::text, c.created_at::text, c.updated_at::text
from public.team_checkins c
join public.profiles p on p.id = c.author_id
left join public.profiles reviewer on reviewer.id = c.reviewed_by`;

export async function loadTeamCheckin(
  userId: string,
  checkinId: string,
): Promise<TeamCheckinItem | null> {
  return withUserDb(userId, async (client) => {
    const result = await client.query(`${CHECKIN_SELECT} where c.id = $1 limit 1`, [checkinId]);
    return result.rows[0] ? toTeamCheckinItem(result.rows[0]) : null;
  });
}
