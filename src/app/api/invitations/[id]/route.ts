import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { withUserDb } from "@/lib/db/pool";
import {
  invitationActionSchema,
  respondToInvitation,
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
  logError("[api/invitations/[id]] failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const limit = await consumeRateLimit(
    `student-team-response:${auth.user.id}`,
    30,
    60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "ตอบรับรายการเร็วเกินไป กรุณาลองใหม่ภายหลัง" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "รหัสคำเชิญไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = invitationActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ข้อมูลการตอบรับไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const result = await withUserDb(auth.user.id, (client) =>
      respondToInvitation(client, {
        invitationId: id,
        userId: auth.user.id,
        action: parsed.data.action,
      }),
    );
    if (result.notice) {
      await writeRecruitmentNotice(result.notice);
    }
    return NextResponse.json({ invitation: result.invitation });
  } catch (error) {
    return errorResponse(error, "ไม่สามารถตอบรับคำเชิญได้");
  }
}
