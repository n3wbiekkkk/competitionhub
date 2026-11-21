import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deliverableInputSchema,
  loadPrepTeamContext,
} from "@/lib/ai/prep-studio";
import {
  calculateSubmissionReadiness,
  type TeamDeliverable,
} from "@/components/prep-studio/shared";
import { requireAuthUser } from "@/lib/auth/cookies";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { withUserDb } from "@/lib/db/pool";
import { validatePublicHttpUrl } from "@/lib/utils/url-safety";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

function parseTeamId(value: string): string | null {
  const parsed = z.string().uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function GET(
  _request: Request,
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

  try {
    const payload = await withUserDb(auth.user.id, async (client) => {
      const context = await loadPrepTeamContext(client, teamId);
      if (!context) return null;
      return {
        teamId: context.teamId,
        competition: {
          title: context.competitionTitle,
          deadline: context.deadline,
        },
        tasks: context.tasks,
        deliverables: context.deliverables,
        readiness: calculateSubmissionReadiness({
          tasks: context.tasks,
          deliverables: context.deliverables,
          deadline: context.deadline,
          todayIso: context.todayIso,
        }),
      };
    });

    if (!payload) {
      return NextResponse.json(
        { error: "ไม่พบทีมหรือคุณไม่มีสิทธิ์เข้าถึงทีมนี้" },
        { status: 404 },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    logError("[api/teams/deliverables] GET error", error);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดผลงานของทีมได้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
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

  const rate = await consumeRateLimit(
    `prep:deliverable:${auth.user.id}`,
    60,
    3_600_000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "เพิ่มลิงก์ผลงานมากเกินไป กรุณารอสักครู่แล้วลองใหม่",
        retryAfterSeconds: rate.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const parsedBody = deliverableInputSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  const normalizedUrl = validatePublicHttpUrl(parsedBody.data.url).toString();

  try {
    const accessible = await withUserDb(auth.user.id, async (client) => {
      return (await loadPrepTeamContext(client, teamId)) !== null;
    });
    if (!accessible) {
      return NextResponse.json(
        { error: "ไม่พบทีมหรือคุณไม่มีสิทธิ์เพิ่มลิงก์ในทีมนี้" },
        { status: 404 },
      );
    }

    const created = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<TeamDeliverable>(
        `INSERT INTO public.team_deliverables
           (team_id, title, kind, url, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, team_id, title, kind, url, note, created_by,
                   created_at::text, updated_at::text`,
        [
          teamId,
          parsedBody.data.title,
          parsedBody.data.kind,
          normalizedUrl,
          parsedBody.data.note ?? null,
          auth.user.id,
        ],
      );
      return result.rows[0] ?? null;
    });

    if (!created) {
      return NextResponse.json(
        { error: "ไม่พบทีมหรือคุณไม่มีสิทธิ์เพิ่มลิงก์ในทีมนี้" },
        { status: 404 },
      );
    }
    return NextResponse.json({ deliverable: created }, { status: 201 });
  } catch (error) {
    logError("[api/teams/deliverables] POST error", error);
    return NextResponse.json(
      { error: "เพิ่มลิงก์ผลงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
