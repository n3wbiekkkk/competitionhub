import { NextResponse } from "next/server";
import { z } from "zod";
import { deliverableInputSchema } from "@/lib/ai/prep-studio";
import {
  DELIVERABLE_KINDS,
  type DeliverableKind,
  type TeamDeliverable,
} from "@/components/prep-studio/shared";
import { requireAuthUser } from "@/lib/auth/cookies";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { withUserDb } from "@/lib/db/pool";
import { validatePublicHttpUrl } from "@/lib/utils/url-safety";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const patchSchema = deliverableInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "กรุณาระบุข้อมูลที่ต้องการแก้ไขอย่างน้อย 1 รายการ",
);

function parseUuid(value: string): string | null {
  const parsed = z.string().uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isDeliverableKind(value: string): value is DeliverableKind {
  return (DELIVERABLE_KINDS as readonly string[]).includes(value);
}

export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; deliverableId: string }> },
) {
  const { id, deliverableId } = await params;
  const teamId = parseUuid(id);
  const itemId = parseUuid(deliverableId);
  if (!teamId || !itemId) {
    return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
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
        error: "แก้ไขลิงก์ผลงานมากเกินไป กรุณารอสักครู่แล้วลองใหม่",
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
  const parsedBody = patchSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  const data = parsedBody.data;
  if (data.kind !== undefined && !isDeliverableKind(data.kind)) {
    return NextResponse.json({ error: "ประเภทผลงานไม่ถูกต้อง" }, { status: 400 });
  }
  const normalizedUrl =
    data.url === undefined
      ? null
      : validatePublicHttpUrl(data.url).toString();

  try {
    const updated = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query<TeamDeliverable>(
        `UPDATE public.team_deliverables
         SET title = COALESCE($3, title),
             kind = COALESCE($4, kind),
             url = COALESCE($5, url),
             note = CASE WHEN $6 THEN $7 ELSE note END,
             updated_at = now()
         WHERE team_id = $1 AND id = $2
         RETURNING id, team_id, title, kind, url, note, created_by,
                   created_at::text, updated_at::text`,
        [
          teamId,
          itemId,
          data.title ?? null,
          data.kind ?? null,
          normalizedUrl,
          Object.prototype.hasOwnProperty.call(data, "note"),
          data.note ?? null,
        ],
      );
      return result.rows[0] ?? null;
    });

    if (!updated) {
      return NextResponse.json(
        { error: "ไม่พบลิงก์ผลงานหรือคุณไม่มีสิทธิ์แก้ไข" },
        { status: 404 },
      );
    }
    return NextResponse.json({ deliverable: updated });
  } catch (error) {
    logError("[api/teams/deliverables] PATCH error", error);
    return NextResponse.json(
      { error: "แก้ไขลิงก์ผลงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; deliverableId: string }> },
) {
  const { id, deliverableId } = await params;
  const teamId = parseUuid(id);
  const itemId = parseUuid(deliverableId);
  if (!teamId || !itemId) {
    return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
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
        error: "ลบลิงก์ผลงานมากเกินไป กรุณารอสักครู่แล้วลองใหม่",
        retryAfterSeconds: rate.retryAfterSeconds,
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  try {
    const deleted = await withUserDb(auth.user.id, async (client) => {
      const result = await client.query(
        `DELETE FROM public.team_deliverables
         WHERE team_id = $1 AND id = $2`,
        [teamId, itemId],
      );
      return (result.rowCount ?? 0) > 0;
    });

    if (!deleted) {
      return NextResponse.json(
        { error: "ไม่พบลิงก์ผลงานหรือคุณไม่มีสิทธิ์ลบ" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("[api/teams/deliverables] DELETE error", error);
    return NextResponse.json(
      { error: "ลบลิงก์ผลงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }
}
