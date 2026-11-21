import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { withUserDb } from "@/lib/db/pool";
import {
  createJoinRequest,
  joinRoleRequestSchema,
  StudentTeamError,
  writeRecruitmentNotice,
} from "@/lib/db/student-teams";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof StudentTeamError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  logError("[api/teams/[id]/open-roles/[roleId]/requests] failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; roleId: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "student") {
    return NextResponse.json(
      { error: "เฉพาะนักเรียนเท่านั้นที่ขอเข้าร่วมทีมได้" },
      { status: 403 },
    );
  }

  const limit = await consumeRateLimit(
    `student-team-join:${auth.user.id}`,
    20,
    60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "ส่งคำขอเร็วเกินไป กรุณาลองใหม่ภายหลัง" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const { id: teamId, roleId } = await context.params;
  if (!uuidSchema.safeParse(teamId).success || !uuidSchema.safeParse(roleId).success) {
    return NextResponse.json(
      { error: "รหัสทีมหรือตำแหน่งไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = joinRoleRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลคำขอไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const result = await withUserDb(auth.user.id, (client) =>
      createJoinRequest(client, {
        teamId,
        openRoleId: roleId,
        senderId: auth.user.id,
        note: parsed.data.note ?? null,
      }),
    );
    await writeRecruitmentNotice(result.notice);
    return NextResponse.json(
      { invitation: result.invitation },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "ไม่สามารถส่งคำขอเข้าทีมได้");
  }
}
