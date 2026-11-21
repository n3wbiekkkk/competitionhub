import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { loadTeamCheckin, toTeamCheckinItem } from "@/lib/realtime/checkins";
import { createCollabNotifications } from "@/lib/realtime/notifications";
import type { MentorCheckinItem } from "@/lib/realtime/types";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const patchSchema = z.object({
  checkinId: uuidSchema,
  mentorNote: z.string().trim().max(2000).nullable(),
  reviewed: z.boolean().default(true),
});

export async function GET(request: Request) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rawRisk = new URL(request.url).searchParams.get("risk");
  const risk = rawRisk === "blocked" || rawRisk === "all" ? rawRisk : "at_risk";
  const levels = risk === "all" ? ["at_risk", "blocked"] : [risk];

  const checkins = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `select c.id, c.team_id, c.author_id,
              p.full_name as author_name, p.nickname, c.week_start::text,
              c.progress, c.blockers, c.next_steps, c.risk_level,
              c.mentor_note, c.reviewed_by, reviewer.full_name as reviewer_name,
              c.reviewed_at::text, c.created_at::text, c.updated_at::text,
              t.name as team_name, comp.title as competition_title
       from public.team_checkins c
       join public.profiles p on p.id = c.author_id
       join public.teams t on t.id = c.team_id
       join public.competitions comp on comp.id = t.competition_id
       left join public.profiles reviewer on reviewer.id = c.reviewed_by
       where c.risk_level = any($1::text[]) and t.status = 'confirmed'
       order by case c.risk_level when 'blocked' then 0 else 1 end, c.updated_at desc
       limit 50`,
      [levels],
    );

    const items: MentorCheckinItem[] = [];
    for (const row of result.rows) {
      const base = toTeamCheckinItem(row);
      if (!base) continue;
      items.push({
        ...base,
        teamName: typeof row.team_name === "string" ? row.team_name : "ไม่ระบุทีม",
        competitionTitle:
          typeof row.competition_title === "string" ? row.competition_title : "ไม่ระบุการแข่งขัน",
      });
    }
    return items;
  });

  return NextResponse.json({ checkins });
}

export async function PATCH(request: Request) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const updated = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query<{ id: string; author_id: string; team_id: string }>(
      `update public.team_checkins
       set mentor_note = $2,
           reviewed_by = case when $3::boolean then $4::uuid else null end,
           reviewed_at = case when $3::boolean then now() else null end,
           updated_at = now()
       where id = $1
       returning id, author_id, team_id`,
      [
        parsed.data.checkinId,
        parsed.data.mentorNote,
        parsed.data.reviewed,
        auth.user.id,
      ],
    );
    return result.rows[0] ?? null;
  });

  if (!updated) {
    return NextResponse.json({ error: "ไม่พบรายงานที่ต้องการตรวจสอบ" }, { status: 404 });
  }

  const checkin = await loadTeamCheckin(auth.user.id, updated.id);
  if (checkin) {
    await createCollabNotifications([
      {
        userId: updated.author_id,
        kind: "mentor_feedback",
        title: "อาจารย์ที่ปรึกษาตอบกลับรายงานประจำสัปดาห์",
        body: parsed.data.mentorNote ?? "อัปเดตสถานะการติดตามทีมแล้ว",
        href: `/my-teams#team-${updated.team_id}`,
        dedupeKey: `team_checkin_mentor:${updated.id}:${Date.now()}`,
      },
    ]);
  }

  return NextResponse.json({ checkin });
}
