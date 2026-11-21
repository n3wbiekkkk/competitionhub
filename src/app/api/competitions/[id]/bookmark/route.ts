import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";

const uuidSchema = z.string().uuid();

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
  const bookmarked = await withUserDb(auth.user.id, async (client) => {
    const res = await client.query(
      `select 1 from public.competition_bookmarks
       where user_id = $1 and competition_id = $2
       limit 1`,
      [auth.user.id, id],
    );
    return (res.rowCount ?? 0) > 0;
  });
  return NextResponse.json({ bookmarked });
}

export async function POST(
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
  await withUserDb(auth.user.id, async (client) => {
    await client.query(
      `insert into public.competition_bookmarks (user_id, competition_id)
       values ($1, $2) on conflict do nothing`,
      [auth.user.id, id],
    );
  });
  return NextResponse.json({ ok: true }, { status: 201 });
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
    return NextResponse.json({ error: "รหัสรายการไม่ถูกต้อง" }, { status: 400 });
  }
  await withUserDb(auth.user.id, async (client) => {
    await client.query(
      "delete from public.competition_bookmarks where user_id = $1 and competition_id = $2",
      [auth.user.id, id],
    );
  });
  return NextResponse.json({ ok: true });
}
