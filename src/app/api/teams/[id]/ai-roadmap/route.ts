import { NextResponse } from "next/server";
import { z } from "zod";
import { getTyphoonConfig, isTyphoonConfigured } from "@/lib/ai/opentyphoon";
import {
  buildRoadmapInput,
  computeInputHash,
  createRoadmapPlan,
  decideWeekCount,
  findCachedPlan,
  findLatestPlan,
  loadPrepTeamContext,
  parseStoredRoadmapPlan,
  savePrepPlan,
} from "@/lib/ai/prep-studio";
import { requireAuthUser } from "@/lib/auth/cookies";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { withUserDb } from "@/lib/db/pool";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    weeks: z.number().int().min(2).max(8).optional(),
  })
  .strict();

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
    const result = await withUserDb(auth.user.id, async (client) => {
      const context = await loadPrepTeamContext(client, teamId);
      if (!context) return null;
      const weekCount = decideWeekCount(context.deadline, context.todayIso);
      const model = getTyphoonConfig().textModel;
      const inputHash = computeInputHash(
        buildRoadmapInput(context, weekCount, model),
      );
      const latest = await findLatestPlan(client, { teamId, kind: "roadmap" });
      return { latest, inputHash };
    });

    if (!result) {
      return NextResponse.json(
        { error: "ไม่พบทีมหรือคุณไม่มีสิทธิ์เข้าถึงทีมนี้" },
        { status: 404 },
      );
    }

    const plan =
      result.latest && parseStoredRoadmapPlan(result.latest.plan);
    return NextResponse.json({
      plan,
      inputHash: result.inputHash,
      stale: result.latest ? result.latest.inputHash !== result.inputHash : true,
    });
  } catch (error) {
    logError("[api/teams/ai-roadmap] GET error", error);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดแผนการแข่งขันได้ กรุณาลองใหม่อีกครั้ง" },
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
    `prep:roadmap:${auth.user.id}`,
    12,
    3_600_000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "สร้างแผนด้วย AI มากเกินไป กรุณารอสักครู่แล้วลองใหม่",
        retryAfterSeconds: rate.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  if (!isTyphoonConfigured()) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่าบริการวิเคราะห์อัตโนมัติในระบบ" },
      { status: 503 },
    );
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
    const model = getTyphoonConfig().textModel;
    const prepared = await withUserDb(auth.user.id, async (client) => {
      const context = await loadPrepTeamContext(client, teamId);
      if (!context) return null;
      const weekCount = decideWeekCount(
        context.deadline,
        context.todayIso,
        parsedBody.data.weeks,
      );
      const inputHash = computeInputHash(
        buildRoadmapInput(context, weekCount, model),
      );
      const cached = await findCachedPlan(client, {
        teamId,
        kind: "roadmap",
        inputHash,
      });
      return { context, weekCount, inputHash, cached };
    });

    if (!prepared) {
      return NextResponse.json(
        { error: "ไม่พบทีมหรือคุณไม่มีสิทธิ์เข้าถึงทีมนี้" },
        { status: 404 },
      );
    }

    if (prepared.cached) {
      const cachedPlan = parseStoredRoadmapPlan(prepared.cached.plan);
      if (cachedPlan) {
        return NextResponse.json({
          plan: cachedPlan,
          cached: true,
          inputHash: prepared.inputHash,
        });
      }
    }

    const plan = await createRoadmapPlan({
      context: prepared.context,
      weekCount: prepared.weekCount,
    });

    await withUserDb(auth.user.id, async (client) => {
      await savePrepPlan(client, {
        teamId,
        kind: "roadmap",
        inputHash: prepared.inputHash,
        model,
        plan,
        userId: auth.user.id,
      });
    });

    return NextResponse.json({
      plan,
      cached: false,
      inputHash: prepared.inputHash,
    });
  } catch (error) {
    logError("[api/teams/ai-roadmap] POST error", error);
    return NextResponse.json(
      { error: "สร้างแผนการแข่งขันด้วย AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
