import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { getAccessibleTeam } from "@/lib/realtime/access";
import { loadTeamCheckin } from "@/lib/realtime/checkins";
import { riskLevelSchema } from "@/lib/realtime/types";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const patchSchema = z
  .object({
    progress: z.string().trim().min(1).max(2000).optional(),
    blockers: z.string().trim().max(2000).nullable().optional(),
    nextSteps: z.string().trim().min(1).max(2000).optional(),
    riskLevel: riskLevelSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "ไม่มีข้อมูลที่ต้องการอัปเดต");

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; checkinId: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id, checkinId } = await context.params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(checkinId).success) {
    return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  }
  if (!(await getAccessibleTeam(auth.user.id, id))) {
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์แก้ไขข้อมูลของทีมนี้" }, { status: 403 });
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
    const blockersProvided = parsed.data.blockers !== undefined;
    const result = await client.query<{ id: string }>(
      `update public.team_checkins
       set progress = coalesce($3, progress),
           blockers = case when $4::boolean then $5 else blockers end,
           next_steps = coalesce($6, next_steps),
           risk_level = coalesce($7::text, risk_level),
           updated_at = now()
       where id = $1 and team_id = $2
         and (author_id = $8 or public.is_teacher())
       returning id`,
      [
        checkinId,
        id,
        parsed.data.progress ?? null,
        blockersProvided,
        parsed.data.blockers ?? null,
        parsed.data.nextSteps ?? null,
        parsed.data.riskLevel ?? null,
        auth.user.id,
      ],
    );
    return result.rows[0] ?? null;
  });

  if (!updated) {
    return NextResponse.json({ error: "ไม่พบรายงานหรือคุณไม่มีสิทธิ์แก้ไข" }, { status: 404 });
  }
  const checkin = await loadTeamCheckin(auth.user.id, checkinId);
  return NextResponse.json({ checkin });
}
