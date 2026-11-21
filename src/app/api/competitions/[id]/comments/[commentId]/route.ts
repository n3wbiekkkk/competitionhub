import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacherUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import type { CompetitionComment } from "@/types/database";

const uuidSchema = z.string().uuid();
const patchSchema = z.object({ is_pinned: z.boolean() });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; commentId: string }> },
) {
  const auth = await requireTeacherUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id, commentId } = await context.params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(commentId).success) {
    return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const comment = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query<CompetitionComment>(
      `update public.competition_comments
       set is_pinned = $1
       where id = $2 and competition_id = $3
       returning id, competition_id, author_id, body, is_pinned, is_official, created_at::text`,
      [parsed.data.is_pinned, commentId, id],
    );
    return result.rows[0] ?? null;
  });

  if (!comment) {
    return NextResponse.json({ error: "ไม่พบความเห็นนี้" }, { status: 404 });
  }
  return NextResponse.json({ comment });
}
