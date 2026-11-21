import { z } from "zod";
import { withUserDb } from "@/lib/db/pool";
import type { MentionableMember } from "./types";

const uuidSchema = z.string().uuid();

export interface AccessibleTeam {
  id: string;
  name: string;
  advisor_id: string | null;
  competition_title: string;
}

interface MemberRow {
  id: string;
  full_name: string;
  nickname: string | null;
}

/** Explicit RBAC check; RLS is still active on every query below. */
export async function getAccessibleTeam(
  userId: string,
  teamId: string,
): Promise<AccessibleTeam | null> {
  if (!uuidSchema.safeParse(teamId).success) return null;
  return withUserDb(userId, async (client) => {
    const result = await client.query<AccessibleTeam>(
      `select t.id, t.name, t.advisor_id, c.title as competition_title
       from public.teams t
       join public.competitions c on c.id = t.competition_id
       where t.id = $1
         and t.status = 'confirmed'
         and (
           public.is_teacher()
           or t.advisor_id = $2
           or exists (
             select 1 from public.team_members tm
             where tm.team_id = t.id and tm.user_id = $2
           )
         )
       limit 1`,
      [teamId, userId],
    );
    return result.rows[0] ?? null;
  });
}

export async function getTeamMentionables(
  userId: string,
  teamId: string,
): Promise<MentionableMember[]> {
  return withUserDb(userId, async (client) => {
    const result = await client.query<MemberRow>(
      `select p.id, p.full_name, p.nickname
       from public.team_members tm
       join public.profiles p on p.id = tm.user_id
       where tm.team_id = $1
       union
       select p.id, p.full_name, p.nickname
       from public.teams t
       join public.profiles p on p.id = t.advisor_id
       where t.id = $1
       order by full_name asc`,
      [teamId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      nickname: row.nickname,
    }));
  });
}
