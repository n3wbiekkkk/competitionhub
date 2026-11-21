import { NextResponse } from "next/server";
import { z } from "zod";
import { getTyphoonConfig, isTyphoonConfigured } from "@/lib/ai/opentyphoon";
import {
  buildReviewInput,
  computeInputHash,
  createRubricReviewPlan,
  findCachedPlan,
  findLatestPlan,
  loadPrepTeamContext,
  rubricPlanSchema,
  savePrepPlan,
} from "@/lib/ai/prep-studio";
import { requireAuthUser } from "@/lib/auth/cookies";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { withUserDb } from "@/lib/db/pool";
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
    const result = await withUserDb(auth.user.id, async (client) => {
      const context = await loadPrepTeamContext(client, teamId);
      if (!context) return null;
      const model = getTyphoonConfig().textModel;
      const inputHash = computeInputHash(buildReviewInput(context, model));
      const latest = await findLatestPlan(client, {
        teamId,
        kind: "rubric_review",
      });
      return { latest, inputHash };
    });

    if (!result) {
      return NextResponse.json(
        { error: "ไม่พบทีมหรือคุณไม่มีสิทธิ์เข้าถึงทีมนี้" },
        { status: 404 },
      );
    }

    const parsed = result.latest && rubricPlanSchema.safeParse(result.latest.plan);
    return NextResponse.json({
      plan: parsed?.success ? parsed.data : null,
      inputHash: result.inputHash,
      stale: result.latest ? result.latest.inputHash !== result.inputHash : true,
    });
  } catch (error) {
    logError("[api/teams/ai-review] GET error", error);
    return NextResponse.json(
      { error: "ไม่สามารถโหลดผลตรวจผลงานได้ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}

export async function POST(
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

  const rate = await consumeRateLimit(
    `prep:review:${auth.user.id}`,
    12,
    3_600_000,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "ตรวจผลงานด้วย AI มากเกินไป กรุณารอสักครู่แล้วลองใหม่",
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

  try {
    const model = getTyphoonConfig().textModel;
    const prepared = await withUserDb(auth.user.id, async (client) => {
      const context = await loadPrepTeamContext(client, teamId);
      if (!context) return null;
      const inputHash = computeInputHash(buildReviewInput(context, model));
      const cached = await findCachedPlan(client, {
        teamId,
        kind: "rubric_review",
        inputHash,
      });
      return { context, inputHash, cached };
    });

    if (!prepared) {
      return NextResponse.json(
        { error: "ไม่พบทีมหรือคุณไม่มีสิทธิ์เข้าถึงทีมนี้" },
        { status: 404 },
      );
    }

    if (prepared.cached) {
      const cachedPlan = rubricPlanSchema.safeParse(prepared.cached.plan);
      if (cachedPlan.success) {
        return NextResponse.json({
          plan: cachedPlan.data,
          cached: true,
          inputHash: prepared.inputHash,
        });
      }
    }

    const plan = await createRubricReviewPlan({ context: prepared.context });
    await withUserDb(auth.user.id, async (client) => {
      await savePrepPlan(client, {
        teamId,
        kind: "rubric_review",
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
    logError("[api/teams/ai-review] POST error", error);
    return NextResponse.json(
      { error: "ตรวจผลงานด้วย AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
