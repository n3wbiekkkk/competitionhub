import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import type { CompetitionComment } from "@/types/database";

const uuidSchema = z.string().uuid();
const bodySchema = z.object({
  body: z.string().trim().min(2, "กรุณาพิมพ์คำถามหรือข้อความอย่างน้อย 2 ตัวอักษร").max(2000),
});

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
    return NextResponse.json({ error: "รหัสรายการไม่ถูกต้อง" }, { status: 400 });
  }
  const comments = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query<CompetitionComment>(
      `select id, competition_id, author_id, body, is_pinned, is_official, created_at::text
       from public.competition_comments
       where competition_id = $1
       order by is_pinned desc, created_at asc
       limit 200`,
      [id],
    );
    return result.rows;
  });
  return NextResponse.json({ comments });
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
    return NextResponse.json({ error: "รหัสรายการไม่ถูกต้อง" }, { status: 400 });
  }
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  }
  const comment = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query<CompetitionComment>(
      `insert into public.competition_comments (competition_id, author_id, body, is_official)
       values ($1, $2, $3, $4)
       returning id, competition_id, author_id, body, is_pinned, is_official, created_at::text`,
      [id, auth.user.id, parsed.data.body, auth.user.role === "teacher"],
    );
    return result.rows[0];
  });
  return NextResponse.json({ comment }, { status: 201 });
}
