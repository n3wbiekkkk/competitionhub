import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import type { Interest } from "@/types/database";

const uuidSchema = z.string().uuid();

const expressInterestSchema = z.object({
  preferred_role: z
    .string()
    .trim()
    .min(1, "กรุณาเลือกบทบาทที่ต้องการในทีม")
    .max(60),
  note: z.string().trim().max(1000).nullable().optional(),
});

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
    return NextResponse.json(
      { error: "รหัสรายการแข่งขันไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "รูปแบบข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const parsed = expressInterestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "ข้อมูลไม่ครบถ้วน";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const result = await withUserDb(auth.user.id, async (client) => {
      const compRes = await client.query<{ status: string }>(
        "SELECT status FROM public.competitions WHERE id = $1 LIMIT 1",
        [id],
      );
      const comp = compRes.rows[0];
      if (!comp) {
        return { kind: "not_found" as const };
      }
      if (comp.status !== "open") {
        return { kind: "closed" as const };
      }

      const upsertRes = await client.query<Interest>(
        `INSERT INTO public.interests (user_id, competition_id, preferred_role, note)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, competition_id)
         DO UPDATE SET
           preferred_role = EXCLUDED.preferred_role,
           note = EXCLUDED.note
         RETURNING id, user_id, competition_id, preferred_role, note, created_at::text`,
        [
          auth.user.id,
          id,
          parsed.data.preferred_role,
          parsed.data.note?.trim() || null,
        ],
      );
      return { kind: "ok" as const, interest: upsertRes.rows[0] };
    });

    if (result.kind === "not_found") {
      return NextResponse.json(
        { error: "ไม่พบรายการแข่งขันนี้" },
        { status: 404 },
      );
    }
    if (result.kind === "closed") {
      return NextResponse.json(
        { error: "รายการแข่งขันนี้ปิดรับสมัครแล้ว" },
        { status: 400 },
      );
    }

    return NextResponse.json({ interest: result.interest });
  } catch (error) {
    console.error("[api/competitions/[id]/interest] POST error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถบันทึกความสนใจแข่งขันได้" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const deleted = await withUserDb(auth.user.id, async (client) => {
      const res = await client.query(
        "DELETE FROM public.interests WHERE user_id = $1 AND competition_id = $2",
        [auth.user.id, id],
      );
      return res.rowCount ?? 0;
    });

    if (deleted === 0) {
      return NextResponse.json(
        { error: "ไม่สามารถยกเลิกการลงชื่อได้ (อาจปิดรับสมัครแล้ว)" },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/competitions/[id]/interest] DELETE error:", error);
    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกการลงชื่อได้" },
      { status: 500 },
    );
  }
}
