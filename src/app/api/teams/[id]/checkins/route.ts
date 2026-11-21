import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { getAccessibleTeam } from "@/lib/realtime/access";
import { CHECKIN_SELECT, loadTeamCheckin, toTeamCheckinItem } from "@/lib/realtime/checkins";
import { createCollabNotifications } from "@/lib/realtime/notifications";
import { riskLevelSchema } from "@/lib/realtime/types";
import { normalizeToIsoCeDate } from "@/lib/utils/thai-date";
import { getWeekStartIso } from "@/lib/realtime/week";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const checkinSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบสัปดาห์ไม่ถูกต้อง"),
  progress: z.string().trim().min(1, "กรุณาเล่าความคืบหน้า").max(2000),
  blockers: z.string().trim().max(2000).optional().nullable(),
  nextSteps: z.string().trim().min(1, "กรุณาระบุสิ่งที่จะทำต่อไป").max(2000),
  riskLevel: riskLevelSchema,
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }
  if (!(await getAccessibleTeam(auth.user.id, id))) {
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์ดูข้อมูลของทีมนี้" }, { status: 403 });
  }

  const checkins = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query(
      `${CHECKIN_SELECT} where c.team_id = $1 order by c.week_start desc limit 12`,
      [id],
    );
    return result.rows
      .map(toTeamCheckinItem)
      .filter((item): item is NonNullable<typeof item> => item !== null);
  });
  return NextResponse.json({ checkins });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }
  const team = await getAccessibleTeam(auth.user.id, id);
  if (!team) {
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์บันทึกข้อมูลของทีมนี้" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = checkinSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  const normalizedDate = normalizeToIsoCeDate(parsed.data.weekStart);
  if (!normalizedDate) {
    return NextResponse.json({ error: "วันที่สัปดาห์ไม่ถูกต้อง" }, { status: 400 });
  }
  const weekStart = getWeekStartIso(normalizedDate);

  const checkinId = await withUserDb(auth.user.id, async (client) => {
    const existing = await client.query<{ id: string; author_id: string }>(
      `select id, author_id from public.team_checkins where team_id = $1 and week_start = $2::date limit 1`,
      [id, weekStart],
    );
    const current = existing.rows[0];
    if (current && current.author_id !== auth.user.id && auth.user.role !== "teacher") {
      return { error: "checkin_owner" as const };
    }

    const result = await client.query<{ id: string }>(
      `insert into public.team_checkins
         (team_id, author_id, week_start, progress, blockers, next_steps, risk_level)
       values ($1, $2, $3::date, $4, $5, $6, $7)
       on conflict (team_id, week_start) do update
         set progress = excluded.progress,
             blockers = excluded.blockers,
             next_steps = excluded.next_steps,
             risk_level = excluded.risk_level,
             updated_at = now()
       returning id`,
      [
        id,
        auth.user.id,
        weekStart,
        parsed.data.progress,
        parsed.data.blockers ?? null,
        parsed.data.nextSteps,
        parsed.data.riskLevel,
      ],
    );
    const inserted = result.rows[0];
    return inserted ? { id: inserted.id } : { error: "write_failed" as const };
  });

  if ("error" in checkinId) {
    return NextResponse.json(
      {
        error:
          checkinId.error === "checkin_owner"
            ? "สัปดาห์นี้มีรายงานจากสมาชิกคนอื่นแล้ว"
            : "ไม่สามารถบันทึกข้อมูลได้",
      },
      { status: checkinId.error === "checkin_owner" ? 403 : 500 },
    );
  }

  const checkin = await loadTeamCheckin(auth.user.id, checkinId.id);
  if (!checkin) {
    return NextResponse.json({ error: "ไม่สามารถโหลดข้อมูลที่บันทึกได้" }, { status: 500 });
  }

  if (
    team.advisor_id &&
    team.advisor_id !== auth.user.id &&
    parsed.data.riskLevel !== "on_track"
  ) {
    await createCollabNotifications([
      {
        userId: team.advisor_id,
        kind: "team_checkin_risk",
        title: `ทีม ${team.name} รายงานสถานะ${parsed.data.riskLevel === "blocked" ? "ติดปัญหา" : "เสี่ยง"}`,
        body: parsed.data.blockers ?? parsed.data.nextSteps,
        href: "/teacher/review",
        dedupeKey: `team_checkin_risk:${checkin.id}`,
      },
    ]);
  }

  return NextResponse.json({ checkin }, { status: 201 });
}
