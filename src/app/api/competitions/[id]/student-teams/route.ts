import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser, requireTeacherUser } from "@/lib/auth/cookies";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import {
  applyTeacherControl,
  createStudentDraftTeam,
  loadStudentTeamsData,
  StudentTeamError,
  teacherControlSchema,
  createStudentTeamSchema,
} from "@/lib/db/student-teams";
import { withUserDb } from "@/lib/db/pool";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

function isCheckViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return Reflect.get(error, "code") === "check_violation";
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof StudentTeamError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (isCheckViolation(error)) {
    return NextResponse.json(
      { error: "จำนวนสมาชิกไม่เป็นไปตามที่รายการแข่งขันกำหนด" },
      { status: 400 },
    );
  }
  logError("[api/competitions/[id]/student-teams] failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

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
    return NextResponse.json(
      { error: "รหัสรายการแข่งขันไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const payload = await withUserDb(auth.user.id, (client) =>
      loadStudentTeamsData(client, id, auth.user.id, auth.user.role),
    );
    if (!payload) {
      return NextResponse.json(
        { error: "ไม่พบรายการแข่งขันนี้" },
        { status: 404 },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error, "ไม่สามารถโหลดข้อมูลการจัดทีมได้");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (auth.user.role !== "student") {
    return NextResponse.json(
      { error: "เฉพาะนักเรียนเท่านั้นที่ตั้งทีมได้" },
      { status: 403 },
    );
  }

  const limit = await consumeRateLimit(
    `student-team-create:${auth.user.id}`,
    10,
    60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "สร้างทีมเร็วเกินไป กรุณาลองใหม่ภายหลัง" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "รหัสรายการแข่งขันไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = createStudentTeamSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลทีมไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const team = await withUserDb(auth.user.id, (client) =>
      createStudentDraftTeam(client, {
        competitionId: id,
        userId: auth.user.id,
        name: parsed.data.name,
        role: parsed.data.role,
      }),
    );
    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "ไม่สามารถสร้างทีมได้");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "รหัสรายการแข่งขันไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = teacherControlSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    const result = await withUserDb(auth.user.id, (client) =>
      applyTeacherControl(client, id, parsed.data),
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "ไม่สามารถบันทึกการตั้งค่าทีมได้");
  }
}
