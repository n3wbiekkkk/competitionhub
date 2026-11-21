import { NextResponse } from "next/server";
import { z } from "zod";
import {
  findLatestPlan,
  loadPrepTeamContext,
  parseStoredRoadmapPlan,
} from "@/lib/ai/prep-studio";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withSystemDb, withUserDb } from "@/lib/db/pool";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    weeks: z.array(z.number().int().min(1).max(8)).min(1).max(8).optional(),
  })
  .strict();

function parseTeamId(value: string): string | null {
  const parsed = z.string().uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const teamId = parseTeamId(id);
  if (!teamId) {
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }

  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const prepared = await withUserDb(auth.user.id, async (client) => {
      const context = await loadPrepTeamContext(client, teamId);
      if (!context) return null;
      const latest = await findLatestPlan(client, {
        teamId,
        kind: "roadmap",
      });
      return latest ? parseStoredRoadmapPlan(latest.plan) : null;
    });

    if (!prepared) {
      return NextResponse.json(
        {
          error:
            "ไม่พบทีม ไม่มีสิทธิ์เข้าถึง หรือยังไม่มีแผนที่สร้างด้วย AI สำหรับทีมนี้",
        },
        { status: 404 },
      );
    }

    const requestedWeeks = parsedBody.data.weeks;
    const selectedWeeks = requestedWeeks
      ? prepared.weeks.filter((week) => requestedWeeks.includes(week.week))
      : prepared.weeks;
    if (selectedWeeks.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบสัปดาห์ที่ต้องการนำเข้าแผน" },
        { status: 400 },
      );
    }

    // team_tasks grants INSERT to teachers/system only. Re-bind the system
    // transaction to this caller and re-check membership inside the same
    // transaction before writing any imported milestone.
    const result = await withSystemDb(async (client) => {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [
        auth.user.id,
      ]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [teamId]);
      const access = await client.query(
        `SELECT 1 FROM public.teams t
         WHERE t.id = $1
           AND (public.is_teacher() OR public.is_confirmed_team_member(t.id))
         LIMIT 1`,
        [teamId],
      );
      if ((access.rowCount ?? 0) === 0) return null;

      let imported = 0;
      let skipped = 0;
      for (const week of selectedWeeks) {
        const title = `AI สัปดาห์ ${week.week}: ${week.milestoneTh}`;
        const existing = await client.query(
          `SELECT id FROM public.team_tasks
           WHERE team_id = $1
             AND title = $2
             AND due_date IS NOT DISTINCT FROM $3::date
           LIMIT 1`,
          [teamId, title, week.dueDate],
        );
        if ((existing.rowCount ?? 0) > 0) {
          skipped += 1;
          continue;
        }
        await client.query(
          `INSERT INTO public.team_tasks (team_id, title, due_date, status)
           VALUES ($1, $2, $3::date, 'todo')`,
          [teamId, title, week.dueDate],
        );
        imported += 1;
      }
      return { imported, skipped, total: selectedWeeks.length };
    });

    if (!result) {
      return NextResponse.json(
        { error: "คุณไม่มีสิทธิ์นำเข้าเป้าหมายเข้าทีมนี้" },
        { status: 403 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    logError("[api/teams/ai-roadmap/import] error", error);
    return NextResponse.json(
      { error: "นำเป้าหมายขึ้นงานของทีมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
