import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { withUserDb } from "@/lib/db/pool";
import {
  createTeamOpenRole,
  deleteTeamOpenRole,
  listTeamOpenRoles,
  openRoleCreateSchema,
  openRoleUpdateSchema,
  StudentTeamError,
  updateTeamOpenRole,
} from "@/lib/db/student-teams";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof StudentTeamError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  logError("[api/teams/[id]/open-roles] failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new StudentTeamError(400, "รูปแบบข้อมูลไม่ถูกต้อง");
  }
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
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const openRoles = await withUserDb(auth.user.id, (client) =>
      listTeamOpenRoles(client, id),
    );
    return NextResponse.json({ openRoles });
  } catch (error) {
    return errorResponse(error, "ไม่สามารถโหลดตำแหน่งที่เปิดรับได้");
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
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }

  const limit = await consumeRateLimit(
    `student-team-role-edit:${auth.user.id}`,
    30,
    60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "แก้ไขตำแหน่งเร็วเกินไป กรุณาลองใหม่ภายหลัง" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  try {
    const parsed = openRoleCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "ข้อมูลตำแหน่งไม่ถูกต้อง" },
        { status: 400 },
      );
    }
    const openRole = await withUserDb(auth.user.id, (client) =>
      createTeamOpenRole(client, {
        teamId: id,
        userId: auth.user.id,
        role: parsed.data.role,
        slots: parsed.data.slots,
        note: parsed.data.note ?? null,
      }),
    );
    return NextResponse.json({ openRole }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "ไม่สามารถเพิ่มตำแหน่งที่เปิดรับได้");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id: teamId } = await context.params;
  if (!uuidSchema.safeParse(teamId).success) {
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const parsed = openRoleUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "ข้อมูลตำแหน่งไม่ถูกต้อง" },
        { status: 400 },
      );
    }
    const openRole = await withUserDb(auth.user.id, (client) =>
      updateTeamOpenRole(client, {
        teamId,
        userId: auth.user.id,
        roleId: parsed.data.role_id,
        role: parsed.data.role,
        slots: parsed.data.slots,
        status: parsed.data.status,
        note: parsed.data.note,
      }),
    );
    return NextResponse.json({ openRole });
  } catch (error) {
    return errorResponse(error, "ไม่สามารถแก้ไขตำแหน่งที่เปิดรับได้");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id: teamId } = await context.params;
  if (!uuidSchema.safeParse(teamId).success) {
    return NextResponse.json({ error: "รหัสทีมไม่ถูกต้อง" }, { status: 400 });
  }

  const roleId = new URL(request.url).searchParams.get("role_id");
  if (!roleId || !uuidSchema.safeParse(roleId).success) {
    return NextResponse.json(
      { error: "รหัสตำแหน่งไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  try {
    await withUserDb(auth.user.id, (client) =>
      deleteTeamOpenRole(client, {
        teamId,
        userId: auth.user.id,
        roleId,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "ไม่สามารถลบตำแหน่งที่เปิดรับได้");
  }
}
